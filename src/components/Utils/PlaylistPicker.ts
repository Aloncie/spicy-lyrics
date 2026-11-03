import Logger from "../../utils/Logger.ts";
import { isExperimentEnabled, onExperimentChange } from "../../utils/experiments.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { PageContainer } from "../Pages/PageView.ts";
import { SetControlsDragLock } from "./Fullscreen.ts";

const pickerLogger = new Logger("Playlist Picker");

/*
 * Fullscreen "Add to playlist" picker. Spotify's own menu lives in the main view,
 * which fullscreen hides, so the list is drawn over the artwork instead. It sits in
 * .MediaBox (not .MediaContent) so it survives NowBar rebuilding MediaContent and so
 * its backdrop blur can reach the artwork through MediaContent's opacity layer.
 *
 * With the playlistMembership experiment on, each row is a checkbox that shows whether
 * the track is already there and toggles it (add or remove) without closing the list.
 * With it off, a click adds the track and closes the list. The mode is read once per
 * open, since the rows' markup differs.
 */

type PickerPlaylist = { uri: string; name: string; image?: string; liked?: boolean };

/** Whether the current track is in a playlist, and how many songs it holds (null: unknown). */
type MembershipInfo = { has: boolean; count: number | null };
type Membership = Map<string, MembershipInfo>;

type RootlistItem = {
  type?: string;
  uri?: string;
  name?: string;
  images?: { url?: string }[];
  isOwnedBySelf?: boolean;
  isCollaborative?: boolean;
  canAdd?: boolean;
  items?: RootlistItem[];
};

// Liked Songs is a library collection, not a playlist: it has its own API, and the
// uri is only a key for the row.
const LIKED_ENTRY: PickerPlaylist = {
  uri: "spotify:collection:tracks",
  name: "Liked Songs",
  liked: true,
};

const HEART_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15.724 4.22A4.313 4.313 0 0 0 12.192.814a4.269 4.269 0 0 0-3.622 1.13.837.837 0 0 1-1.14 0 4.272 4.272 0 0 0-6.21 5.855l5.916 7.05a1.128 1.128 0 0 0 1.727 0l5.916-7.05a4.228 4.228 0 0 0 .945-3.577z"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.985 2.383L5.127 12.754 1.388 8.375l-.658.563 4.397 5.149 9.514-11.139z"/></svg>`;

let panel: HTMLElement | null = null;
let anchorButton: HTMLElement | null = null;
let teardown: (() => void) | null = null;

function imageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("spotify:image:")) return `https://i.scdn.co/image/${url.slice(14)}`;
  // Playlists without a custom cover get a 2×2 grid of their first albums.
  if (url.startsWith("spotify:mosaic:")) {
    return `https://mosaic.scdn.co/300/${url.slice(15).split(":").join("")}`;
  }
  return url;
}

function collectPlaylists(items: RootlistItem[] | undefined, out: PickerPlaylist[]) {
  for (const item of items ?? []) {
    if (item.type === "folder") {
      collectPlaylists(item.items, out);
      continue;
    }
    if (item.type !== "playlist" || !item.uri) continue;
    // Only playlists the user can write to. Older clients don't report canAdd,
    // so fall back to ownership there.
    const writable =
      typeof item.canAdd === "boolean"
        ? item.canAdd
        : item.isOwnedBySelf !== false || item.isCollaborative === true;
    if (!writable) continue;
    out.push({
      uri: item.uri,
      name: item.name ?? "Untitled",
      image: imageUrl(item.images?.[0]?.url),
    });
  }
}

async function getWritablePlaylists(): Promise<PickerPlaylist[]> {
  const root = await Spicetify.Platform.RootlistAPI.getContents({ flatten: true });
  const out: PickerPlaylist[] = [];
  collectPlaylists(root?.items, out);
  // flatten can still list a playlist under several folders on some builds.
  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.uri) && seen.add(p.uri));
}

async function playlistHasTrack(playlistUri: string, trackUri: string): Promise<boolean> {
  try {
    const contents = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri, {
      limit: 10000,
    });
    const items: { uri?: string }[] = contents?.items ?? [];
    return items.some((i) => i?.uri === trackUri);
  } catch {
    // The check only saves a duplicate; never block the add on it.
    return false;
  }
}

async function addTrack(playlistUri: string, trackUri: string): Promise<void> {
  await Spicetify.Platform.PlaylistAPI.add(playlistUri, [trackUri], { after: "end" });
}

/**
 * Where the track stands in one playlist, read fresh. `uids` are the entries holding it
 * (the same track can be in a playlist twice) — removing needs them, not just the uri.
 */
