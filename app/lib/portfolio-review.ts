// The portfolio, reviewed.
//
// `./portfolio-metrics` answers "what is it worth". This answers "is it built well", which is a
// different question and a harder one to be honest about. Everything here is arithmetic over
// measured positions: concentration is a real weight, diversification is a real Herfindahl index,
// a rebalance is a real number of shares. Nothing forecasts a price and nothing tells the reader
// to buy or sell — a finding says what is true of the book and what the arithmetic of fixing it
// would be, and the decision stays theirs.
//
// The findings are the point rather than the grade. A single letter is easy to look at and easy to
// argue with; the list underneath is what a reader can actually act on, so the grade is derived
// from the findings rather than the other way round.

import type { BoardBrief } from "./board-read";
import { formatMoney, formatPercent, type HoldingMetrics, type PortfolioSummary } from "./portfolio-metrics";

export type Severity = "critical" | "warning" | "note" | "good";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  /** What is true, in one sentence, with the figure that makes it true. */
  detail: string;
  /** What the arithmetic of addressing it looks like. Never phrased as an instruction to trade. */
  action: string | null;
  /** The positions this is about, so the UI can link straight to them. */
  symbols: string[];
};

export type PortfolioReview = {
  findings: Finding[];
  /** A-E, derived from the findings. */
  grade: string;
  /** 0-100, the score the grade is cut from. */
  score: number;
  /** Sum of squared weights, 0-1. 1 is one stock; 0.1 is ten evenly weighted ones. */
  herfindahl: number;
  /** The count of evenly-weighted positions the book behaves like. 1/herfindahl. */
  effectiveHoldings: number;
  /** How many owned, priced positions are above their cost. */
  winners: number;
  losers: number;
  /** Positions carrying a target the reader set, and how many have reached it. */
  withTargets: number;
  targetsReached: number;
  /** Suggested trims: positions over the weight cap, and the rupees above it. */
  rebalance: { symbol: string; weight: number; excessValue: number; suggestedTrim: number }[];
};

/**
 * The weight above which one position is steering the book.
 *
 * A quarter is a judgement, not a law, and it is deliberately on the permissive side: an investor
 * with real conviction in five names is not doing anything wrong, and a review that flags every
 * concentrated book as broken is a review nobody reads twice. Past a quarter, though, the book's
 * return is that company's return, and that is worth saying out loud.
 */
export const WEIGHT_CAP = 0.25;

/** Below this many effective holdings, the book is not diversified in any meaningful sense. */
const THIN_BOOK = 4;

/** A position down this much is not noise; it is a thesis worth rereading. */
const DEEP_LOSS_PERCENT = -20;

function owned(holdings: HoldingMetrics[]): HoldingMetrics[] {
  return holdings.filter((holding) => !holding.tracked && holding.value !== null);
}

/**
 * The Herfindahl index of the book's weights.
 *
 * Sum of squared shares. It is the standard concentration measure for exactly this shape of
 * question, and its reciprocal — the "effective number of holdings" — is the figure worth showing
 * a reader: a book of twelve stocks where one is 60% behaves like a book of about three.
 */
export function herfindahl(holdings: HoldingMetrics[]): number {
  const positions = owned(holdings);
  const total = positions.reduce((sum, holding) => sum + (holding.value ?? 0), 0);
  if (total <= 0) return 0;

  return positions.reduce((sum, holding) => {
    const weight = (holding.value ?? 0) / total;
    return sum + weight * weight;
  }, 0);
}

