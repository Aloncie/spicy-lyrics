import Global from "../Global/Global.ts";
import { PageContainer } from "../Pages/PageView.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import Logger from "../../utils/Logger.ts";

/*
 * A clock at the top centre of the fullscreen view: the time in the colours of
 * the current cover, with the weekday and date underneath. It repaints once a
 * minute, on the minute, so it costs nothing while nothing changes.
 */

const clockLogger = new Logger("Fullscreen Clock");

let clock: HTMLElement | null = null;
let timeNode: HTMLElement | null = null;
let dateNode: HTMLElement | null = null;
let tick: ReturnType<typeof setTimeout> | undefined;
let songChangeId: ReturnType<typeof Global.Event.listen> | undefined;
let colourToken = 0;

const SAMPLE = 24;

function formatTime(now: Date): string {
  return now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(now: Date): string {
  return now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function paintTime() {
  if (!timeNode || !dateNode) return;
  const now = new Date();
  timeNode.textContent = formatTime(now);
  dateNode.textContent = formatDate(now);
  // Wake up just after the next minute starts, so the display never lags a minute.
  tick = setTimeout(paintTime, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

type Rgb = [number, number, number];

/** Brightness and saturation pushed up so a dark cover still gives readable, vivid text. */
function lift([r, g, b]: Rgb): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const s = max === min ? 0 : (max - min) / (255 * (1 - Math.abs(2 * l - 1)));
  const boost = Math.max(0, 0.78 - l) * 1.6;
  const mix = (c: number) => Math.round(Math.min(255, c + (255 - c) * boost));
  const sat = Math.min(1, s + 0.25);
  const grey = (r + g + b) / 3;
  const push = (c: number) => Math.round(Math.max(0, Math.min(255, grey + (mix(c) - grey) * (1 + sat))));
  return `rgb(${push(r)}, ${push(g)}, ${push(b)})`;
}

/** The most vivid, mutually different colours of the cover, from a tiny downsample. */
function pickColours(img: HTMLImageElement): Rgb[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    return null; // tainted canvas: the cover is not readable
  }

  const buckets = new Map<number, { rgb: Rgb; n: number; score: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40) continue; // near-black
    const sat = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const cur = buckets.get(key);
    const score = sat * 0.7 + (max / 255) * 0.3;
    if (cur) {
      cur.n++;
      cur.score += score;
      cur.rgb = [cur.rgb[0] + r, cur.rgb[1] + g, cur.rgb[2] + b];
    } else {
      buckets.set(key, { rgb: [r, g, b], n: 1, score });
    }
  }

  const ranked = [...buckets.values()]
    .map((b) => ({
      rgb: [b.rgb[0] / b.n, b.rgb[1] / b.n, b.rgb[2] / b.n] as Rgb,
      weight: b.score * Math.sqrt(b.n),
    }))
    .sort((a, b) => b.weight - a.weight);

  const picked: Rgb[] = [];
  for (const c of ranked) {
    const far = picked.every(
      (p) => Math.hypot(p[0] - c.rgb[0], p[1] - c.rgb[1], p[2] - c.rgb[2]) > 70
    );
    if (far) picked.push(c.rgb);
    if (picked.length === 3) break;
  }
  return picked.length ? picked : null;
}

function applyColours(colours: Rgb[] | null) {
  if (!clock) return;
  if (!colours) {
    clock.style.removeProperty("--SL_ClockGradient");
    clock.style.removeProperty("--SL_ClockGlow");
    return;
  }
  const lifted = colours.map(lift);
  // One colour still needs somewhere to go: pair it with a lighter copy of itself.
  const stops = lifted.length === 1 ? [lifted[0], "rgb(255, 255, 255)"] : lifted;
  clock.style.setProperty("--SL_ClockGradient", `linear-gradient(100deg, ${stops.join(", ")})`);
  clock.style.setProperty("--SL_ClockGlow", lifted[0]);
}

function updateColours() {
  const token = ++colourToken;
  const cover = SpotifyPlayer.GetCover("standard") ?? SpotifyPlayer.GetCover("xlarge");
  if (!cover) {
    applyColours(null);
    return;
  }
  // The client hands covers out as spotify:image:<id>; reading the pixels needs a normal URL.
  const url = cover.startsWith("spotify:image:")
    ? `https://i.scdn.co/image/${cover.slice(14)}`
    : cover;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    if (token !== colourToken) return;
    try {
      applyColours(pickColours(img));
    } catch (err) {
      clockLogger.warn("Could not read the cover colours", err);
      applyColours(null);
    }
  };
  img.onerror = () => {
    if (token === colourToken) applyColours(null);
  };
  img.src = url;
}

export function OpenFullscreenClock() {
  CloseFullscreenClock();
  const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
  if (!contentBox) return;

  clock = document.createElement("div");
  clock.className = "SL_FullscreenClock";
  clock.setAttribute("role", "timer");
  clock.setAttribute("aria-label", "Current time");
  clock.innerHTML = `<div class="SL_Clock_Time"></div><div class="SL_Clock_Date"></div>`;
  timeNode = clock.querySelector<HTMLElement>(".SL_Clock_Time");
  dateNode = clock.querySelector<HTMLElement>(".SL_Clock_Date");
  contentBox.appendChild(clock);

  paintTime();
  updateColours();
  songChangeId = Global.Event.listen("playback:songchange", updateColours);
}

export function CloseFullscreenClock() {
  clearTimeout(tick);
  colourToken++;
  if (songChangeId !== undefined) {
    Global.Event.unListen(songChangeId);
    songChangeId = undefined;
  }
  clock?.remove();
  clock = null;
  timeNode = null;
  dateNode = null;
}