async function readMembership(
  entry: PickerPlaylist,
  trackUri: string
): Promise<{ uids: string[]; has: boolean; count: number | null }> {
  if (entry.liked) {
    const result = await Spicetify.Platform.LibraryAPI.contains(trackUri);
    const has = Array.isArray(result) ? !!result[0] : !!result;
    return { uids: [], has, count: null };
  }
  const contents = await Spicetify.Platform.PlaylistAPI.getContents(entry.uri, { limit: 10000 });
  const items: { uri?: string; uid?: string }[] = contents?.items ?? [];
  const matches = items.filter((i) => i?.uri === trackUri);
  return {
    uids: matches.map((i) => i.uid).filter((uid): uid is string => !!uid),
    has: matches.length > 0,
    count: items.length,
  };
}

async function addToEntry(entry: PickerPlaylist, trackUri: string): Promise<void> {
  if (entry.liked) await Spicetify.Platform.LibraryAPI.add({ uris: [trackUri] });
  else await addTrack(entry.uri, trackUri);
}

async function removeFromEntry(
  entry: PickerPlaylist,
  trackUri: string,
  uids: string[]
): Promise<void> {
  if (entry.liked) {
    await Spicetify.Platform.LibraryAPI.remove({ uris: [trackUri] });
    return;
  }
  if (uids.length === 0) throw new Error("No playlist entry to remove");
  await Spicetify.Platform.PlaylistAPI.remove(
    entry.uri,
    uids.map((uid) => ({ uri: trackUri, uid }))
  );
}

function setStatus(
  row: HTMLElement,
  state: "busy" | "added" | "exists" | "error",
  text: string
) {
  row.dataset.state = state;
  const status = row.querySelector<HTMLElement>(".SL_PP_Status");
  if (status) status.textContent = text;
}

function metaText(entry: PickerPlaylist, count: number | null): string {
  if (count === null) return entry.liked ? "Saved songs" : "";
  return `${count} song${count === 1 ? "" : "s"}`;
}

/** Brings a membership row in line with what is known about its playlist. */
function applyMembership(row: HTMLElement, entry: PickerPlaylist, info: MembershipInfo | undefined) {
  const has = !!info?.has;
  row.dataset.checked = String(has);
  row.setAttribute("aria-checked", String(has));
  delete row.dataset.state;
  const status = row.querySelector<HTMLElement>(".SL_PP_Status");
  if (status) status.textContent = "";
  const meta = row.querySelector<HTMLElement>(".SL_PP_Meta");
  if (meta) meta.textContent = metaText(entry, info?.count ?? null);
}

function createRow(
  playlist: PickerPlaylist,
  manage: boolean,
  info: MembershipInfo | undefined
): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "SL_PP_Item";
  row.dataset.uri = playlist.uri;

  const art = document.createElement("span");
  art.className = "SL_PP_Art";
  if (playlist.liked) {
    art.classList.add("SL_PP_ArtLiked");
    art.innerHTML = HEART_ICON;
  } else if (playlist.image) {
    const img = document.createElement("img");
    img.src = playlist.image;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    art.appendChild(img);
  }

  const name = document.createElement("span");
  name.className = "SL_PP_Name";
  name.textContent = playlist.name;

  const status = document.createElement("span");
  status.className = "SL_PP_Status";

  if (!manage) {
    row.append(art, name, status);
    return row;
  }

  row.setAttribute("role", "checkbox");
  const main = document.createElement("span");
  main.className = "SL_PP_Main";
  const meta = document.createElement("span");
  meta.className = "SL_PP_Meta";
  main.append(name, meta);

  const check = document.createElement("span");
  check.className = "SL_PP_Check";
  check.innerHTML = CHECK_ICON;

  row.append(art, main, status, check);
  applyMembership(row, playlist, info);
  return row;
}

function createSection(label: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "SL_PP_Section";
  section.textContent = label;
  return section;
}

