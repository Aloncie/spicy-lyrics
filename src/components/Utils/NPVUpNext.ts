import Global from "../Global/Global.ts";
import Whentil from "../../modules/Whentil.ts";
import Logger from "../../utils/Logger.ts";
import { $experiment, isExperimentEnabled } from "../../utils/experiments.ts";
import {
  $npvUpNextCollapsed,
  $npvUpNextCount,
  $npvUpNextTab,
  NPV_UP_NEXT_COUNTS,
  clampUpNextCount,
} from "../../utils/npvSidebarSettings.ts";
import { openSettingsPanel } from "../../utils/settings.ts";
import { Icons } from "../Styling/Icons.ts";
import { GetNPVElement, GetNPVObserverRoot } from "./NPVLyrics.ts";

/*
 * An "Up next" card for the Now Playing sidebar, in place of Spotify's "Next in
 * queue" block: several upcoming tracks (5 by default), or the ones that played
 * just before, each with a "..." menu for the things Spotify's own track menu does
 * that can be done from here. The gear on the card picks how many tracks it shows.
 *
 * Spotify's own track menu can't be reused: it only works inside Spotify's own
 * React tree, so this menu is built here from the same player and library calls.
 */

const upNextLogger = new Logger("NPV Up Next");

const CARD_CLASS = "SL_UpNext";
/** Set on <body> while the card is in the sidebar, so CSS hides Spotify's own block. */
const BODY_CLASS = "SL_NpvUpNext";

type Artist = { name?: string; uri?: string };
type Image = { url?: string; label?: string };
type QueueTrack = {
  uri?: string;
  uid?: string;
  name?: string;
  isLocal?: boolean;
  artists?: Artist[];
  images?: Image[];
  album?: { uri?: string; name?: string; images?: Image[] };
};
type Entry = { track: QueueTrack; source: "queued" | "next" | "recent" };

type MenuCtx = { show: (view: MenuView) => void; close: () => void };
type MenuItem = {
  label: string;
  /** Opens another view in the same menu instead of closing it. */
  submenu?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /** Lets `afterShow` find the row again to fill in what has to be read first. */
  id?: string;
  onSelect: (ctx: MenuCtx, row: HTMLButtonElement) => void | Promise<void>;
};
type MenuView = {
  title?: string;
  back?: () => MenuView;
  items: (MenuItem | "---")[];
  filter?: boolean;
  note?: string;
  afterShow?: (root: HTMLElement) => void;
};

let card: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let observedRoot: Element | null = null;
let frame = 0;
let renderToken = 0;
let started = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DOTS_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>`;
const CHEVRON_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M5.7 3.3a.75.75 0 0 0 0 1.06L9.34 8 5.7 11.64a.75.75 0 1 0 1.06 1.06l4.17-4.17a.75.75 0 0 0 0-1.06L6.76 3.3a.75.75 0 0 0-1.06 0z"/></svg>`;
const BACK_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M10.3 3.3a.75.75 0 0 1 0 1.06L6.66 8l3.64 3.64a.75.75 0 1 1-1.06 1.06L5.07 8.53a.75.75 0 0 1 0-1.06l4.17-4.17a.75.75 0 0 1 1.06 0z"/></svg>`;
const CHEVRON_DOWN_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3.5 6l4.5 4.5L12.5 6"/></svg>`;
const CLEAR_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8l.6-8.2M6.7 7v4M9.3 7v4"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M13.985 2.383L5.127 12.754 1.388 8.375l-.658.563 4.397 5.149 9.514-11.139z"/></svg>`;

function imageUrl(track: QueueTrack): string | undefined {
  const images = track.images?.length ? track.images : track.album?.images;
  const url = (images?.find((i) => i.label === "small") ?? images?.[0])?.url;
  if (!url) return undefined;
  if (url.startsWith("spotify:image:")) return `https://i.scdn.co/image/${url.slice(14)}`;
  return url;
}

/** spotify:artist:<id> -> /artist/<id>, the route Spotify's own links use. */
function uriToPath(uri?: string): string | null {
  const m = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(uri ?? "");
  return m ? `/${m[1]}/${m[2]}` : null;
}

