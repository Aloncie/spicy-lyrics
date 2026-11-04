import { persistAtom } from "./stores.ts";

/*
 * Spotify blocks the user can drop from, or fold up in, the Now Playing sidebar.
 * A matter of taste; all four are on, since this branch exists for someone who
 * wants them gone.
 */

// The "Credits" block.
export const $npvHideCredits = persistAtom<boolean>("npvHideCredits", true);
// The "About the artist" block.
export const $npvHideAboutArtist = persistAtom<boolean>("npvHideAboutArtist", true);
// The "On tour" block.
export const $npvHideOnTour = persistAtom<boolean>("npvHideOnTour", true);
// The music video block shrinks to its title; a click on the title opens it.
export const $npvCollapseMusicVideo = persistAtom<boolean>("npvCollapseMusicVideo", true);
