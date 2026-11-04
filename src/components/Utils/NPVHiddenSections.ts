import Global from "../Global/Global.ts";
import {
  $npvCollapseMusicVideo,
  $npvHideAboutArtist,
  $npvHideCredits,
  $npvHideOnTour,
} from "../../utils/npvHiddenSections.ts";

/*
 * The switches only set a class on <body>; NPVHiddenSections.css does the rest, so a
 * sidebar Spotify re-renders keeps its look. The one bit of script is the music video
 * block: a click on its title opens it, and every new song starts it folded again.
 */

const SECTION = ".main-nowPlayingView-musicVideo";
const HEADER = ".main-nowPlayingView-sectionHeader";

let started = false;

export function initNPVHiddenSections(): void {
  if (started) return;
  started = true;

  const bind = (store: { subscribe: (cb: (v: boolean) => void) => unknown }, name: string) =>
    store.subscribe((on) => document.body.classList.toggle(name, on));
  bind($npvHideCredits, "SL_NpvHideCredits");
  bind($npvHideAboutArtist, "SL_NpvHideAboutArtist");
  bind($npvHideOnTour, "SL_NpvHideOnTour");
  bind($npvCollapseMusicVideo, "SL_NpvCollapseMusicVideo");

  document.addEventListener("click", (e) => {
    if (!$npvCollapseMusicVideo.get()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const header = target.closest(`${SECTION} > ${HEADER}`);
    if (!header) return;
    header.parentElement?.classList.toggle("SL_Expanded");
  });

  const fold = () => {
    for (const section of document.querySelectorAll(`${SECTION}.SL_Expanded`)) {
      section.classList.remove("SL_Expanded");
    }
  };
  Global.Event.listen("playback:songchange", fold);
  $npvCollapseMusicVideo.listen(fold);
}
