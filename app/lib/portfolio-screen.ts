// Finding the next holding.
//
// Pure: exchange rows in, criteria in, a ranked shortlist out. No fetching, no clock. The rows
// come from `./bse-market`'s universe, which is the whole listed exchange rather than a curated
// list — so a screen here can surface a company nobody thought to put on a board.
//
// Two things separate this from a generic stock screener, and both come from it knowing whose
// portfolio is asking. It can exclude what is already held, so the shortlist is made of decisions
// still to take. And it can score for fit: whether a candidate would spread the book across a new
// market-cap tier or concentrate it further into one the reader already leans on. A screener that
// does not know the book can rank on momentum and size; it cannot tell you that the best-scoring
// name on the list would take your large-cap weight past three quarters.
//
// Every criterion is a measured field off the exchange tape. Nothing here is estimated and nothing
// is forecast — the ranking is arithmetic over published figures, and the AI layer above writes
// over the result rather than producing it.

import type { BoardBrief } from "./board-read";
import { formatMoney } from "./portfolio-metrics";

/** The part of an exchange row this module needs. Structurally a subset of `BseRow`. */
export type ScreenRow = {
  ticker: string;
  name: string;
  code?: string;
  capTier: "Large" | "Mid" | "Small" | null;
  marketCapCr: number | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  turnoverCr: number | null;
  sector?: string | null;
  industry?: string | null;
};

export type SectorFit = "any" | "diversify" | "concentrate";

export type ScreenCriteria = {
  tier: "all" | "Large" | "Mid" | "Small";
  minPrice: number | null;
  maxPrice: number | null;
  /** Today's move, as a percentage. Negative bounds are how a reader screens for a dip. */
  minChangePercent: number | null;
  maxChangePercent: number | null;
  minMarketCapCr: number | null;
  /** Rupees-crore of turnover below which a stock is too thin to build a position in. */
  minTurnoverCr: number | null;
  /** Drop anything already in the portfolio. On by default: you cannot decide to buy what you own. */
  excludeHeld: boolean;
  /** Steer towards tiers the book is light on, or towards the ones it already backs. */
  fit: SectorFit;
  sort: "score" | "change" | "mcap" | "price" | "turnover";
};

export const DEFAULT_CRITERIA: ScreenCriteria = {
  tier: "all",
  minPrice: null,
  maxPrice: null,
  minChangePercent: null,
  maxChangePercent: null,
  minMarketCapCr: null,
  minTurnoverCr: null,
  excludeHeld: true,
  fit: "any",
  sort: "score",
};

export type ScreenMatch = ScreenRow & {
  /** 0-100. A composite of liquidity, size, momentum and fit — see `scoreRow`. */
  score: number;
  /** Why it scored what it did, in the reader's language. Never more than three. */
  reasons: string[];
  /** True when the portfolio has no position in this cap tier yet. */
  newTier: boolean;
};

export type ScreenResult = {
  matches: ScreenMatch[];
  /** How many rows passed the filters before the shortlist was cut. */
  total: number;
  /** How many were dropped purely for being held already — worth saying, not hiding. */
  heldExcluded: number;
  /** The tiers the book has no position in, which is what `fit: "diversify"` rewards. */
  missingTiers: string[];
  criteria: ScreenCriteria;
};

/** The shortlist is a page of decisions, not a database dump. */
export const MAX_MATCHES = 24;

const TIERS = ["Large", "Mid", "Small"] as const;

function within(value: number | null, min: number | null, max: number | null): boolean {
  // A row the exchange had no figure for is not a row that passes a numeric filter: "unknown" is
  // not "within range", and letting it through would put unpriceable scrips on a price screen.
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/**
 * Maps a value onto 0-1 against a ceiling, log-scaled.
 *
 * Market cap and turnover span five orders of magnitude across the exchange, so a linear scale
 * gives every company below the top twenty the same score of roughly zero. Log makes the
 * difference between a ₹200cr and a ₹2,000cr company visible, which is the range most of this
 * list actually lives in.
 */
function logScore(value: number | null, ceiling: number): number {
  if (value === null || value <= 0) return 0;
  return Math.min(1, Math.log10(1 + value) / Math.log10(1 + ceiling));
}

/**
 * A candidate's score, 0-100.
 *
 * Four weighted parts, and the weights say what this screen is for. Liquidity is the heaviest
 * because a position you cannot exit is not an investment; size follows because a bigger company
 * carries less single-name risk; momentum is deliberately the lightest of the three, since today's
 * move is the noisiest thing on the row. Fit is a bonus rather than a component — it moves a
 * candidate up the list without letting a well-diversified but illiquid scrip outrank a solid one.
 */
export function scoreRow(row: ScreenRow, missingTiers: Set<string>, fit: SectorFit): { score: number; reasons: string[] } {
  const liquidity = logScore(row.turnoverCr, 500);
  const size = logScore(row.marketCapCr, 500_000);
  // Today's move, mapped so -5% is 0 and +5% is 1. Clamped: a 40% move is a circuit, not a signal.
  const momentum = row.changePercent === null ? 0.5 : Math.max(0, Math.min(1, (row.changePercent + 5) / 10));

  let score = liquidity * 40 + size * 30 + momentum * 20;

  const newTier = row.capTier !== null && missingTiers.has(row.capTier);
  if (fit === "diversify" && newTier) score += 10;
  if (fit === "concentrate" && row.capTier !== null && !missingTiers.has(row.capTier)) score += 10;

  const reasons: string[] = [];
  if (row.turnoverCr !== null && row.turnoverCr >= 50) reasons.push(`${formatMoney(row.turnoverCr)}cr traded today`);
  if (row.marketCapCr !== null && row.marketCapCr >= 20_000) reasons.push(`${row.capTier ?? "Listed"} cap at ${formatMoney(row.marketCapCr)}cr`);
  if (row.changePercent !== null && Math.abs(row.changePercent) >= 2) {
    reasons.push(`${row.changePercent >= 0 ? "Up" : "Down"} ${Math.abs(row.changePercent).toFixed(2)}% today`);
  }
  if (fit === "diversify" && newTier) reasons.push(`Your book holds no ${row.capTier} cap yet`);

  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons: reasons.slice(0, 3) };
}