function isLocalTrack(track: QueueTrack): boolean {
  return !!track.isLocal || !!track.uri?.startsWith("spotify:local:");
}

function notify(message: string, isError = false) {
  try {
    Spicetify.showNotification(message, isError);
  } catch {
    /* the notification is a courtesy */
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    Spicetify.Platform.ClipboardAPI?.copy?.(text);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function skipTo(track: QueueTrack) {
  Spicetify.Platform.PlayerAPI.skipTo({ uri: track.uri, uid: track.uid }).catch((err: unknown) =>
    upNextLogger.error("Failed to skip to track", err)
  );
}

/** A track from the history is no longer in the queue, so it starts from its uri. */
function playTrack(entry: Entry) {
  const { track } = entry;
  if (entry.source !== "recent") {
    skipTo(track);
    return;
  }
  if (!track.uri) return;
  Promise.resolve(Spicetify.Player.playUri(track.uri)).catch((err: unknown) =>
    upNextLogger.error("Failed to play track", err)
  );
}

type Playlist = { uri: string; name: string };
type RootlistItem = {
  type?: string;
  uri?: string;
  name?: string;
  items?: RootlistItem[];
  canAdd?: boolean;
  isOwnedBySelf?: boolean;
  isCollaborative?: boolean;
};

function collectPlaylists(items: RootlistItem[] | undefined, out: Playlist[]) {
  for (const item of items ?? []) {
    if (item.type === "folder") {
      collectPlaylists(item.items, out);
      continue;
    }
    if (item.type !== "playlist" || !item.uri) continue;
    // Only playlists the user can write to; older clients don't report canAdd.
    const writable =
      typeof item.canAdd === "boolean"
        ? item.canAdd
        : item.isOwnedBySelf !== false || item.isCollaborative === true;
    if (writable) out.push({ uri: item.uri, name: item.name ?? "Untitled" });
  }
}

async function getWritablePlaylists(): Promise<Playlist[]> {
  const root = await Spicetify.Platform.RootlistAPI.getContents({ flatten: true });
  const out: Playlist[] = [];
  collectPlaylists(root?.items, out);
  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.uri) && seen.add(p.uri));
}

async function playlistHasTrack(playlistUri: string, trackUri: string): Promise<boolean> {
  try {
    const contents = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri, { limit: 10000 });
    const items: { uri?: string }[] = contents?.items ?? [];
    return items.some((i) => i?.uri === trackUri);
  } catch {
    // The check only saves a duplicate; never block the add on it.
    return false;
  }
}

async function addToPlaylist(playlist: Playlist, trackUri: string) {
  try {
    if (await playlistHasTrack(playlist.uri, trackUri)) {
      notify(`Already in ${playlist.name}`);
      return;
    }
    await Spicetify.Platform.PlaylistAPI.add(playlist.uri, [trackUri], { after: "end" });
    notify(`Added to ${playlist.name}`);
  } catch (err) {
    upNextLogger.error("Failed to add to playlist", err);
    notify(`Couldn't add to ${playlist.name}`, true);
  }
}

async function toggleLiked(trackUri: string, liked: boolean) {
  try {
    if (liked) await Spicetify.Platform.LibraryAPI.remove({ uris: [trackUri] });
    else await Spicetify.Platform.LibraryAPI.add({ uris: [trackUri] });
    notify(liked ? "Removed from Liked Songs" : "Added to Liked Songs");
  } catch (err) {
    upNextLogger.error("Failed to change Liked Songs", err);
    notify("Couldn't change Liked Songs", true);
  }
}

async function changeQueue(entry: Entry) {
  const { track, source } = entry;
  if (!track.uri) return;
  try {
    if (source === "queued") {
      await Spicetify.removeFromQueue([{ uri: track.uri, uid: track.uid }] as Spicetify.ContextTrack[]);
      notify("Removed from queue");
    } else {
      await Spicetify.addToQueue([{ uri: track.uri }] as Spicetify.ContextTrack[]);
      notify("Added to queue");
    }
  } catch (err) {
    upNextLogger.error("Failed to change the queue", err);
    notify("Couldn't change the queue", true);
  }
}

