// What a portfolio is worth, and what that says.
//
// Pure: holdings in, prices in, figures out. No fetching, no clock, no React. The Portfolio page
// is mostly arithmetic — cost against market value, weight against concentration, a target against
// the distance still to run — and arithmetic buried in a component is arithmetic nobody can check.
//
// Every number here is measured. Nothing is estimated, nothing is annualised, and a stock the
// price feed could not answer for stays null all the way to the card rather than being quietly
// treated as zero — a holding worth "unknown" must never read as a holding worth nothing.

import type { BoardBrief } from "./board-read";
import type { Holding } from "./portfolio";

/**
 * The part of a price feed's answer this file needs.
 *
 * Declared locally rather than imported from the client hook that produces it: the shapes are
 * structurally compatible, and this keeps a pure module free of a `"use client"` import.
 */
export type PriceSnapshot = {
  symbol: string;
  name?: string | null;
  price: number | null;
  previousClose?: number | null;
  oneDay?: number | null;
  oneMonth?: number | null;
  sixMonth?: number | null;
  oneYear?: number | null;
  capTier?: "Large" | "Mid" | "Small" | null;
};

export type HoldingMetrics = {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  targetPrice: number | null;
  note: string | null;
  price: number | null;
  capTier: "Large" | "Mid" | "Small" | null;
  oneDay: number | null;
  oneMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  /** What the position cost: quantity x average price. Zero for a tracked-only row. */
  invested: number;
  /** What it is worth now, or null when the feed had no price. */
  value: number | null;
  /** Value less cost, in rupees. Null when either side is unknown. */
  pnl: number | null;
  /** The same as a percentage of cost. Null when there is no cost to measure against. */
  pnlPercent: number | null;
  /** Today's move in rupees across the whole position. */
  dayChange: number | null;
  /** This position's share of the portfolio's market value, 0-1. */
  weight: number;
  /** How far the price has travelled from cost towards the target, 0-1. Null without a target. */
  targetProgress: number | null;
  /** True when the row is being watched rather than owned — no units, no money at risk. */
  tracked: boolean;
};