function renderList(
  list: HTMLElement,
  playlists: PickerPlaylist[],
  query: string,
  manage: boolean,
  membership: Membership
) {
  const q = query.trim().toLowerCase();
  const shown = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists;
  list.replaceChildren();

  if (shown.length === 0) {
    const empty = document.createElement("div");
    empty.className = "SL_PP_Empty";
    empty.textContent = q ? "No playlists match" : "No playlists you can add to";
    list.appendChild(empty);
    return;
  }

  if (!manage) {
    for (const playlist of shown) list.appendChild(createRow(playlist, false, undefined));
    return;
  }

  // Rows are grouped when the list is drawn (opening, searching, a new track) and stay
  // put while toggled, so a row doesn't jump away from under the pointer.
  const saved = shown.filter((p) => membership.get(p.uri)?.has);
  const others = shown.filter((p) => !membership.get(p.uri)?.has);
  const groups: [string | null, PickerPlaylist[]][] = [
    [saved.length > 0 ? "Saved in" : null, saved],
    [saved.length > 0 ? "Other playlists" : null, others],
  ];
  for (const [label, rows] of groups) {
    if (rows.length === 0) continue;
    if (label) list.appendChild(createSection(label));
    for (const playlist of rows) {
      list.appendChild(createRow(playlist, true, membership.get(playlist.uri)));
    }
  }
}

function updateTrackLabel() {
  const label = panel?.querySelector<HTMLElement>(".SL_PP_Track");
  if (!label) return;
  const artists = SpotifyPlayer.GetArtists()
    ?.map((a) => a.name)
    .join(", ");
  label.textContent = [SpotifyPlayer.GetName(), artists].filter(Boolean).join(" · ");
}

// Turning the experiment off hides the picker through CSS; close it too, or the
// controls would stay locked visible until fullscreen closes.
onExperimentChange((experiment) => {
  if (experiment.id === "playlistMembership") {
    ClosePlaylistPicker();
    return;
  }
  if (experiment.id !== "fullscreenAddToPlaylist") return;
  if (!isExperimentEnabled("fullscreenAddToPlaylist")) ClosePlaylistPicker();
});

export function IsPlaylistPickerOpen(): boolean {
  return panel !== null;
}

export function ClosePlaylistPicker() {
  if (!panel) return;
  const closing = panel;
  panel = null;
  teardown?.();
  teardown = null;
  anchorButton?.classList.remove("Active");
  anchorButton = null;
  SetControlsDragLock(false);

  closing.classList.remove("Visible");
  const remove = () => closing.remove();
  closing.addEventListener("transitionend", remove, { once: true });
  // transitionend never fires under reduced motion or if the node was detached.
  setTimeout(remove, 250);
}

export function TogglePlaylistPicker(button: HTMLElement) {
  if (panel) {
    ClosePlaylistPicker();
    return;
  }
  OpenPlaylistPicker(button);
}

