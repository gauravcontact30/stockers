// Everything shown when a reader clicks one stock.
//
// The one rule this file follows: every number it returns is one the exchange published, and any
// number the archive cannot reach is returned as null rather than estimated. Nothing here is
// modelled, smoothed or filled in — a chart drawn from invented points would look exactly like a
// chart drawn from real ones, which is why there are none.
//
// Two things are assembled:
//
//   the company itself, as BSE has it — the live quote, the identifiers, and its return measured
//   over every window the Bhavcopy archive reaches, each stamped with the session it is measured
//   from so a reader can check it;
//
//   the three strongest performers in that company's own BSE category over a year, measured the
//   same way, so the comparison is like for like.

import { getBseDirectory, getBseMovers, type BseRow } from "./bse-market";
import { getBaseline, HISTORY_PERIODS, overallReturn, periodReturn, type Baseline } from "./bse-history";

/** How many peers the stock-detail modal shows by default. */
export const PEER_COUNT = 3;
/** The window the peer ranking is run over — long enough to mean something, short enough to be current. */
export const PEER_PERIOD = "1y" as const;

export type TrajectoryPoint = {
  /** The lookback window this close was taken from — "1y", "6m", … — or "now" for the live price. */
  period: string;
  /** The session the close is from, as YYYY-MM-DD. Null only for the live point. */
  date: string | null;
  close: number;
};

export type DetailStock = {
  code: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  capTier: string | null;
  group: string;
  isin: string;
  rank: number | null;
  marketCapCr: number | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
  trades: number | null;
  /** Return per window, keyed 1w/1m/3m/6m/1y/3y/5y. Null where the archive does not reach. */
  returns: Record<string, number | null>;
  /** The session each window is measured against, so no figure is undated. */
  measuredFrom: Record<string, string | null>;
  /** Oldest close first, ending at the live price — the series the chart is drawn from. */
  trajectory: TrajectoryPoint[];
};

export type StockDetail = {
  stock: DetailStock;
  /** The strongest performers in the same BSE category, best first. Empty if it has no category. */
  peers: DetailStock[];
  /** Exactly which population the three were ranked out of, for the panel to state. */
  peerBasis: {
    category: string;
    /** The cap tier the ranking was confined to, or null when it had to widen to the whole category. */
    capTier: string | null;
    period: string;
  } | null;
  /** The session the live prices are from. */
  sessionDate: string | null;
  /** Present when the category is known but had too few priced companies to rank. */
  note: string | null;
};

function stockIdentifiers(row: BseRow): string[] {
  return [row.code, row.ticker, row.isin].filter((value) => value.length > 0);
}

/** Returns for one scrip across every window, from baselines already in hand. */
function returnsFor(row: BseRow, price: number | null, baselines: Baseline[]): Record<string, number | null> {
  const identifiers = stockIdentifiers(row);
  const returns: Record<string, number | null> = {};
  HISTORY_PERIODS.forEach((period, index) => {
    returns[period] = price === null ? null : periodReturn(identifiers, price, baselines[index]);
  });
  returns.overall = price === null ? null : overallReturn(identifiers, price, baselines);
  return returns;
}

/**
 * The price path behind those returns.
 *
 * HISTORY_PERIODS runs longest-window-first, which is already oldest-close-first — the order a
 * chart is drawn in. A window whose baseline has no close for this scrip is dropped rather than
 * interpolated: a company listed two years ago genuinely has no five-year point, and inventing one
 * would draw a line through a price that never existed.
 */
function trajectoryFor(row: BseRow, price: number | null, baselines: Baseline[]): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const identifiers = stockIdentifiers(row);

  // HISTORY_PERIODS is longest-window-first ("5y" … "1w"), which is already oldest close first.
  HISTORY_PERIODS.forEach((period, index) => {
    const close = identifiers.map((identifier) => baselines[index].prices.get(identifier)).find((value) => value !== undefined && value > 0);
    if (close !== undefined && close > 0) {
      points.push({ period, date: baselines[index].date, close });
    }
  });

  if (price !== null && price > 0) {
    points.push({ period: "now", date: null, close: price });
  }

  return points;
}

function overallMeasuredFrom(row: BseRow, baselines: Baseline[]): string | null {
  const identifiers = stockIdentifiers(row);
  return baselines.find((baseline) => identifiers.some((identifier) => baseline.prices.has(identifier)))?.date ?? null;
}

function toDetail(row: BseRow, baselines: Baseline[], measuredFrom: Record<string, string | null>): DetailStock {
  return {
    code: row.code,
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    industry: row.industry,
    capTier: row.capTier,
    group: row.group,
    isin: row.isin,
    rank: row.rank,
    marketCapCr: row.marketCapCr,
    price: row.price,
    previousClose: row.previousClose,
    change: row.change,
    changePercent: row.changePercent,
    open: row.open,
    dayHigh: row.dayHigh,
    dayLow: row.dayLow,
    volume: row.volume,
    turnoverCr: row.turnoverCr,
    trades: row.trades,
    returns: returnsFor(row, row.price, baselines),
    measuredFrom: { ...measuredFrom, overall: overallMeasuredFrom(row, baselines) },
    trajectory: trajectoryFor(row, row.price, baselines),
  };
}

