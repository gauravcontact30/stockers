// How exchange figures are written, in one place.
//
// Shared by the server-rendered exchange strip and the client-rendered mover lists beside it. It
// lives in `lib` rather than in either component because a value exported from a `"use client"`
// module arrives at a Server Component as a client reference rather than the function itself — so
// the two halves cannot borrow helpers from each other, and the alternative to this file is two
// copies of the same rounding rules quietly drifting apart.

/** A signed percentage to two places, or a dash when the exchange reported nothing. */
export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Green up, red down, grey for flat or unknown. Flat is not a failure and is not coloured as one. */
export function moveTone(value: number | null): string {
  if (value === null || Number.isNaN(value) || value === 0) return "text-slate-500 dark:text-slate-400";
  return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

export type CapTierKey = "large" | "mid" | "small";

/**
 * The tier a value names, whatever case the source used.
 *
 * The exchange sends "Large"/"Mid"/"Small", the movers API takes lower case, and a scrip the
 * universe has not ranked yet has none at all. One reader for all three, so no caller has to guess.
 */
export function normaliseCapTier(raw: string | null | undefined): CapTierKey | null {
  const value = raw?.trim().toLowerCase();
  return value === "large" || value === "mid" || value === "small" ? value : null;
}

/** The colour each tier carries, held once so the badge and the boards cannot disagree. */
export const CAP_TIER_CHROME: Record<CapTierKey, { label: string; pill: string; accent: string }> = {
  large: {
    label: "Large",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
    accent: "text-sky-700 dark:text-sky-300",
  },
  mid: {
    label: "Mid",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  small: {
    label: "Small",
    pill: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
    accent: "text-violet-700 dark:text-violet-300",
  },
};

/**
 * A sector key as a person would read it.
 *
 * The catalogue stores lower-case keys ("financials", "capital-goods"); the exchange sends its own
 * industry names in mixed case. Both end up as words with capitals, which is all a row label needs.
 */
export function sectorLabel(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * A rotating light wash for a row of stocks.
 *
 * Five very pale tints cycled by position, so a list of companies reads as separate rows at a
 * glance instead of one block of text. Deliberately weak and deliberately *not* meaningful: the
 * colour tracks where a row sits in the list, never whether it went up or down — that job belongs
 * to `moveTone`, and two colour languages competing on one row would make neither readable.
 *
 * Kept faint enough that the text on top stays at full contrast in both themes.
 */
const ROW_TINTS = [
  "bg-sky-50/60 dark:bg-sky-500/[0.07]",
  "bg-emerald-50/60 dark:bg-emerald-500/[0.07]",
  "bg-amber-50/60 dark:bg-amber-500/[0.07]",
  "bg-violet-50/60 dark:bg-violet-500/[0.07]",
  "bg-rose-50/60 dark:bg-rose-500/[0.07]",
];

export function rowTint(index: number): string {
  return ROW_TINTS[index % ROW_TINTS.length];
}

/** "₹4,21,35,000 Cr" is unreadable; this is the scale an Indian market report actually uses. */
export function formatCrore(value: number): string {
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} lakh Cr`;
  return `₹${Math.round(value).toLocaleString("en-IN")} Cr`;
}