/** Drops the tracks added by hand; what the playing context has coming up stays. */
async function clearQueue() {
  try {
    const queue = await Spicetify.Platform.PlayerAPI.getQueue();
    const queued = ((queue?.queued ?? []) as QueueTrack[]).filter((t) => t.uri);
    if (!queued.length) return;
    await Spicetify.removeFromQueue(
      queued.map((t) => ({ uri: t.uri, uid: t.uid })) as Spicetify.ContextTrack[]
    );
    notify("Queue cleared");
  } catch (err) {
    upNextLogger.error("Failed to clear the queue", err);
    notify("Couldn't clear the queue", true);
  }
}

function goTo(uri?: string) {
  const path = uriToPath(uri);
  if (path) Spicetify.Platform.History.push(path);
}

// ─── Menu ────────────────────────────────────────────────────────────────────

let menuEl: HTMLElement | null = null;
let menuAnchor: HTMLElement | null = null;
let menuTeardown: (() => void) | null = null;

function closeMenu() {
  menuTeardown?.();
  menuTeardown = null;
  menuEl?.remove();
  menuEl = null;
  menuAnchor?.setAttribute("aria-expanded", "false");
  menuAnchor = null;
}

function positionMenu(el: HTMLElement, anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const margin = 8;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  let left = a.right - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = a.bottom + 4;
  if (top + height > window.innerHeight - margin) top = Math.max(margin, a.top - height - 4);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function renderView(
  el: HTMLElement,
  view: MenuView,
  show: (v: MenuView) => void,
  anchor: HTMLElement
) {
  el.replaceChildren();
  const ctx: MenuCtx = { show, close: closeMenu };

  if (view.title || view.back) {
    const header = document.createElement("div");
    header.className = "SL_UN_MenuHeader";
    if (view.back) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "SL_UN_MenuBack";
      back.setAttribute("aria-label", "Back");
      back.innerHTML = BACK_ICON;
      back.addEventListener("click", () => show(view.back!()));
      header.appendChild(back);
    }
    if (view.title) {
      const title = document.createElement("span");
      title.className = "SL_UN_MenuTitle";
      title.textContent = view.title;
      header.appendChild(title);
    }
    el.appendChild(header);
  }

  const list = document.createElement("div");
  list.className = "SL_UN_MenuList";

  let filterInput: HTMLInputElement | null = null;
  if (view.filter) {
    filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.className = "SL_UN_MenuFilter";
    filterInput.placeholder = "Find";
    filterInput.setAttribute("aria-label", "Find");
    el.appendChild(filterInput);
  }

  const rows: { row: HTMLButtonElement; label: string }[] = [];
  for (const item of view.items) {
    if (item === "---") {
      const sep = document.createElement("div");
      sep.className = "SL_UN_MenuSep";
      sep.setAttribute("role", "separator");
      list.appendChild(sep);
      continue;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "SL_UN_MenuItem";
    row.setAttribute("role", "menuitem");
    if (item.id) row.dataset.id = item.id;
    row.disabled = !!item.disabled;
    const label = document.createElement("span");
    label.className = "SL_UN_MenuLabel";
    label.textContent = item.label;
    row.appendChild(label);
    if (item.checked) {
      const check = document.createElement("span");
      check.className = "SL_UN_MenuCheck";
      check.innerHTML = CHECK_ICON;
      row.appendChild(check);
    }
    if (item.submenu) {
      const arrow = document.createElement("span");
      arrow.className = "SL_UN_MenuArrow";
      arrow.innerHTML = CHEVRON_ICON;
      row.appendChild(arrow);
    }
    row.addEventListener("click", () => {
      void (async () => {
        try {
          await item.onSelect(ctx, row);
        } catch (err) {
          upNextLogger.error("Menu action failed", err);
        }
        if (!item.submenu && menuEl === el) closeMenu();
      })();
    });
    list.appendChild(row);
    rows.push({ row, label: item.label.toLowerCase() });
  }

  if (view.note) {
    const note = document.createElement("div");
    note.className = "SL_UN_MenuNote";
    note.textContent = view.note;
    list.appendChild(note);
  }
  el.appendChild(list);

  filterInput?.addEventListener("input", () => {
    const q = filterInput!.value.trim().toLowerCase();
    for (const { row, label } of rows) row.hidden = q !== "" && !label.includes(q);
  });

  view.afterShow?.(el);
  positionMenu(el, anchor);
  (filterInput ?? list.querySelector<HTMLElement>(".SL_UN_MenuItem:not(:disabled)"))?.focus({
    preventScroll: true,
  });
}

function openMenu(anchor: HTMLElement, root: () => MenuView) {
  if (menuAnchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  const el = document.createElement("div");
  el.className = "SL_UN_Menu";
  el.setAttribute("role", "menu");
  document.body.appendChild(el);
  menuEl = el;
  menuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");

  const show = (view: MenuView) => {
    if (menuEl === el) renderView(el, view, show, anchor);
  };
  show(root());

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (target && (el.contains(target) || anchor.contains(target))) return;
    closeMenu();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // Spotify's global shortcuts would otherwise fire on keys pressed in the menu.
    e.stopPropagation();
    if (e.key === "Escape") {
      closeMenu();
      anchor.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...el.querySelectorAll<HTMLElement>(".SL_UN_MenuItem:not(:disabled):not([hidden])")];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };
  const onDismiss = () => closeMenu();
  // Only the scrolling of whatever holds the row moves it out from under the menu. The
  // lyrics card in the same sidebar scrolls by itself all song long and must not count.
  const onScroll = (e: Event) => {
    const target = e.target;
    if (target instanceof Node && target.contains(anchor)) closeMenu();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  el.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onDismiss);
  window.addEventListener("blur", onDismiss);
  document.addEventListener("scroll", onScroll, true);
  menuTeardown = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    el.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onDismiss);
    window.removeEventListener("blur", onDismiss);
    document.removeEventListener("scroll", onScroll, true);
  };
}

