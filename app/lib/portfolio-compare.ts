// Portfolio stocks, side by side.
//
// The dashboard already compares any two or three listed companies. This compares the ones the
// reader owns, which is a different question: not "which is the better company" but "which of my
// positions is actually earning its place". That question can only be asked against a cost basis,
// a weight and a target — figures a general comparison does not have and this one does.
//
// Pure. Everything is measured off `HoldingMetrics`, which is itself measured off the price feed,
// so a column with no data stays blank rather than being scored as zero. A stock that could not be
// priced does not lose a comparison; it simply is not in one.

import type { BoardBrief } from "./board-read";
import { formatMoney, formatPercent, type HoldingMetrics } from "./portfolio-metrics";

export type MetricKey = "pnlPercent" | "oneDay" | "oneMonth" | "sixMonth" | "oneYear" | "weight" | "targetProgress";

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** How the figure reads on a card. */
  format: (value: number | null) => string;
  /**
   * Whether a bigger number is better.
   *
   * Weight is the interesting one: it is `null` because there is no such thing as winning on
   * weight. A 40% position is not beating a 5% one, it is simply larger — and ranking it as a
   * winner would quietly tell the reader that concentration is an achievement.
   */
  higherIsBetter: boolean | null;
  hint: string;
};

export const METRICS: MetricDef[] = [
  {
    key: "pnlPercent",
    label: "Return on cost",
    format: formatPercent,
    higherIsBetter: true,
    hint: "What the position has done since you bought it",
  },
  { key: "oneDay", label: "Today", format: formatPercent, higherIsBetter: true, hint: "Today's move" },
  { key: "oneMonth", label: "1 month", format: formatPercent, higherIsBetter: true, hint: "The last month, from the exchange archive" },
  { key: "sixMonth", label: "6 months", format: formatPercent, higherIsBetter: true, hint: "The last six months" },
  { key: "oneYear", label: "1 year", format: formatPercent, higherIsBetter: true, hint: "The last year" },
  {
    key: "weight",
    label: "Weight",
    format: (value) => (value === null ? "—" : `${Math.round(value * 100)}%`),
    higherIsBetter: null,
    hint: "Share of the book's market value — larger is not better, only larger",
  },
  {
    key: "targetProgress",
    label: "To target",
    format: (value) => (value === null ? "—" : `${Math.round(value * 100)}%`),
    higherIsBetter: true,
    hint: "How far from your cost to the target you set",
  },
];

export type MetricRow = {
  metric: MetricDef;
  values: { symbol: string; value: number | null }[];
  /** The symbol with the best figure, or null when the metric has no winner or no data. */
  winner: string | null;
};

export type ComparisonTable = {
  symbols: string[];
  holdings: HoldingMetrics[];
  rows: MetricRow[];
  /** Symbols ranked by how many metrics each leads. */
  leaderboard: { symbol: string; wins: number; name: string | null }[];
  /** The one that leads most metrics, or null on a tie or an empty comparison. */
  strongest: string | null;
  weakest: string | null;
};

/** Few enough that every column stays readable on a phone. */
export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

