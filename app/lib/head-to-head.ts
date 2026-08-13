// Human against the machine, over five stocks each.
//
// A visitor picks five companies off the exchange, the AI picks five of its own, and both sides are
// graded by the same arithmetic on the same day. The whole point is that the reader can lose — and
// can also win — so two rules hold this file together:
//
//   1. Both sides are scored by exactly one function, `momentumScore`, the same one the compare
//      tables and sector showdowns already use. Neither side gets a formula of its own.
//   2. The AI does *not* pick by that formula. It picks by conviction — its own one-day outlook and
//      confidence, the same signal that drives Today's AI picks. If it ranked candidates by the
//      grading function it would be marking its own homework, would win every single match, and the
//      feature would be a rigged demo rather than a contest.
//
// Everything here is pure: summaries and predictions in, a result out. No fetching, no clock, no
// storage. That is what lets the scoring be checked directly rather than through a rendered card.
//
// This half is deliberately client-safe: every import below is `import type`, so nothing survives
// compilation and the landing page's card can share these types and this constant without dragging
// the market-data stack into the browser bundle. The scoring itself needs `momentumScore`, which
// reaches `next/cache` through its own module, so it lives in ./head-to-head-score and is only ever
// imported by the route. Putting the two in one file put ~250KB of server code in the client
// bundle of the page this feature was added to.

import type { Outlook, Prediction } from "./daily-predictions";

/** How many companies each side fields. */
export const HEAD_TO_HEAD_PICKS = 5;

/** One stock on one side of the match, with the figures the card shows for it. */
export type Contender = {
  symbol: string;
  name: string | null;
  price: number | null;
  oneMonth: number | null;
  oneYear: number | null;
  /** 0-100, from the shared momentum engine. 50 is "went nowhere". */
  score: number;
};

export type Side = {
  picks: Contender[];
  /** The side's score: the mean of its five, rounded. */
  score: number;
};

export type Verdict = "human" | "ai" | "draw";

export type MatchResult = {
  human: Side;
  ai: Side;
  winner: Verdict;
  /** Absolute points between the two sides, so the card can say "by 7". */
  margin: number;
  /** Whether the AI's five came from the model or from the heuristic fallback. */
  aiSource: "ai" | "heuristic";
};

/** How convincing an outlook is, before confidence is used to separate equals. */
const OUTLOOK_RANK: Record<Outlook, number> = { Bullish: 2, Neutral: 1, Bearish: 0 };

/**
 * Who took it.
 *
 * Compared on the rounded scores the reader is actually shown, so a card never reads "68 vs 68 —
 * AI wins" off a hundredth of a point they cannot see.
 */
export function decideWinner(humanScore: number, aiScore: number): Verdict {
  if (humanScore === aiScore) return "draw";
  return humanScore > aiScore ? "human" : "ai";
}

/**
 * The AI's five, by conviction.
 *
 * Ranked on outlook first and confidence second — what the model believes about tomorrow, not what
 * the tape already did. Ties break on the symbol so the same predictions always field the same
 * team: a contest whose opponent reshuffles between two identical runs is not one anybody can
 * argue with.
 *
 * `exclude` keeps the AI off the human's own picks. Fielding the same company on both sides is a
 * guaranteed draw on that row and reads, wrongly, as the AI copying its opponent.
 */
export function chooseAiPicks(
  predictions: Record<string, Prediction>,
  universe: { symbol: string }[],
  { exclude = [], count = HEAD_TO_HEAD_PICKS }: { exclude?: string[]; count?: number } = {},
): string[] {
  const barred = new Set(exclude.map((symbol) => symbol.toUpperCase()));

  return universe
    .map((entry) => ({ symbol: entry.symbol, prediction: predictions[entry.symbol] }))
    .filter((entry): entry is { symbol: string; prediction: Prediction } => Boolean(entry.prediction))
    .filter((entry) => !barred.has(entry.symbol.toUpperCase()))
    .sort((a, b) => {
      const byOutlook = OUTLOOK_RANK[b.prediction.outlook] - OUTLOOK_RANK[a.prediction.outlook];
      if (byOutlook !== 0) return byOutlook;

      const byConfidence = b.prediction.confidence - a.prediction.confidence;
      if (byConfidence !== 0) return byConfidence;

      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, count)
    .map((entry) => entry.symbol);
}

/** The five symbols a submitted line-up actually amounts to: upper-cased, de-duplicated, trimmed. */
export function normalisePicks(input: unknown, limit = HEAD_TO_HEAD_PICKS): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const picks: string[] = [];

  for (const value of input) {
    if (typeof value !== "string") continue;
    const symbol = value.trim().toUpperCase();
    // The same company twice is one pick, not two — otherwise a side could field one stock five
    // times and have the mean report it as a five-strong team.
    if (!symbol || seen.has(symbol)) continue;

    seen.add(symbol);
    picks.push(symbol);
    if (picks.length === limit) break;
  }

  return picks;
}