// ─── Menu contents ───────────────────────────────────────────────────────────

function playlistView(entry: Entry, back: () => MenuView): MenuView {
  const trackUri = entry.track.uri ?? "";
  return {
    title: "Add to playlist",
    back,
    filter: true,
    items: [],
    note: "Loading…",
    afterShow: (root) => {
      void getWritablePlaylists()
        .then((playlists) => {
          const list = root.querySelector<HTMLElement>(".SL_UN_MenuList");
          if (!list || !root.isConnected || !root.querySelector(".SL_UN_MenuNote")) return;
          list.replaceChildren();
          if (!playlists.length) {
            const note = document.createElement("div");
            note.className = "SL_UN_MenuNote";
            note.textContent = "No playlists you can add to";
            list.appendChild(note);
            return;
          }
          for (const playlist of playlists) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "SL_UN_MenuItem";
            row.setAttribute("role", "menuitem");
            const label = document.createElement("span");
            label.className = "SL_UN_MenuLabel";
            label.textContent = playlist.name;
            row.appendChild(label);
            row.addEventListener("click", () => {
              closeMenu();
              void addToPlaylist(playlist, trackUri);
            });
            list.appendChild(row);
          }
          const filter = root.querySelector<HTMLInputElement>(".SL_UN_MenuFilter");
          filter?.addEventListener("input", () => {
            const q = filter.value.trim().toLowerCase();
            for (const row of list.querySelectorAll<HTMLButtonElement>(".SL_UN_MenuItem")) {
              row.hidden = q !== "" && !(row.textContent ?? "").toLowerCase().includes(q);
            }
          });
        })
        .catch((err: unknown) => {
          upNextLogger.error("Failed to load playlists", err);
          const note = root.querySelector<HTMLElement>(".SL_UN_MenuNote");
          if (note) note.textContent = "Couldn't load your playlists";
        });
    },
  };
}

function artistView(artists: Artist[], back: () => MenuView): MenuView {
  return {
    title: "Go to artist",
    back,
    items: artists.map((artist) => ({
      label: artist.name ?? "Artist",
      onSelect: () => goTo(artist.uri),
    })),
  };
}