function OpenPlaylistPicker(button: HTMLElement) {
  if (SpotifyPlayer.GetContentType() === "episode") return;
  const mediaBox = PageContainer?.querySelector<HTMLElement>(
    ".ContentBox .NowBar .Header .MediaBox"
  );
  if (!mediaBox) return;

  const manage = isExperimentEnabled("playlistMembership");

  const root = document.createElement("div");
  root.className = "SL_PlaylistPicker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Add to playlist");
  root.innerHTML = `
    <div class="SL_PP_Header">
      <span class="SL_PP_Title">Add to playlist</span>
      <span class="SL_PP_Track"></span>
    </div>
    <input class="SL_PP_Search" type="text" placeholder="Find a playlist" spellcheck="false" autocomplete="off" />
    <div class="SL_PP_List"><div class="SL_PP_Empty">Loading playlists…</div></div>
  `;

  const search = root.querySelector<HTMLInputElement>(".SL_PP_Search")!;
  const list = root.querySelector<HTMLElement>(".SL_PP_List")!;

  panel = root;
  anchorButton = button;
  button.classList.add("Active");
  mediaBox.appendChild(root);
  updateTrackLabel();
  // Keep the controls lit while the picker is up; they fade out after 750 ms idle.
  SetControlsDragLock(true);
  requestAnimationFrame(() => root.classList.add("Visible"));

  let playlists: PickerPlaylist[] = [];
  const membership: Membership = new Map();
  let busy = false;
  // Rows being toggled; each toggles on its own, so several can be in flight.
  const pending = new Set<string>();
  // Bumped when the track changes, so an add that finishes after the track moved
  // on doesn't report on (or close the list for) the new track. A song repeating
  // also fires a song change, but with the same uri, and doesn't count.
  let songVersion = 0;
  let songUri = SpotifyPlayer.GetUri();

  const render = () => renderList(list, playlists, search.value, manage, membership);

  // Loads the playlists once, then (in membership mode) where the current track
  // stands in each of them, all at once. A playlist that fails to read just shows
  // unchecked; toggling it reads it again.
  const refresh = async () => {
    const version = songVersion;
    const trackUri = SpotifyPlayer.GetUri();
    try {
      if (playlists.length === 0) {
        const result = await getWritablePlaylists();
        if (panel !== root) return;
        playlists = manage ? [LIKED_ENTRY, ...result] : result;
      }
      if (manage && trackUri) {
        membership.clear();
        await Promise.allSettled(
          playlists.map(async (entry) => {
            const read = await readMembership(entry, trackUri);
            if (version === songVersion) {
              membership.set(entry.uri, { has: read.has, count: read.count });
            }
          })
        );
      }
      if (panel !== root || version !== songVersion) return;
      render();
    } catch (err) {
      pickerLogger.error("Failed to load playlists", err);
      if (panel !== root) return;
      list.innerHTML = `<div class="SL_PP_Empty">Couldn't load your playlists</div>`;
    }
  };
  void refresh();

  search.addEventListener("input", render);

  // Membership mode: flip the track in the clicked playlist, judged by a fresh read
  // rather than by what the row last showed.
  const toggle = async (row: HTMLElement) => {
    const entryUri = row.dataset.uri;
    const entry = playlists.find((p) => p.uri === entryUri);
    const trackUri = SpotifyPlayer.GetUri();
    if (!entry || !trackUri || pending.has(entry.uri)) return;

    pending.add(entry.uri);
    const version = songVersion;
    const current = () => panel === root && version === songVersion;
    setStatus(row, "busy", "");
    try {
      const read = await readMembership(entry, trackUri);
      let info: MembershipInfo;
      if (read.has) {
        await removeFromEntry(entry, trackUri, read.uids);
        info = {
          has: false,
          count: read.count === null ? null : Math.max(0, read.count - read.uids.length),
        };
      } else {
        await addToEntry(entry, trackUri);
        info = { has: true, count: read.count === null ? null : read.count + 1 };
      }
      if (!current()) return;
      membership.set(entry.uri, info);
      applyMembership(row, entry, info);
    } catch (err) {
      pickerLogger.error("Failed to change playlist", err);
      if (current()) setStatus(row, "error", "Failed");
    } finally {
      pending.delete(entry.uri);
    }
  };

  // Plain mode: add the track and close.
  const addAndClose = async (row: HTMLElement) => {
    if (busy) return;
    const playlistUri = row.dataset.uri;
    const trackUri = SpotifyPlayer.GetUri();
    if (!playlistUri || !trackUri) return;

    busy = true;
    const version = songVersion;
    const current = () => panel === root && version === songVersion;
    setStatus(row, "busy", "Adding…");
    try {
      if (await playlistHasTrack(playlistUri, trackUri)) {
        if (current()) setStatus(row, "exists", "Already added");
        return;
      }
      await addTrack(playlistUri, trackUri);
      if (!current()) return;
      setStatus(row, "added", "Added");
      setTimeout(() => {
        if (current()) ClosePlaylistPicker();
      }, 650);
    } catch (err) {
      pickerLogger.error("Failed to add track", err);
      if (current()) setStatus(row, "error", "Failed");
    } finally {
      busy = false;
    }
  };

  list.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".SL_PP_Item");
    if (!row) return;
    void (manage ? toggle(row) : addAndClose(row));
  });

  // Spotify's global shortcuts (space to pause, etc.) would fire while typing.
  const stopKeys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") ClosePlaylistPicker();
  };
  root.addEventListener("keydown", stopKeys);

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    // The view controls can be rebuilt while the picker is open, so match the
    // button by id rather than by the element it was opened from.
    if (root.contains(target) || target.closest?.("#AddToPlaylist")) return;
    ClosePlaylistPicker();
  };
  document.addEventListener("pointerdown", onPointerDown, true);

  const onSongChange = () => {
    if (panel !== root) return;
    const uri = SpotifyPlayer.GetUri();
    if (uri === songUri) return;
    songUri = uri;
    songVersion++;
    updateTrackLabel();
    if (SpotifyPlayer.GetContentType() === "episode") {
      ClosePlaylistPicker();
      return;
    }
    if (manage) {
      // The checks described the previous track: read them again for this one.
      list.innerHTML = `<div class="SL_PP_Empty">Loading playlists…</div>`;
      void refresh();
      return;
    }
    // Statuses describe the previous track.
    for (const row of list.querySelectorAll<HTMLElement>(".SL_PP_Item[data-state]")) {
      delete row.dataset.state;
      const status = row.querySelector<HTMLElement>(".SL_PP_Status");
      if (status) status.textContent = "";
    }
  };
  const songChangeId = Global.Event.listen("playback:songchange", onSongChange);

  teardown = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("keydown", stopKeys);
    Global.Event.unListen(songChangeId);
  };

  setTimeout(() => {
    if (panel === root) search.focus({ preventScroll: true });
  }, 50);
}
