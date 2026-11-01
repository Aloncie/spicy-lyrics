import { PageContainer } from "../Pages/PageView.ts";
import { isRomanized } from "../../utils/Lyrics/lyrics.ts";
import Logger from "../../utils/Logger.ts";

/*
 * A plain-text view of the current lyrics for copying. The animated lyrics can't
 * be selected sensibly: a click seeks, the list scrolls itself, off-screen lines
 * aren't in the page and every syllable is its own element. This panel lays the
 * same lyrics out as ordinary selectable text over the lyrics area, built from
 * the lyrics data rather than the page, and leaves the animated view untouched.
 */

const textLogger = new Logger("Lyrics Text");

type Syllable = { Text?: string; TransliteratedText?: string; IsPartOfWord?: boolean };
type TextLine = { text: string; background?: boolean };

let source: any = null;
let panel: HTMLElement | null = null;
let showRomanized = false;
let teardown: (() => void) | null = null;

function pick(entry: { Text?: string; TransliteratedText?: string }, romanized: boolean): string {
  if (romanized && entry.TransliteratedText) return entry.TransliteratedText;
  return entry.Text ?? entry.TransliteratedText ?? "";
}

// Same spacing the animated view uses: a syllable marked part of a word runs
// straight into the next one.
function joinSyllables(syllables: Syllable[] | undefined, romanized: boolean): string {
  let text = "";
  for (const syllable of syllables ?? []) {
    text += pick(syllable, romanized) + (syllable.IsPartOfWord ? "" : " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function buildLines(lyrics: any, romanized: boolean): TextLine[] {
  const lines: TextLine[] = [];
  const push = (text: string, background = false) => {
    const clean = text.trim();
    if (clean) lines.push({ text: clean, background });
  };

  if (lyrics?.Type === "Static") {
    for (const line of lyrics.Lines ?? []) push(pick(line, romanized));
  } else if (lyrics?.Type === "Line") {
    for (const group of lyrics.Content ?? []) {
      if (group.Type === "Vocal") push(pick(group, romanized));
    }
  } else if (lyrics?.Type === "Syllable") {
    for (const group of lyrics.Content ?? []) {
      if (group.Type !== "Vocal") continue;
      push(joinSyllables(group.Lead?.Syllables, romanized));
      for (const background of group.Background ?? []) {
        const text = joinSyllables(background?.Syllables, romanized);
        if (text) push(`(${text.replace(/^\(|\)$/g, "")})`, true);
      }
    }
  }
  return lines;
}

/** Called whenever lyrics are applied (null for a notice), so an open panel follows the song. */
export function SetLyricsTextSource(lyrics: any | null) {
  source = lyrics;
  if (panel) render();
}

export function HasLyricsText(): boolean {
  return buildLines(source, false).length > 0;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Throws when the window isn't focused.
  }
  try {
    await Spicetify.Platform.ClipboardAPI.copy(text);
    return true;
  } catch {
    // Not every client build has the native clipboard bridge.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function render() {
  const root = panel;
  if (!root) return;
  const body = root.querySelector<HTMLElement>(".SL_LT_Body")!;
  const toggle = root.querySelector<HTMLButtonElement>(".SL_LT_Romanize")!;

  const canRomanize = source?.HasTransliterations === true;
  toggle.hidden = !canRomanize;
  toggle.textContent = showRomanized ? "Show original" : "Show romanized";
  const lines = buildLines(source, canRomanize && showRomanized);

  body.replaceChildren(
    ...(lines.length
      ? lines.map((line) => {
          const el = document.createElement("div");
          el.className = line.background ? "SL_LT_Line Background" : "SL_LT_Line";
          el.textContent = line.text;
          return el;
        })
      : [
          Object.assign(document.createElement("div"), {
            className: "SL_LT_Empty",
            textContent: "No lyrics to show",
          }),
        ])
  );
}

// Over the largest free part of the page: the side away from the cover, the area
// under it in compact mode, or everything when the cover is hidden.
function position() {
  const root = panel;
  const box = PageContainer?.querySelector<HTMLElement>(".ContentBox");
  if (!root || !box) return;
  const page = box.getBoundingClientRect();
  const nowBar = PageContainer?.querySelector<HTMLElement>(".ContentBox .NowBar.Active");
  const bar = nowBar?.getBoundingClientRect();

  let region = { left: page.left, top: page.top, right: page.right, bottom: page.bottom };
  if (bar && bar.width > 0 && bar.height > 0) {
    const candidates = [
      { left: bar.right, top: page.top, right: page.right, bottom: page.bottom },
      { left: page.left, top: page.top, right: bar.left, bottom: page.bottom },
      { left: page.left, top: bar.bottom, right: page.right, bottom: page.bottom },
    ];
    const area = (r: typeof region) =>
      Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
    region = candidates.reduce((best, r) => (area(r) > area(best) ? r : best));
  }

  const inset = Math.max(16, Math.min(64, (region.right - region.left) * 0.06));
  root.style.left = `${region.left - page.left + inset}px`;
  root.style.top = `${region.top - page.top + Math.max(inset, 56)}px`;
  root.style.width = `${Math.max(0, region.right - region.left - inset * 2)}px`;
  root.style.height = `${Math.max(0, region.bottom - region.top - Math.max(inset, 56) - inset)}px`;
}

// The page can be destroyed with the panel still in it.
function dropDetachedPanel() {
  if (panel && !panel.isConnected) {
    teardown?.();
    teardown = null;
    panel = null;
  }
}

export function IsLyricsTextPanelOpen(): boolean {
  dropDetachedPanel();
  return panel !== null;
}

export function CloseLyricsTextPanel() {
  if (!panel) return;
  const closing = panel;
  panel = null;
  teardown?.();
  teardown = null;
  PageContainer?.querySelector("#LyricsTextToggle")?.classList.remove("Active");

  closing.classList.remove("Visible");
  const remove = () => closing.remove();
  closing.addEventListener("transitionend", remove, { once: true });
  // transitionend never fires under reduced motion or if the node was detached.
  setTimeout(remove, 250);
}

export function ToggleLyricsTextPanel() {
  dropDetachedPanel();
  if (panel) CloseLyricsTextPanel();
  else OpenLyricsTextPanel();
}

function OpenLyricsTextPanel() {
  const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
  if (!contentBox) return;

  const root = document.createElement("div");
  root.className = "SL_LyricsTextPanel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Lyrics text");
  root.innerHTML = `
    <div class="SL_LT_Header">
      <button type="button" class="SL_LT_Button SL_LT_Romanize"></button>
      <button type="button" class="SL_LT_Button SL_LT_CopyAll">Copy all</button>
      <button type="button" class="SL_LT_Button SL_LT_Close" aria-label="Close">Close</button>
    </div>
    <div class="SL_LT_Body"></div>
  `;

  panel = root;
  showRomanized = isRomanized;
  contentBox.appendChild(root);
  PageContainer?.querySelector("#LyricsTextToggle")?.classList.add("Active");
  render();
  position();
  requestAnimationFrame(() => root.classList.add("Visible"));

  const body = root.querySelector<HTMLElement>(".SL_LT_Body")!;
  const copyAll = root.querySelector<HTMLButtonElement>(".SL_LT_CopyAll")!;

  root.querySelector(".SL_LT_Romanize")!.addEventListener("click", () => {
    showRomanized = !showRomanized;
    render();
  });
  root.querySelector(".SL_LT_Close")!.addEventListener("click", () => CloseLyricsTextPanel());

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  copyAll.addEventListener("click", async () => {
    const lines = [...body.querySelectorAll<HTMLElement>(".SL_LT_Line")].map((l) => l.textContent);
    const ok = await copyText(lines.join("\n"));
    if (!ok) textLogger.warn("Copy failed");
    copyAll.textContent = ok ? "Copied" : "Couldn't copy";
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copyAll.textContent = "Copy all"), 1500);
  });

  // Keys are taken on the window's capture phase, ahead of Spotify's handlers on
  // the app root. Escape closes the panel wherever focus is; keys typed in the
  // panel are kept from Spotify's shortcuts, and Ctrl+A selects only the lyrics.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      e.preventDefault();
      CloseLyricsTextPanel();
      return;
    }
    if (!(e.target instanceof Node && root.contains(e.target))) return;
    e.stopImmediatePropagation();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(body);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  // The lyrics view treats wheel input as the user scrolling it.
  const stopWheel = (e: Event) => e.stopPropagation();
  root.addEventListener("wheel", stopWheel);
  // Spotify's own handlers sit on the app root and run before anything on the
  // panel: one turns copy into "copy track link", another cancels the context
  // menu outside text fields. Catching these first, on the window's capture
  // phase, keeps them from ever seeing events that start in the panel.
  const fromPanel = (e: Event) => e.target instanceof Node && root.contains(e.target);
  const selectedText = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return "";
    const anchor = selection.anchorNode;
    return anchor && root.contains(anchor) ? selection.toString() : "";
  };
  const onCopy = (e: ClipboardEvent) => {
    if (!fromPanel(e) && !selectedText()) return;
    const text = selectedText();
    e.stopImmediatePropagation();
    if (text && e.clipboardData) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    }
  };
  const onContextMenu = (e: Event) => {
    if (fromPanel(e)) e.stopImmediatePropagation();
  };
  window.addEventListener("copy", onCopy, true);
  window.addEventListener("contextmenu", onContextMenu, true);

  const resizeObserver = new ResizeObserver(() => position());
  resizeObserver.observe(contentBox);
  const nowBar = contentBox.querySelector(".NowBar");
  if (nowBar) resizeObserver.observe(nowBar);
  // Swapping the cover's side or collapsing it changes classes, not sizes.
  const classObserver = new MutationObserver(() => requestAnimationFrame(position));
  if (nowBar)
    classObserver.observe(nowBar, { attributes: true, attributeFilter: ["class", "style"] });
  if (PageContainer)
    classObserver.observe(PageContainer, { attributes: true, attributeFilter: ["class"] });

  // Focus the body so Ctrl+C and Ctrl+A work right away.
  body.tabIndex = -1;
  setTimeout(() => {
    if (panel === root) body.focus({ preventScroll: true });
  }, 50);

  teardown = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("wheel", stopWheel);
    window.removeEventListener("copy", onCopy, true);
    window.removeEventListener("contextmenu", onContextMenu, true);
    resizeObserver.disconnect();
    classObserver.disconnect();
    clearTimeout(copiedTimer);
  };
}