function trackMenu(entry: Entry): MenuView {
  const { track } = entry;
  const uri = track.uri ?? "";
  const local = isLocalTrack(track);
  const artists = (track.artists ?? []).filter((a) => uriToPath(a.uri));
  const albumPath = uriToPath(track.album?.uri);

  const self = (): MenuView => trackMenu(entry);
  const items: (MenuItem | "---")[] = [];

  if (!local) {
    items.push({
      label: "Add to playlist",
      submenu: true,
      onSelect: ({ show }) => show(playlistView(entry, self)),
    });
    items.push({
      label: "Save to your Liked Songs",
      id: "liked",
      onSelect: (_ctx, row) => toggleLiked(uri, row.dataset.liked === "1"),
    });
  }
  items.push({
    label: entry.source === "queued" ? "Remove from queue" : "Add to queue",
    onSelect: () => changeQueue(entry),
  });

  const goItems: (MenuItem | "---")[] = [];
  if (artists.length === 1) {
    goItems.push({ label: "Go to artist", onSelect: () => goTo(artists[0].uri) });
  } else if (artists.length > 1) {
    goItems.push({
      label: "Go to artist",
      submenu: true,
      onSelect: ({ show }) => show(artistView(artists, self)),
    });
  }
  if (albumPath) goItems.push({ label: "Go to album", onSelect: () => goTo(track.album?.uri) });
  if (goItems.length) items.push("---", ...goItems);

  const trackPath = uriToPath(uri);
  if (!local && trackPath) {
    items.push("---", {
      label: "Copy song link",
      onSelect: async () => {
        await copyText(`https://open.spotify.com${trackPath}`);
        notify("Link copied to clipboard");
      },
    });
  }

  return {
    items,
    afterShow: (root) => {
      if (local) return;
      // Whether it is already liked has to be read first; the row says "Save" until then.
      void Promise.resolve(Spicetify.Platform.LibraryAPI.contains(uri))
        .then((result: unknown) => {
          const liked = Array.isArray(result) ? !!result[0] : !!result;
          const row = root.querySelector<HTMLButtonElement>('[data-id="liked"]');
          if (!row || !root.isConnected) return;
          row.dataset.liked = liked ? "1" : "0";
          const label = row.querySelector(".SL_UN_MenuLabel");
          if (label) label.textContent = liked ? "Remove from your Liked Songs" : "Save to your Liked Songs";
        })
        .catch((err: unknown) => upNextLogger.warn("Couldn't read the liked state", err));
    },
  };
}

function settingsMenu(): MenuView {
  const current = clampUpNextCount($npvUpNextCount.get());
  return {
    title: "Tracks shown",
    items: [
      ...NPV_UP_NEXT_COUNTS.map<MenuItem>((count) => ({
        label: `${count} tracks`,
        checked: count === current,
        onSelect: () => {
          $npvUpNextCount.set(count);
        },
      })),
      "---",
      {
        label: "More settings…",
        onSelect: () => {
          openSettingsPanel();
        },
      },
    ],
  };
}

// ─── The card ────────────────────────────────────────────────────────────────

function buildCard(): HTMLElement {
  const el = document.createElement("div");
  el.className = `main-nowPlayingView-section ${CARD_CLASS}`;
  el.innerHTML = `
    <div class="main-nowPlayingView-sectionHeader">
      <div class="SL_UN_Tabs" role="tablist" aria-label="Queue">
        <button type="button" class="SL_UN_Tab" role="tab" data-tab="next">Up next</button>
        <button type="button" class="SL_UN_Tab" role="tab" data-tab="recent">Recently played</button>
      </div>
      <div class="SL_UN_Actions">
        <button type="button" class="SL_UN_Clear" aria-label="Clear queue" title="Clear queue" disabled>${CLEAR_ICON}</button>
        <button type="button" class="SL_UN_Gear" aria-label="Up next settings" aria-haspopup="menu" aria-expanded="false">${Icons.Settings}</button>
        <button type="button" class="SL_UN_Fold" aria-label="Collapse" aria-expanded="true">${CHEVRON_DOWN_ICON}</button>
      </div>
    </div>
    <ul class="SL_UN_List" role="list"></ul>
  `;
  const gear = el.querySelector<HTMLButtonElement>(".SL_UN_Gear");
  gear?.addEventListener("click", () => openMenu(gear, settingsMenu));
  el.querySelector<HTMLButtonElement>(".SL_UN_Clear")?.addEventListener("click", () => {
    void clearQueue();
  });
  el.querySelector<HTMLButtonElement>(".SL_UN_Fold")?.addEventListener("click", () => {
    closeMenu();
    $npvUpNextCollapsed.set(!$npvUpNextCollapsed.get());
  });
  el.querySelectorAll<HTMLButtonElement>(".SL_UN_Tab").forEach((button) =>
    button.addEventListener("click", () => {
      $npvUpNextTab.set(button.dataset.tab === "recent" ? "recent" : "next");
    })
  );
  syncTabs(el);
  syncCollapsed(el);
  // Right the first time: only the Up next tab has anything to clear.
  syncClear(el, $npvUpNextTab.get() === "next", 0);
  return el;
}

