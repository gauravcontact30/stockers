import "server-only";

// What Indian investors are buying today, ranked — the list behind the rotating ribbon under the
// landing slider.
//
// ---------------------------------------------------------------------------
// What "most bought" can honestly mean
// ---------------------------------------------------------------------------
//
// No exchange or depository publishes a net retail buy figure intraday. Anyone showing a "most
// bought today" list is either quoting one broker's own customers or inferring it from the tape,
// and the difference matters enough to be written down rather than glossed over. Both real
// sources are used here, and neither is invented:
//
//   the brokers   Groww and the other tracked platforms publish their own most-bought lists, which
//                 is a true buying signal for their customers and nobody else's. Daily, not live.
//                 See ./broker-popularity.
//   the tape      the exchange publishes, per scrip, the value traded, the share count and — the
//                 useful one — the number of separate transactions. A stock printing tens of
//                 thousands of small trades while it rises is a stock a crowd is buying into; the
//                 same turnover in a handful of block-sized prints is two institutions, not a
//                 crowd. Average trade size is what separates those, and it is why the score below
//                 rewards a *small* one.
//
// The direction filter is what makes this a buying board rather than an activity board: a stock
// being sold off prints just as many trades as one being bought. Only scrips trading above their
// previous close are eligible, so the crowd on the board is a crowd on the bid.
//
// The rank is therefore a documented blend of public signals, not a measured order flow, and the
// UI says so. What it is not is a guess: every input is a real published number.

import { bseCatalogue, type CatalogueEntry } from "./bse-catalogue";
import { getBseTrending, type BseTrendingRow } from "./bse-market";
import { getQuotesFor, type LiveQuote, type QuoteSubject } from "./market-data";
import { marketSessionState, type MarketSessionState } from "./bse-ai-prediction-accuracy";

/** How deep into the trade-count board to look before scoring. */
const CANDIDATE_COUNT = 60;
/** How many of those get a live quote. Each is a network call, so this is deliberately small. */
const LIVE_QUOTE_COUNT = 24;
/** How many rows the ribbon is given. */
export const MOST_BOUGHT_COUNT = 12;

export type MostBoughtSignal =
  | "broker-list"
  | "retail-sized-trades"
  | "crowded-tape"
  | "heavy-turnover"
  | "strong-move";

export type MostBoughtRow = {
  /** 1 = most bought on this board right now. */
  buyRank: number;
  /** The blended score behind `buyRank`, 0-100. */
  buyScore: number;
  symbol: string;
  name: string;
  bseCode: string;
  sector: string | null;
  capTier: "Large" | "Mid" | "Small" | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  trades: number | null;
  turnoverCr: number | null;
  turnoverShare: number | null;
  averageTradeValue: number | null;
  /** Best placing across the brokers that publish a most-bought list; null when none lists it. */
  brokerRank: number | null;
  brokerNames: string[];
  /** Why this row is on the board, for the tooltip and the card. */
  signals: MostBoughtSignal[];
  live: boolean;
  asOf: string | null;
};

export type MostBoughtBoard = {
  rows: MostBoughtRow[];
  sessionDate: string | null;
  marketSession: MarketSessionState;
  /** True while the exchange is open, i.e. while this board is genuinely moving. */
  liveSession: boolean;
  asOf: string;
};

let catalogueById: Map<string, CatalogueEntry> | null = null;

function catalogueEntry(symbol: string, bseCode: string): CatalogueEntry | null {
  if (!catalogueById) {
    catalogueById = new Map<string, CatalogueEntry>();
    for (const entry of bseCatalogue()) {
      catalogueById.set(entry.symbol.toUpperCase(), entry);
      catalogueById.set(entry.scripCode.toUpperCase(), entry);
    }
  }
  return catalogueById.get(symbol.toUpperCase()) ?? catalogueById.get(bseCode.toUpperCase()) ?? null;
}

function quoteSubject(row: BseTrendingRow): QuoteSubject {
  const entry = catalogueEntry(row.ticker, row.code);
  return {
    symbol: (entry?.symbol ?? row.ticker).toUpperCase(),
    yahooSymbol: entry?.yahooSymbol ?? `${row.code}.BO`,
  };
}

/** 0-1, scaled against the strongest candidate rather than an absolute nobody can calibrate. */
function share(value: number | null, best: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || best <= 0) return 0;
  return Math.max(0, Math.min(1, value / best));
}

/**
 * 0-1, higher for *smaller* average trades.
 *
 * ₹15,000 a trade is a retail crowd; ₹15 lakh a trade is a desk. The scale is logarithmic because
 * the gap between those two is three orders of magnitude, and a linear one would score every
 * retail name identically at the bottom of the range.
 */
function retailTexture(averageTradeValue: number | null): number {
  if (typeof averageTradeValue !== "number" || !Number.isFinite(averageTradeValue) || averageTradeValue <= 0) return 0;
  const scale = (Math.log10(1_000_000) - Math.log10(averageTradeValue)) / (Math.log10(1_000_000) - Math.log10(10_000));
  return Math.max(0, Math.min(1, scale));
}

