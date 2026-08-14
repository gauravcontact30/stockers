// The grading half of the Human-vs-AI contest.
//
// Split from ./head-to-head because `momentumScore` lives in a module that reaches `next/cache`,
// and the landing page's card is a client component. Keeping the two apart is what lets the card
// share the contest's types and its five-pick constant without pulling the entire market-data stack
// across to the browser. Only the route imports this file.
//
// Both sides go through `sideFrom`. There is deliberately no second scoring path: if the AI ever
// gets one, the contest stops being a comparison and becomes an assertion.

import type { Contender, Side } from "./head-to-head";
import { findStock } from "./stock-search";
import type { PerformanceSummary } from "./stock-performance";
import { momentumScore } from "./stock-verdicts";

/**
 * One stock's line on a card.
 *
 * A summary with no usable return history still scores — `momentumScore` treats an absent period as
 * uncovered rather than as zero — so a thinly traded scrip drags a side down honestly instead of
 * crashing the match.
 */
export function contenderFrom(summary: PerformanceSummary): Contender {
  // The price feed knows what a company did; the catalogue knows what it *is*. Joined here so a
  // pick carries its industry and its cap tier whether it came from the curated list or from the
  // far end of the exchange — the catalogue covers all 4,900 listings, the curated one does not.
  const listing = findStock(summary.symbol);

  return {
    symbol: summary.symbol,
    name: summary.name ?? listing?.name ?? null,
    price: summary.price,
    // Every window the exchange has, not only the four the score weighs. The card marks which are
    // which — showing the whole record and being clear about what was graded beats showing four
    // numbers and leaving the reader to wonder what else the AI saw.
    oneDay: summary.oneDay,
    oneWeek: summary.oneWeek,
    oneMonth: summary.oneMonth,
    threeMonth: summary.threeMonth,
    sixMonth: summary.sixMonth,
    oneYear: summary.oneYear,
    threeYear: summary.threeYear,
    fiveYear: summary.fiveYear,
    overall: summary.overall,
    capTier: summary.capTier ?? listing?.capTier ?? null,
    sector: listing?.sector ?? null,
    score: momentumScore(summary),
  };
}

/**
 * A side's score: the mean of its picks.
 *
 * The mean rather than the sum, so a side that could only resolve four of its five is not beaten by
 * the arithmetic alone. An empty side scores 0 rather than dividing by nothing.
 */
export function sideFrom(summaries: PerformanceSummary[]): Side {
  const picks = summaries.map(contenderFrom);
  if (picks.length === 0) return { picks, score: 0 };

  const total = picks.reduce((sum, pick) => sum + pick.score, 0);
  return { picks, score: Math.round(total / picks.length) };
}