/** Always there on the Up next tab; greyed out, and saying why, when nothing added by hand is queued. */
function syncClear(el: HTMLElement, visible: boolean, queuedCount: number) {
  const clear = el.querySelector<HTMLButtonElement>(".SL_UN_Clear");
  if (!clear) return;
  clear.hidden = !visible;
  clear.disabled = queuedCount === 0;
  const label =
    queuedCount === 0
      ? "Clear queue (nothing you added is queued)"
      : `Clear queue (${queuedCount} you added)`;
  clear.title = label;
  clear.setAttribute("aria-label", label);
}

function syncCollapsed(el: HTMLElement) {
  const collapsed = $npvUpNextCollapsed.get();
  el.classList.toggle("SL_Collapsed", collapsed);
  const fold = el.querySelector<HTMLButtonElement>(".SL_UN_Fold");
  fold?.setAttribute("aria-expanded", String(!collapsed));
  fold?.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
}

function syncTabs(el: HTMLElement) {
  const active = $npvUpNextTab.get();
  el.querySelectorAll<HTMLButtonElement>(".SL_UN_Tab").forEach((button) => {
    const on = button.dataset.tab === active;
    button.classList.toggle("Active", on);
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
  });
}

function rowFor(entry: Entry): HTMLElement {
  const { track } = entry;
  const name = track.name ?? "";

  const li = document.createElement("li");
  li.className = "SL_UN_Item";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "SL_UN_Play";
  play.setAttribute("aria-label", `Play ${name}`);
  play.addEventListener("click", () => playTrack(entry));

  const art = document.createElement("span");
  art.className = "SL_UN_Art";
  const src = imageUrl(track);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    art.appendChild(img);
  }

  const text = document.createElement("span");
  text.className = "SL_UN_Text";
  const title = document.createElement("span");
  title.className = "SL_UN_Title";
  title.textContent = name;
  const artists = document.createElement("span");
  artists.className = "SL_UN_Artists";
  artists.textContent = (track.artists ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(", ");
  text.append(title, artists);
  play.append(art, text);

  const more = document.createElement("button");
  more.type = "button";
  more.className = "SL_UN_More";
  more.setAttribute("aria-label", `More options for ${name}`);
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", "false");
  more.innerHTML = DOTS_ICON;
  more.addEventListener("click", () => openMenu(more, () => trackMenu(entry)));

  li.append(play, more);
  return li;
}

async function loadEntries(
  tab: "next" | "recent",
  count: number
): Promise<{ entries: Entry[]; queuedCount: number }> {
  if (tab === "recent") {
    const history = await Spicetify.Platform.PlayHistoryAPI.getContents();
    const entries = ((history?.items ?? []) as QueueTrack[])
      .slice(0, count)
      .map((track) => ({ track, source: "recent" as const }));
    return { entries, queuedCount: 0 };
  }
  const queue = await Spicetify.Platform.PlayerAPI.getQueue();
  const queued = (queue?.queued ?? []) as QueueTrack[];
  const entries = [
    ...queued.map((track) => ({ track, source: "queued" as const })),
    ...((queue?.nextUp ?? []) as QueueTrack[]).map((track) => ({ track, source: "next" as const })),
  ].slice(0, count);
  return { entries, queuedCount: queued.length };
}

function note(text: string): HTMLElement {
  const el = document.createElement("li");
  el.className = "SL_UN_Empty";
  el.textContent = text;
  return el;
}

