import { persistAtom } from "./stores.ts";

/*
 * Spotify blocks the user can drop from, or fold up in, the Now Playing sidebar.
 * A matter of taste, so all four are off until switched on in Settings → Interface.
 */

// The "Credits" block.
export const $npvHideCredits = persistAtom<boolean>("npvHideCredits", false);
// The "About the artist" block.
export const $npvHideAboutArtist = persistAtom<boolean>("npvHideAboutArtist", false);
// The "On tour" block.
export const $npvHideOnTour = persistAtom<boolean>("npvHideOnTour", false);
// The music video block shrinks to its title; a click on the title opens it.
export const $npvCollapseMusicVideo = persistAtom<boolean>("npvCollapseMusicVideo", false);