const SORTERS: Record<ScreenCriteria["sort"], (a: ScreenMatch, b: ScreenMatch) => number> = {
  score: (a, b) => b.score - a.score,
  change: (a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity),
  mcap: (a, b) => (b.marketCapCr ?? -Infinity) - (a.marketCapCr ?? -Infinity),
  price: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  turnover: (a, b) => (b.turnoverCr ?? -Infinity) - (a.turnoverCr ?? -Infinity),
};

/**
 * The shortlist.
 *
 * `heldSymbols` and `heldTiers` are what make this a portfolio screen rather than a market one:
 * the first decides what to drop, the second what to reward.
 */
export function screenStocks(
  rows: ScreenRow[],
  criteria: ScreenCriteria,
  heldSymbols: Iterable<string> = [],
  heldTiers: Iterable<string> = [],
): ScreenResult {
  const held = new Set(Array.from(heldSymbols, (symbol) => symbol.toUpperCase()));
  const owned = new Set(Array.from(heldTiers, (tier) => String(tier)));
  const missingTiers = new Set(TIERS.filter((tier) => !owned.has(tier)));

  let heldExcluded = 0;
  const passed: ScreenMatch[] = [];

  for (const row of rows) {
    const ticker = row.ticker?.toUpperCase();
    if (!ticker) continue;

    if (held.has(ticker)) {
      heldExcluded++;
      if (criteria.excludeHeld) continue;
    }

    if (criteria.tier !== "all" && row.capTier !== criteria.tier) continue;
    if (!within(row.price, criteria.minPrice, criteria.maxPrice)) continue;
    if (!within(row.changePercent, criteria.minChangePercent, criteria.maxChangePercent)) continue;
    if (!within(row.marketCapCr, criteria.minMarketCapCr, null)) continue;
    if (!within(row.turnoverCr, criteria.minTurnoverCr, null)) continue;
    // A scrip with no price for the session cannot be bought at a known number, so it is not a
    // candidate whatever else it scores.
    if (row.price === null) continue;

    const { score, reasons } = scoreRow(row, missingTiers, criteria.fit);
    passed.push({ ...row, score, reasons, newTier: row.capTier !== null && missingTiers.has(row.capTier) });
  }

  passed.sort(SORTERS[criteria.sort] ?? SORTERS.score);

  return {
    matches: passed.slice(0, MAX_MATCHES),
    total: passed.length,
    heldExcluded,
    missingTiers: Array.from(missingTiers),
    criteria,
  };
}

/** The criteria as one readable line, for the AI brief and the results header. */
export function describeCriteria(criteria: ScreenCriteria): string {
  const parts: string[] = [];

  parts.push(criteria.tier === "all" ? "every cap tier" : `${criteria.tier} cap`);
  if (criteria.minPrice !== null || criteria.maxPrice !== null) {
    parts.push(`priced ${criteria.minPrice ?? 0}-${criteria.maxPrice ?? "any"}`);
  }
  if (criteria.minChangePercent !== null || criteria.maxChangePercent !== null) {
    parts.push(`moving ${criteria.minChangePercent ?? "any"}% to ${criteria.maxChangePercent ?? "any"}% today`);
  }
  if (criteria.minMarketCapCr !== null) parts.push(`above ₹${criteria.minMarketCapCr}cr market cap`);
  if (criteria.minTurnoverCr !== null) parts.push(`above ₹${criteria.minTurnoverCr}cr turnover`);
  if (criteria.excludeHeld) parts.push("excluding what is already held");
  if (criteria.fit === "diversify") parts.push("favouring tiers the book is missing");
  if (criteria.fit === "concentrate") parts.push("favouring tiers the book already backs");

  return parts.join(", ");
}

/**
 * The shortlist's own figures, for the board read.
 *
 * The model is handed the top of the list and the shape of the screen, and asked what the results
 * say. It is never asked to pick — the ranking is already decided by measured arithmetic above,
 * and a model reordering it would be a recommendation dressed as a summary.
 */
export function screenBrief(result: ScreenResult): BoardBrief | null {
  if (result.matches.length === 0) return null;

  const facts = [
    { label: "Matches", value: `${result.total} of the listed exchange` },
    { label: "Screen", value: describeCriteria(result.criteria).slice(0, 60) },
    { label: "Top score", value: `${result.matches[0].score}/100 (${result.matches[0].ticker})` },
    {
      label: "Already held",
      value: result.heldExcluded > 0 ? `${result.heldExcluded} filtered out` : "none on this screen",
    },
  ];

  const highlights = result.matches.slice(0, 5).map((match) => {
    const move = match.changePercent === null ? "no print today" : `${match.changePercent >= 0 ? "+" : ""}${match.changePercent.toFixed(2)}% today`;
    return `${match.ticker} (${match.name}) scores ${match.score}/100 — ${match.capTier ?? "unclassified"} cap, ${move}.`;
  });

  if (result.missingTiers.length > 0) {
    highlights.push(`The portfolio currently holds nothing in: ${result.missingTiers.join(", ")} cap.`);
  }

  return {
    subject: `a screen of the BSE-listed universe run against one investor's own portfolio (${describeCriteria(result.criteria)})`,
    question: "Which of these deserve a closer look, and what would adding one do to the book?",
    facts,
    highlights,
  };
}