async function render() {
  const el = card;
  const list = el?.querySelector<HTMLElement>(".SL_UN_List");
  if (!el || !list) return;
  const token = ++renderToken;
  const tab = $npvUpNextTab.get();
  syncTabs(el);
  try {
    const { entries, queuedCount } = await loadEntries(tab, clampUpNextCount($npvUpNextCount.get()));
    if (token !== renderToken || card !== el) return;
    syncClear(el, tab === "next", queuedCount);
    if (!entries.length) {
      list.replaceChildren(
        note(tab === "recent" ? "Nothing played recently" : "Nothing else is coming up")
      );
      return;
    }
    list.replaceChildren(...entries.map(rowFor));
  } catch (err) {
    upNextLogger.error("Failed to load the list", err);
    if (token === renderToken && card === el) {
      syncClear(el, false, 0);
      list.replaceChildren(
        note(tab === "recent" ? "Couldn't load recently played" : "Couldn't load the queue")
      );
    }
  }
}

// ─── Placing the card ────────────────────────────────────────────────────────

function removeCard() {
  closeMenu();
  card?.remove();
  card = null;
  document.body.classList.remove(BODY_CLASS);
}

/** Puts the card where Spotify's "Next in queue" block is; false when there is no sidebar to put it in. */
function place(npv: HTMLElement, el: HTMLElement): boolean {
  const native = npv.querySelector<HTMLElement>(".main-nowPlayingView-queue");
  if (native) {
    if (el.nextElementSibling !== native) native.insertAdjacentElement("beforebegin", el);
    return true;
  }
  // Spotify leaves the block out in some states; sit after its last block instead.
  const sections = [...npv.querySelectorAll<HTMLElement>(".main-nowPlayingView-section")].filter(
    (s) => s !== el
  );
  const last = sections[sections.length - 1];
  if (last) {
    if (last.nextElementSibling !== el) last.insertAdjacentElement("afterend", el);
    return true;
  }
  const content = npv.querySelector<HTMLElement>('[data-testid="NPV_Panel_OpenDiv"]');
  if (content) {
    if (el.parentElement !== content) content.appendChild(el);
    return true;
  }
  return false;
}

function ensure() {
  frame = 0;
  if (!isExperimentEnabled("npvUpNext")) {
    removeCard();
    return;
  }
  const npv = GetNPVElement();
  if (!npv) {
    removeCard();
    return;
  }
  const created = !card;
  if (!card) card = buildCard();
  const placed = place(npv, card);
  document.body.classList.toggle(BODY_CLASS, placed);
  if (!placed) {
    card.remove();
    return;
  }
  if (created) void render();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(ensure);
}

function attach() {
  const root = GetNPVObserverRoot();
  if (!root || root === observedRoot) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target;
      if (card?.contains(target)) continue;
      // The lyrics card changes constantly while a song plays.
      if (target instanceof Element && target.closest("#SpicyLyricsNPVCard")) continue;
      schedule();
      return;
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
  schedule();
}

function onQueueChanged() {
  if (card?.isConnected) void render();
}

export function initNPVUpNext(): void {
  if (started) return;
  started = true;

  $experiment("npvUpNext").listen(() => schedule());
  $npvUpNextCount.listen(() => onQueueChanged());
  $npvUpNextTab.listen(() => onQueueChanged());
  $npvUpNextCollapsed.listen(() => {
    if (card) syncCollapsed(card);
  });

  Global.Event.listen("playback:songchange", onQueueChanged);
  for (const name of ["platform:history", "page:open", "page:destroy", "fullscreen:open", "fullscreen:exit"]) {
    // Spotify swaps the sidebar element itself on some navigations.
    Global.Event.listen(name, () => {
      attach();
      schedule();
    });
  }
  // The queue changes when a track ends, when one is queued elsewhere, or when it is skipped.
  // On a cold start the player API can still be missing when Spicy boots, so wait for it.
  Whentil.When(
    () => Spicetify.Platform?.PlayerAPI?.getEvents?.(),
    (events) => events?.addListener?.("queue_update", onQueueChanged)
  );

  Whentil.When(
    () => GetNPVObserverRoot(),
    () => attach()
  );
}