function valueOf(holding: HoldingMetrics, key: MetricKey): number | null {
  const value = holding[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The comparison table for a chosen set of holdings.
 *
 * Symbols that are not in the book are dropped rather than rendered empty — a column of dashes for
 * a stock the reader does not own is not a comparison, it is a bug they have to work out.
 */
export function compareHoldings(holdings: HoldingMetrics[], symbols: string[]): ComparisonTable {
  const wanted = symbols.map((symbol) => symbol.toUpperCase()).slice(0, MAX_COMPARE);
  const chosen = wanted
    .map((symbol) => holdings.find((holding) => holding.symbol.toUpperCase() === symbol))
    .filter((holding): holding is HoldingMetrics => holding !== undefined);

  const wins = new Map<string, number>(chosen.map((holding) => [holding.symbol, 0]));

  const rows: MetricRow[] = METRICS.map((metric) => {
    const values = chosen.map((holding) => ({ symbol: holding.symbol, value: valueOf(holding, metric.key) }));
    const scored = values.filter((entry): entry is { symbol: string; value: number } => entry.value !== null);

    let winner: string | null = null;
    // A metric only has a winner when it is directional and at least two positions could be
    // measured on it — "best of one" is not a comparison, it is the only answer there was.
    if (metric.higherIsBetter !== null && scored.length > 1) {
      const best = scored.reduce((leader, entry) =>
        metric.higherIsBetter ? (entry.value > leader.value ? entry : leader) : entry.value < leader.value ? entry : leader,
      );
      // A tie has no winner: highlighting one of two identical figures invents a distinction.
      const tied = scored.filter((entry) => entry.value === best.value).length > 1;
      if (!tied) {
        winner = best.symbol;
        wins.set(best.symbol, (wins.get(best.symbol) ?? 0) + 1);
      }
    }

    return { metric, values, winner };
  });

  const leaderboard = chosen
    .map((holding) => ({ symbol: holding.symbol, wins: wins.get(holding.symbol) ?? 0, name: holding.name }))
    .sort((a, b) => b.wins - a.wins || a.symbol.localeCompare(b.symbol));

  // Only called when the top and bottom are genuinely different, so a two-way tie reports neither.
  const decided = leaderboard.length > 1 && leaderboard[0].wins > leaderboard[leaderboard.length - 1].wins;

  return {
    symbols: chosen.map((holding) => holding.symbol),
    holdings: chosen,
    rows,
    leaderboard,
    strongest: decided ? leaderboard[0].symbol : null,
    weakest: decided ? leaderboard[leaderboard.length - 1].symbol : null,
  };
}

/**
 * Which holdings to compare when the reader has not chosen.
 *
 * The best and worst performers, then the largest by weight. That opening pair is the comparison
 * most worth seeing unprompted: it puts the position carrying the book next to the one dragging on
 * it, which is the question a reader opens this tab with.
 */
export function defaultComparison(holdings: HoldingMetrics[]): string[] {
  const ranked = holdings
    .filter((holding) => !holding.tracked && holding.pnlPercent !== null)
    .sort((a, b) => (b.pnlPercent ?? 0) - (a.pnlPercent ?? 0));

  if (ranked.length >= 2) return [ranked[0].symbol, ranked[ranked.length - 1].symbol];

  return holdings
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MIN_COMPARE)
    .map((holding) => holding.symbol);
}

/** The table's figures, for the board read above it. */
export function compareBrief(table: ComparisonTable): BoardBrief | null {
  if (table.holdings.length < MIN_COMPARE) return null;

  const facts = [
    { label: "Comparing", value: table.symbols.join(" vs ") },
    ...table.leaderboard.map((entry) => ({
      label: entry.symbol,
      value: `${entry.wins} of ${table.rows.filter((row) => row.metric.higherIsBetter !== null).length} metrics`,
    })),
  ];

  const highlights: string[] = [];

  for (const row of table.rows) {
    const readable = row.values
      .filter((entry) => entry.value !== null)
      .map((entry) => `${entry.symbol} ${row.metric.format(entry.value)}`)
      .join(", ");
    if (readable) highlights.push(`${row.metric.label}: ${readable}.`);
  }

  for (const holding of table.holdings) {
    if (holding.tracked) {
      highlights.push(`${holding.symbol} is tracked rather than owned, so it has no return on cost.`);
    } else {
      highlights.push(
        `${holding.symbol} is ${formatMoney(holding.value)} of the book against ${formatMoney(holding.invested)} invested.`,
      );
    }
  }

  return {
    subject: `a head-to-head of ${table.symbols.join(", ")} — all positions inside one investor's own portfolio`,
    question: "Which of these is earning its place in the book, and which is not?",
    facts: facts.slice(0, 8),
    highlights: highlights.slice(0, 8),
  };
}
