/**
 * The suggestion chips each board falls back to, for the two boards that offer them.
 *
 * In their own module for exactly the reason `./ownership-defaults` gives, and it is worth
 * restating because it is a runtime failure rather than a compile error: both boards that render
 * these rows are `"use client"` files, and a value exported from one of those does not survive
 * being imported by a Server Component. The RSC boundary hands back a client reference instead of
 * the array, so `.map` over it blows up at prerender rather than at build.
 *
 * Both sides need them. The client components take them as their prop defaults, so a board rendered
 * on its own — a test, or any page that mounts it without a server payload — still shows a row. The
 * server sections take them as the fallback they pass when `./daily-picks` cannot build a ranked
 * set. Naming them here is what lets both do that from one definition.
 *
 * No imports in this file, on purpose, so neither side drags anything across the boundary with it.
 */

export type SuggestionPick = { symbol: string; name: string };

/**
 * The ownership board's row.
 *
 * Names a visitor is likely to want first, and every one of them files a quarterly shareholding
 * pattern with the exchange — which is the whole point of that board, and why this list is not
 * simply the largest companies by market cap.
 */
export const FALLBACK_QUICK_PICKS: readonly string[] = ["RELIANCE", "TCS", "HDFCBANK", "SBIN", "ITC", "INFY"];

/**
 * The accuracy lookup's row.
 *
 * Carries display names as well as tickers, because that board draws the company's name beside its
 * logo rather than the ticker alone.
 */
export const FALLBACK_EXAMPLES: readonly SuggestionPick[] = [
  { symbol: "AUBANK", name: "AU Bank" },
  { symbol: "ANGELONE", name: "Angel One" },
  { symbol: "RELIANCE", name: "Reliance" },
  { symbol: "TCS", name: "TCS" },
  { symbol: "SBIN", name: "SBI" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
];