export type PortfolioSummary = {
  holdings: HoldingMetrics[];
  /** Total cost of the owned positions. */
  invested: number;
  /** Total market value of the owned positions the feed could price. */
  value: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  owned: number;
  tracked: number;
  /** Owned positions the price feed could not answer for — the totals exclude them, so say so. */
  unpriced: number;
  best: HoldingMetrics | null;
  worst: HoldingMetrics | null;
  /** The largest single weight, 0-1. The blunt measure of how concentrated the book is. */
  concentration: number;
  /** Market value by market-cap tier, largest first. */
  mix: { label: string; value: number; weight: number }[];
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One position, priced. `total` is the portfolio's market value, for the weight. */
export function measureHolding(holding: Holding, snapshot: PriceSnapshot | null, total: number): HoldingMetrics {
  const price = finite(snapshot?.price);
  const previousClose = finite(snapshot?.previousClose);
  const tracked = holding.quantity <= 0;

  const invested = holding.quantity * holding.avgPrice;
  const value = price === null ? null : holding.quantity * price;
  // A position with no cost basis has no return to report — a tracked row, or one added without a
  // buy price. Reporting 0% there would read as "flat", which is a claim, not an absence.
  const pnl = value === null || invested <= 0 ? null : value - invested;
  const pnlPercent = pnl === null ? null : (pnl / invested) * 100;

  const dayChange = price === null || previousClose === null ? null : holding.quantity * (price - previousClose);

  // Progress from what they paid to what they are aiming for. Clamped at both ends: past the
  // target the bar is full, below cost it is empty, and neither is a number worth exaggerating.
  const span = holding.targetPrice === null ? 0 : holding.targetPrice - holding.avgPrice;
  const targetProgress =
    holding.targetPrice === null || price === null || span <= 0
      ? null
      : Math.max(0, Math.min(1, (price - holding.avgPrice) / span));

  return {
    symbol: holding.symbol,
    name: snapshot?.name ?? null,
    quantity: holding.quantity,
    avgPrice: holding.avgPrice,
    targetPrice: holding.targetPrice,
    note: holding.note,
    price,
    capTier: snapshot?.capTier ?? null,
    oneDay: finite(snapshot?.oneDay),
    oneMonth: finite(snapshot?.oneMonth),
    sixMonth: finite(snapshot?.sixMonth),
    oneYear: finite(snapshot?.oneYear),
    invested,
    value,
    pnl,
    pnlPercent,
    dayChange,
    weight: total > 0 && value !== null ? value / total : 0,
    targetProgress,
    tracked,
  };
}

const MIX_ORDER = ["Large", "Mid", "Small", "Unclassified"] as const;

export function summarisePortfolio(holdings: Holding[], prices: Map<string, PriceSnapshot>): PortfolioSummary {
  // Two passes: the market value has to be known before any weight can be, and a weight computed
  // against a running total would give the first row a bigger share than the last.
  const total = holdings.reduce((sum, holding) => {
    const price = finite(prices.get(holding.symbol)?.price);
    return price === null ? sum : sum + holding.quantity * price;
  }, 0);

  const measured = holdings.map((holding) => measureHolding(holding, prices.get(holding.symbol) ?? null, total));
  const owned = measured.filter((holding) => !holding.tracked);

  const invested = owned.reduce((sum, holding) => (holding.value === null ? sum : sum + holding.invested), 0);
  const value = owned.reduce((sum, holding) => sum + (holding.value ?? 0), 0);
  const dayChange = owned.reduce((sum, holding) => sum + (holding.dayChange ?? 0), 0);
  const pnl = value - invested;

  // Ranked on percentage rather than rupees: the biggest rupee gain is usually just the biggest
  // position, which tells the reader something they already knew.
  const ranked = owned.filter((holding) => holding.pnlPercent !== null).sort((a, b) => b.pnlPercent! - a.pnlPercent!);

  const byTier = new Map<string, number>();
  for (const holding of owned) {
    if (holding.value === null) continue;
    const label = holding.capTier ?? "Unclassified";
    byTier.set(label, (byTier.get(label) ?? 0) + holding.value);
  }

  return {
    holdings: measured,
    invested,
    value,
    pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
    dayChange,
    // Measured against yesterday's close of the same positions, which is what the day's move is a
    // move from — not against today's value, which already contains it.
    dayChangePercent: value - dayChange > 0 ? (dayChange / (value - dayChange)) * 100 : 0,
    owned: owned.length,
    tracked: measured.length - owned.length,
    unpriced: owned.filter((holding) => holding.value === null).length,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    concentration: owned.reduce((peak, holding) => Math.max(peak, holding.weight), 0),
    mix: MIX_ORDER.filter((label) => byTier.has(label)).map((label) => ({
      label,
      value: byTier.get(label) as number,
      weight: total > 0 ? (byTier.get(label) as number) / total : 0,
    })),
  };
}

/**
 * The book split into what is working and what is not.
 *
 * Three groups, not two, and the third is the point. A position the price feed could not answer
 * for, and a stock being tracked rather than owned, are neither winning nor losing — filing them
 * under "not performing" would put a stock nobody has bought yet in the same card as a real loss,
 * which is exactly the mistake this split exists to prevent.
 *
 * Ranked by percentage rather than by rupees within each group: the biggest rupee gain is usually
 * just the biggest position, which tells the reader something they already knew.
 */
export type PerformanceSplit = {
  /** Owned, priced, and worth at least what it cost. */
  performing: HoldingMetrics[];
  /** Owned, priced, and worth less than it cost. */
  lagging: HoldingMetrics[];
  /** Watched rather than owned, or owned but unpriceable — no verdict either way. */
  watching: HoldingMetrics[];
  /** Total unrealised gain across `performing`. */
  performingPnl: number;
  /** Total unrealised loss across `lagging`, as a negative number. */
  laggingPnl: number;
};

export function splitByPerformance(holdings: HoldingMetrics[]): PerformanceSplit {
  const performing: HoldingMetrics[] = [];
  const lagging: HoldingMetrics[] = [];
  const watching: HoldingMetrics[] = [];

  for (const holding of holdings) {
    if (holding.pnl === null) watching.push(holding);
    else if (holding.pnl >= 0) performing.push(holding);
    else lagging.push(holding);
  }

  const byReturn = (a: HoldingMetrics, b: HoldingMetrics) => (b.pnlPercent ?? 0) - (a.pnlPercent ?? 0);
  const sum = (rows: HoldingMetrics[]) => rows.reduce((total, row) => total + (row.pnl ?? 0), 0);

  return {
    // Best first among the winners, worst first among the losers: each card opens on the row the
    // reader most needs to see.
    performing: [...performing].sort(byReturn),
    lagging: [...lagging].sort((a, b) => byReturn(b, a)),
    watching: [...watching].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    performingPnl: sum(performing),
    laggingPnl: sum(lagging),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: value >= 1000 || value <= -1000 ? 0 : 2 })}`;
}

/** Money with its direction on the front, for a figure that can go either way. */
export function formatSignedMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${formatMoney(value)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

/** Emerald for up, rose for down, slate for unknown — the app's tone for a signed figure. */
export function toneFor(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "text-slate-400 dark:text-slate-500";
  return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

// ---------------------------------------------------------------------------
// The brief the AI reads
// ---------------------------------------------------------------------------

/**
 * The portfolio's own figures, in the shape the board-read endpoint narrates.
 *
 * Built from what is already on screen, so the read can only ever describe the portfolio the
 * reader is looking at — the model is handed measured numbers and told to write over them, never
 * asked what it thinks the market is doing. Null when there is nothing yet to read.
 */
export function portfolioBrief(summary: PortfolioSummary): BoardBrief | null {
  if (summary.holdings.length === 0) return null;

  const facts = [
    { label: "Market value", value: formatMoney(summary.value) },
    { label: "Invested", value: formatMoney(summary.invested) },
    { label: "Unrealised P&L", value: `${formatSignedMoney(summary.pnl)} (${formatPercent(summary.pnlPercent)})` },
    { label: "Today", value: `${formatSignedMoney(summary.dayChange)} (${formatPercent(summary.dayChangePercent)})` },
    { label: "Positions", value: `${summary.owned} owned, ${summary.tracked} tracked` },
    { label: "Largest weight", value: `${Math.round(summary.concentration * 100)}% of the book` },
  ].filter((fact) => fact.value !== "—");

  const highlights: string[] = [];
  if (summary.best) {
    highlights.push(`${summary.best.symbol} is the strongest position at ${formatPercent(summary.best.pnlPercent)}.`);
  }
  if (summary.worst) {
    highlights.push(`${summary.worst.symbol} is the weakest at ${formatPercent(summary.worst.pnlPercent)}.`);
  }
  for (const slice of summary.mix) {
    highlights.push(`${slice.label} cap holdings are ${Math.round(slice.weight * 100)}% of market value.`);
  }
  if (summary.unpriced > 0) {
    highlights.push(`${summary.unpriced} owned position(s) could not be priced and are outside these totals.`);
  }

  if (facts.length === 0 && highlights.length === 0) return null;

  return {
    subject: "one investor's own portfolio of Indian listed stocks, priced at the latest exchange close",
    question: "What does this mix say about concentration, momentum and what deserves attention first?",
    facts,
    highlights,
  };
}