/**
 * Finds the one company a click meant.
 *
 * The directory matches on name, ticker, code and ISIN and sorts by market cap, so the first row
 * is the largest match rather than necessarily the right one. An exact ticker or code match is
 * preferred explicitly; only if neither is found does the top hit stand in.
 */
function pickRow(rows: BseRow[], query: string): BseRow | null {
  const needle = query.trim().toUpperCase();
  return (
    rows.find((row) => row.ticker.toUpperCase() === needle) ??
    rows.find((row) => row.code === needle) ??
    rows.find((row) => row.isin.toUpperCase() === needle) ??
    rows[0] ??
    null
  );
}

/**
 * The best one-year performers in a category, whatever the sign of the move.
 *
 * "Top performing" has to mean best-ranked, not merely positive. getBseMovers splits the board
 * into gainers and losers and drops everything on the wrong side of zero, so asking it only for
 * gainers returned nothing at all for a sector that is down across the board — as Energy currently
 * is. Positives are taken first, best first; if that does not fill the three, the shortfall comes
 * from the *shallowest* losses, which sit on the last page of the losers board because that list
 * is ordered worst-first.
 */
async function rankedWithin(
  category: string,
  tier: "all" | "large" | "mid" | "small",
  excludeCode: string,
  peerCount = PEER_COUNT,
): Promise<BseRow[]> {
  const wanted = peerCount + 1; // one spare, since the company itself usually ranks in its own category
  const shared = { category, tier, period: PEER_PERIOD } as const;

  const gainers = await getBseMovers({ ...shared, direction: "gainers", pageSize: wanted });
  const picked = gainers.rows.filter((peer) => peer.code !== excludeCode);
  if (picked.length >= peerCount) return picked.slice(0, peerCount);

  // Ask for the losers board's final page, then reverse it: its tail is the least-bad performers.
  const probe = await getBseMovers({ ...shared, direction: "losers", pageSize: wanted });
  if (probe.total === 0) return picked.slice(0, peerCount);

  const tail = await getBseMovers({ ...shared, direction: "losers", pageSize: wanted, page: probe.pages });
  const shallowest = [...tail.rows].reverse().filter((peer) => peer.code !== excludeCode);

  return [...picked, ...shallowest].slice(0, peerCount);
}

const TIER_KEY: Record<string, "large" | "mid" | "small"> = { Large: "large", Mid: "mid", Small: "small" };

/**
 * The three the company is actually worth being compared against.
 *
 * Ranking a category by one-year return alone puts a ₹40-crore shell that rose 4,000% next to TCS,
 * which is arithmetically true and useless — nobody weighing TCS wants that row. So the ranking is
 * run inside the company's own cap tier first, and only widens to the whole category when the tier
 * cannot field three. `matchedTier` says which of the two happened, and the panel prints it, so the
 * comparison never claims to be narrower than it was.
 */
async function topPerformersIn(
  category: string,
  capTier: string | null,
  excludeCode: string,
  peerCount = PEER_COUNT,
): Promise<{ rows: BseRow[]; matchedTier: boolean }> {
  const tier = capTier ? TIER_KEY[capTier] : undefined;

  if (tier) {
    const withinTier = await rankedWithin(category, tier, excludeCode, peerCount);
    if (withinTier.length >= peerCount) return { rows: withinTier, matchedTier: true };
  }

  return { rows: await rankedWithin(category, "all", excludeCode, peerCount), matchedTier: false };
}

/**
 * One company in full, with the top performers of its own category beside it.
 *
 * The seven Bhavcopy baselines are fetched once and reused for the company and all three peers —
 * they cover the whole exchange, so measuring four scrips costs the same as measuring one.
 */
export async function getStockDetail(query: string, peerCount = PEER_COUNT): Promise<StockDetail | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const directory = await getBseDirectory({ q: trimmed, pageSize: 10 });
  const row = pickRow(directory.rows, trimmed);
  if (!row) return null;

  const baselines = await Promise.all(HISTORY_PERIODS.map((period) => getBaseline(period)));

  const measuredFrom: Record<string, string | null> = {};
  HISTORY_PERIODS.forEach((period, index) => {
    measuredFrom[period] = baselines[index].date;
  });

  const stock = toDetail(row, baselines, measuredFrom);

  const category = row.sector;
  if (!category) {
    return {
      stock,
      peers: [],
      peerBasis: null,
      sessionDate: directory.sessionDate,
      note: "BSE has not classified this company into a category, so there is nothing to compare it against.",
    };
  }

  const ranked = await topPerformersIn(category, row.capTier, row.code, peerCount);
  const peers = ranked.rows.map((peer) => toDetail(peer, baselines, measuredFrom));

  return {
    stock,
    peers,
    peerBasis: {
      category,
      capTier: ranked.matchedTier ? row.capTier : null,
      period: PEER_PERIOD,
    },
    sessionDate: directory.sessionDate,
    note:
      peers.length === 0
        ? `No other company in ${category} has a one-year reading in the exchange archive yet. BSE classifies the exchange one company at a time, so this category is still filling in.`
        : null,
  };
}
