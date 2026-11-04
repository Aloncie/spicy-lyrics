import { persistAtom } from "./stores.ts";

/*
 * Settings for the sidebar's "Up next" card. Kept apart from stores.ts so the card
 * and its settings row can both import them.
 */

/** How many upcoming tracks the "Up next" card can show. */
export const NPV_UP_NEXT_COUNTS = [3, 5, 8, 10] as const;
export const NPV_UP_NEXT_DEFAULT_COUNT = 5;

export const $npvUpNextCount = persistAtom<number>("npvUpNextCount", NPV_UP_NEXT_DEFAULT_COUNT);

/** Which list the card shows: what is coming up, or what played before. */
export type NpvUpNextTab = "next" | "recent";
export const $npvUpNextTab = persistAtom<NpvUpNextTab>("npvUpNextTab", "next");

/** The card folded up to its header; remembered between sessions. */
export const $npvUpNextCollapsed = persistAtom<boolean>("npvUpNextCollapsed", false);

/** The saved count, put back into the range the card can show. */
export function clampUpNextCount(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value) ? Math.round(value) : NPV_UP_NEXT_DEFAULT_COUNT;
  return Math.min(NPV_UP_NEXT_COUNTS[NPV_UP_NEXT_COUNTS.length - 1], Math.max(1, n));
}