/** 0-1 against a 6% session move, above which extra upside says nothing more about crowding. */
function moveStrength(changePercent: number | null): number {
  if (typeof changePercent !== "number" || !Number.isFinite(changePercent)) return 0;
  return Math.max(0, Math.min(1, changePercent / 6));
}

/** 0-1 from a broker's own placing: their #1 scores full marks, their #20 barely registers. */
function brokerStanding(brokerRank: number | null): number {
  if (typeof brokerRank !== "number" || !Number.isFinite(brokerRank) || brokerRank <= 0) return 0;
  return Math.max(0, Math.min(1, (21 - brokerRank) / 20));
}

function signalsFor(row: BseTrendingRow, texture: number, changePercent: number | null): MostBoughtSignal[] {
  const signals: MostBoughtSignal[] = [];
  if (row.brokerRank !== null) signals.push("broker-list");
  if (texture >= 0.55) signals.push("retail-sized-trades");
  if ((row.trades ?? 0) >= 20_000) signals.push("crowded-tape");
  if ((row.turnoverShare ?? 0) >= 1) signals.push("heavy-turnover");
  if ((changePercent ?? 0) >= 3) signals.push("strong-move");
  return signals;
}

function withLiveQuote(row: BseTrendingRow, quote: LiveQuote | undefined): BseTrendingRow & { live: boolean; asOf: string | null } {
  if (!quote?.live) return { ...row, live: false, asOf: null };

  return {
    ...row,
    price: quote.price,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    dayHigh: quote.dayHigh ?? row.dayHigh,
    dayLow: quote.dayLow ?? row.dayLow,
    volume: quote.volume ?? row.volume,
    live: true,
    asOf: quote.asOf,
  };
}

/**
 * The buying board as it stands right now.
 *
 * Ordered by the blend described at the top of this file: how many people are trading it, how much
 * money that is, how retail-sized the prints are, how hard it is being marked up, and where the
 * brokers who publish a list place it. Live quotes are laid over the tape for the top candidates,
 * so a session that has moved since the last bhavcopy is scored on the moved prices — that is what
 * makes the ribbon change during the day rather than at the exchange's file cadence.
 */
export async function getMostBoughtToday(now = new Date()): Promise<MostBoughtBoard> {
  // Ranked by transaction count: the closest public proxy for "how many people", which is the
  // question this board asks. Turnover would answer "how much money", and that board is already
  // on the page under BSE trends.
  const board = await getBseTrending({ rank: "trades", page: 1, pageSize: CANDIDATE_COUNT });

  const quoted = board.rows.slice(0, LIVE_QUOTE_COUNT);
  const quotes = await getQuotesFor(quoted.map(quoteSubject)).catch(() => [] as LiveQuote[]);
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const priced = board.rows.map((row, index) =>
    index < LIVE_QUOTE_COUNT ? withLiveQuote(row, bySymbol.get(quoteSubject(row).symbol)) : { ...row, live: false, asOf: null },
  );

  // Being bought, not merely being traded: a name the crowd is dumping prints the same busy tape.
  const buying = priced.filter((row) => (row.changePercent ?? 0) > 0);
  const bestTrades = Math.max(...buying.map((row) => row.trades ?? 0), 0);
  const bestTurnover = Math.max(...buying.map((row) => row.turnoverCr ?? 0), 0);

  const scored = buying.map((row) => {
    const texture = retailTexture(row.averageTradeValue);
    const score =
      share(row.trades, bestTrades) * 40 +
      share(row.turnoverCr, bestTurnover) * 20 +
      texture * 15 +
      moveStrength(row.changePercent) * 15 +
      brokerStanding(row.brokerRank) * 10;

    return {
      row,
      texture,
      score: Math.round(Math.max(0, Math.min(100, score))),
    };
  });

  const rows = scored
    .sort((left, right) => right.score - left.score || (right.row.trades ?? 0) - (left.row.trades ?? 0))
    .slice(0, MOST_BOUGHT_COUNT)
    .map(({ row, texture, score }, index) => ({
      buyRank: index + 1,
      buyScore: score,
      symbol: row.ticker,
      name: row.name,
      bseCode: row.code,
      sector: row.sector ?? null,
      capTier: row.capTier,
      price: row.price,
      previousClose: row.previousClose,
      change: row.change,
      changePercent: row.changePercent,
      volume: row.volume,
      trades: row.trades,
      turnoverCr: row.turnoverCr,
      turnoverShare: row.turnoverShare,
      averageTradeValue: row.averageTradeValue,
      brokerRank: row.brokerRank,
      brokerNames: row.brokers.map((pick) => pick.brokerName),
      signals: signalsFor(row, texture, row.changePercent),
      live: row.live,
      asOf: row.asOf,
    }));

  const marketSession = marketSessionState(now);

  return {
    rows,
    sessionDate: board.sessionDate,
    marketSession,
    liveSession: marketSession === "live",
    asOf: now.toISOString(),
  };
}
