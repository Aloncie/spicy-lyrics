import { persistAtom } from "./stores.ts";

/*
 * Spotify blocks the user can drop from the Now Playing sidebar. A matter of taste,
 * so both are off until switched on in Settings → Interface.
 */

// The "Credits" block.
export const $npvHideCredits = persistAtom<boolean>("npvHideCredits", false);
// The "About the artist" block.
export const $npvHideAboutArtist = persistAtom<boolean>("npvHideAboutArtist", false);