/** Positions over the cap, with the rupees and shares that would bring each back to it. */
export function rebalancePlan(holdings: HoldingMetrics[], cap = WEIGHT_CAP): PortfolioReview["rebalance"] {
  return owned(holdings)
    .filter((holding) => holding.weight > cap)
    .map((holding) => {
      const value = holding.value ?? 0;
      const excessValue = value - value * (cap / holding.weight);
      return {
        symbol: holding.symbol,
        weight: holding.weight,
        excessValue: Math.round(excessValue),
        // Shares rather than rupees as well, because that is the number an order needs. Floored:
        // trimming a fraction of a share is not an order anybody can place.
        suggestedTrim: holding.price && holding.price > 0 ? Math.floor(excessValue / holding.price) : 0,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

const SEVERITY_COST: Record<Severity, number> = { critical: 25, warning: 12, note: 4, good: 0 };

/**
 * Every finding the arithmetic supports, worst first.
 *
 * Each one is generated only when its condition actually holds, so an empty list means a book with
 * nothing to flag rather than a check that did not run.
 */
export function reviewFindings(summary: PortfolioSummary): Finding[] {
  const findings: Finding[] = [];
  const positions = owned(summary.holdings);
  const index = herfindahl(summary.holdings);
  const effective = index > 0 ? 1 / index : 0;

  if (positions.length === 0) {
    return [
      {
        id: "empty",
        severity: "note",
        title: "Nothing priced to review yet",
        detail: "There are no owned positions the price feed could value, so there is nothing to measure.",
        action: "Add a holding with a quantity and the price you paid.",
        symbols: [],
      },
    ];
  }

  // --- Concentration -------------------------------------------------------
  const heaviest = positions.reduce((peak, holding) => (holding.weight > peak.weight ? holding : peak), positions[0]);
  if (heaviest.weight > 0.4) {
    findings.push({
      id: "concentration-critical",
      severity: "critical",
      title: `${heaviest.symbol} is ${Math.round(heaviest.weight * 100)}% of the book`,
      detail: `At this weight the portfolio's return is largely ${heaviest.symbol}'s return. A bad quarter there is a bad quarter everywhere.`,
      action: `Trimming to ${Math.round(WEIGHT_CAP * 100)}% would move about ${formatMoney((heaviest.value ?? 0) * (1 - WEIGHT_CAP / heaviest.weight))} into other positions.`,
      symbols: [heaviest.symbol],
    });
  } else if (heaviest.weight > WEIGHT_CAP) {
    findings.push({
      id: "concentration-warning",
      severity: "warning",
      title: `${heaviest.symbol} carries ${Math.round(heaviest.weight * 100)}% of market value`,
      detail: `Above about ${Math.round(WEIGHT_CAP * 100)}%, one company starts to set the book's direction on its own.`,
      action: "Worth deciding deliberately rather than by drift — a winner grows into this weight without anybody choosing it.",
      symbols: [heaviest.symbol],
    });
  }

  // --- Diversification -----------------------------------------------------
  if (effective > 0 && effective < THIN_BOOK) {
    findings.push({
      id: "thin-book",
      severity: positions.length >= 6 ? "warning" : "note",
      title: `The book behaves like ${effective.toFixed(1)} holdings`,
      detail:
        positions.length > effective + 1
          ? `There are ${positions.length} positions, but the weights are uneven enough that they move like ${effective.toFixed(1)} evenly-sized ones.`
          : `${positions.length} priced position${positions.length === 1 ? "" : "s"} is a concentrated book by construction.`,
      action: "Evening out the weights raises this number without needing a single new name.",
      symbols: [],
    });
  }

  if (summary.mix.length === 1 && positions.length > 2) {
    findings.push({
      id: "single-tier",
      severity: "note",
      title: `Everything sits in ${summary.mix[0].label} cap`,
      detail: "Large, mid and small caps lead at different points in a cycle; a book in one tier gets one of those cycles.",
      action: "A screen filtered to a tier you hold nothing in is the shortest way to see the alternatives.",
      symbols: [],
    });
  }

  // --- Performance ---------------------------------------------------------
  const deepLosses = positions.filter((holding) => (holding.pnlPercent ?? 0) <= DEEP_LOSS_PERCENT);
  if (deepLosses.length > 0) {
    findings.push({
      id: "deep-losses",
      severity: deepLosses.length > 2 ? "warning" : "note",
      title: `${deepLosses.length} position${deepLosses.length === 1 ? " is" : "s are"} down more than ${Math.abs(DEEP_LOSS_PERCENT)}%`,
      detail: deepLosses.map((holding) => `${holding.symbol} ${formatPercent(holding.pnlPercent)}`).join(", ") + ".",
      action: "Reread the note you left on each. A thesis that no longer holds is the reason to act; the price alone is not.",
      symbols: deepLosses.map((holding) => holding.symbol),
    });
  }

  const noCostBasis = summary.holdings.filter((holding) => !holding.tracked && holding.invested <= 0);
  if (noCostBasis.length > 0) {
    findings.push({
      id: "no-cost-basis",
      severity: "note",
      title: `${noCostBasis.length} owned position${noCostBasis.length === 1 ? " has" : "s have"} no buy price`,
      detail: "Without a cost, there is no return to measure — these sit outside every P&L figure on the page.",
      action: "Adding the average price you paid brings them into the totals.",
      symbols: noCostBasis.map((holding) => holding.symbol),
    });
  }

  if (summary.unpriced > 0) {
    findings.push({
      id: "unpriced",
      severity: "note",
      title: `${summary.unpriced} owned position${summary.unpriced === 1 ? "" : "s"} could not be priced`,
      detail: "The feed had no price for these, so they are excluded from market value rather than counted as zero.",
      action: null,
      symbols: [],
    });
  }

  // --- Targets -------------------------------------------------------------
  const withTargets = summary.holdings.filter((holding) => holding.targetPrice !== null);
  const reached = withTargets.filter((holding) => holding.targetProgress !== null && holding.targetProgress >= 1);
  if (reached.length > 0) {
    findings.push({
      id: "targets-reached",
      severity: "good",
      title: `${reached.length} position${reached.length === 1 ? " has" : "s have"} reached the target you set`,
      detail: reached.map((holding) => `${holding.symbol} at ${formatMoney(holding.price)} against a ${formatMoney(holding.targetPrice)} target`).join(", ") + ".",
      action: "This is the moment the target was set for — either take it, or move it deliberately.",
      symbols: reached.map((holding) => holding.symbol),
    });
  }
  if (withTargets.length === 0 && positions.length > 0) {
    findings.push({
      id: "no-targets",
      severity: "note",
      title: "No position carries a price target",
      detail: "Without one, there is no point at which a decision was planned in advance.",
      action: "A target on each holding turns the cards above into a checklist rather than a scoreboard.",
      symbols: [],
    });
  }

  // --- Something going right ----------------------------------------------
  if (summary.best && (summary.best.pnlPercent ?? 0) > 0) {
    findings.push({
      id: "leader",
      severity: "good",
      title: `${summary.best.symbol} is carrying the book at ${formatPercent(summary.best.pnlPercent)}`,
      detail: `Worth ${formatMoney(summary.best.value)} against ${formatMoney(summary.best.invested)} invested.`,
      action: null,
      symbols: [summary.best.symbol],
    });
  }

  const ORDER: Severity[] = ["critical", "warning", "note", "good"];
  return findings.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
}

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "E";
}

/** The whole review. */
export function reviewPortfolio(summary: PortfolioSummary): PortfolioReview {
  const findings = reviewFindings(summary);
  const positions = owned(summary.holdings);
  const index = herfindahl(summary.holdings);

  const score = Math.max(
    0,
    Math.min(100, 100 - findings.reduce((cost, finding) => cost + SEVERITY_COST[finding.severity], 0)),
  );

  const withTargets = summary.holdings.filter((holding) => holding.targetPrice !== null);

  return {
    findings,
    score,
    grade: gradeFor(score),
    herfindahl: index,
    effectiveHoldings: index > 0 ? 1 / index : 0,
    winners: positions.filter((holding) => (holding.pnl ?? 0) > 0).length,
    losers: positions.filter((holding) => (holding.pnl ?? 0) < 0).length,
    withTargets: withTargets.length,
    targetsReached: withTargets.filter((holding) => holding.targetProgress !== null && holding.targetProgress >= 1).length,
    rebalance: rebalancePlan(summary.holdings),
  };
}

/**
 * The review's figures, for the AI to write over.
 *
 * The findings go in as highlights, which is the whole trick: the model is handed conclusions that
 * arithmetic already reached and asked to say what they mean together. It is never handed raw
 * prices and asked to draw a conclusion of its own.
 */
export function reviewBrief(summary: PortfolioSummary, review: PortfolioReview): BoardBrief | null {
  if (summary.holdings.length === 0) return null;

  const facts = [
    { label: "Structure grade", value: `${review.grade} (${review.score}/100)` },
    { label: "Effective holdings", value: review.effectiveHoldings > 0 ? review.effectiveHoldings.toFixed(1) : "—" },
    { label: "Largest weight", value: `${Math.round(summary.concentration * 100)}%` },
    { label: "Winners vs losers", value: `${review.winners} up, ${review.losers} down` },
    { label: "Market value", value: formatMoney(summary.value) },
    { label: "Unrealised P&L", value: `${formatMoney(summary.pnl)} (${formatPercent(summary.pnlPercent)})` },
  ].filter((fact) => fact.value !== "—");

  const highlights = review.findings.slice(0, 6).map((finding) => `${finding.title}. ${finding.detail}`);

  for (const trim of review.rebalance.slice(0, 2)) {
    highlights.push(
      `Bringing ${trim.symbol} back to ${Math.round(WEIGHT_CAP * 100)}% would free about ${formatMoney(trim.excessValue)}.`,
    );
  }

  return {
    subject: "a structural review of one investor's own portfolio — concentration, diversification and what is working",
    question: "What is the single most important thing to address in how this book is built?",
    facts,
    highlights,
  };
}
