// The BSE research board: the whole listed equity universe, today's movers across it, and the
// sector each name belongs to.
//
// Three upstream sources do the work:
//   ListofScripData   every active equity with its market capitalisation (~4,900 rows)
//   Bhavcopy CSV      the session's official prices for every scrip (~4,900 rows)
//   ComHeader         one scrip's sector/industry classification
//
// The first two are bulk calls, so the board covers the entire exchange rather than a curated
// watchlist. ComHeader is per scrip, so it is only ever called for rows actually on screen, and
// its answer is kept for a day since a company's sector does not move.

import { fetchBse, fetchBseText } from "./bse-client";
// Kept in its own dependency-free module so the client board can import the mapping without
// pulling this file — and the network and cache layers it imports — into the browser bundle.
import { BSE_PLATFORMS, bsePlatform, type BsePlatform } from "./bse-platform";
// What the brokers themselves publish about their customers' buying — see ./brokers for why only
// one of the five tracked platforms contributes any data.
import { getBrokerPopularity } from "./broker-popularity";
import type { BrokerId, BrokerPick } from "./brokers";
import { CACHE_TAGS } from "./cache";
// Sector classification lives on its own because it is the one thing this feed will not answer in
// bulk: see ./bse-sectors for why the whole exchange is mapped in the background.
import {
  HISTORY_PERIODS,
  getBaseline,
  overallReturn,
  periodReturn,
  type Baseline,
  type ReturnPeriod,
} from "./bse-history";
import {
  HOUSE_CATEGORY,
  attachSectors,
  categoryOf,
  classifyUniverse,
  inHouseCategory,
  sectorOf,
  type ClassificationProgress,
} from "./bse-sectors";
// Generic helpers, not NSE-specific: the same TTL memo and the same lenient number parsing that
// India's exchange feeds require (values arrive as padded, comma-separated strings).
import { cached, toNumber, toText } from "./nse-client";

export { attachSectors };
export { BSE_PLATFORMS, bsePlatform, type BsePlatform };

export type BseCapTier = "Large" | "Mid" | "Small";

export type BseStock = {
  code: string;
  ticker: string;
  name: string;
  /** BSE's trading group — "A" is the most liquid, "T"/"Z" are surveillance/compliance buckets. */
  group: string;
  isin: string;
  marketCapCr: number | null;
  capTier: BseCapTier | null;
  /** Rank by market capitalisation across the exchange, 1 = largest. */
  rank: number | null;
  url: string;
};

export type BseQuote = {
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
};

export type BseRow = BseStock & BseQuote & { sector: string | null; industry: string | null };

export type BseBreadth = {
  advancing: number;
  declining: number;
  unchanged: number;
  traded: number;
};

export type BseBoard = {
  summary: {
    listed: number;
    priced: number;
    totalMarketCapCr: number;
    breadth: BseBreadth;
    byTier: Record<BseCapTier, { count: number; breadth: BseBreadth; averageChangePercent: number | null }>;
    /** The trading session the board reflects, as YYYY-MM-DD. */
    sessionDate: string | null;
  };
};

// SEBI's own definition, which is what "large / mid / small cap" means to an Indian investor:
// the top 100 companies by market capitalisation are large cap, the next 150 are mid cap, and
// everything below that is small cap.
const LARGE_CAP_RANKS = 100;
const MID_CAP_RANKS = 250;

const UNIVERSE_TTL_MS = 6 * 60 * 60 * 1000;
const TAPE_TTL_MS = 15 * 60 * 1000;

type RawScrip = {
  SCRIP_CD?: unknown;
  Scrip_Name?: unknown;
  scrip_id?: unknown;
  GROUP?: unknown;
  ISIN_NUMBER?: unknown;
  Mktcap?: unknown;
  NSURL?: unknown;
};

export type BseUniverse = {
  stocks: BseStock[];
  byCode: Map<string, BseStock>;
  totalMarketCapCr: number;
};

function tierForRank(rank: number): BseCapTier {
  if (rank <= LARGE_CAP_RANKS) return "Large";
  if (rank <= MID_CAP_RANKS) return "Mid";
  return "Small";
}

/**
 * Every active BSE equity, ranked by market capitalisation and bucketed into cap tiers.
 *
 * Listings change on the scale of days, so this is held for hours; the prices that go with it are
 * fetched separately and refreshed every minute.
 */
export const getBseUniverse = cached<BseUniverse>(UNIVERSE_TTL_MS, async () => {
  const raw = await fetchBse<RawScrip[]>(
    "/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active",
    25_000,
  );

  const stocks: BseStock[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const code = toText(row.SCRIP_CD);
      const name = toText(row.Scrip_Name);
      if (!code || !name) continue;

      stocks.push({
        code,
        ticker: toText(row.scrip_id) || code,
        name,
        group: toText(row.GROUP),
        isin: toText(row.ISIN_NUMBER),
        marketCapCr: toNumber(row.Mktcap),
        capTier: null,
        rank: null,
        url: toText(row.NSURL),
      });
    }
  }

  // Rank only the companies that report a market cap; the rest stay untiered rather than being
  // lumped into small cap on missing data.
  const ranked = stocks.filter((stock) => stock.marketCapCr !== null && stock.marketCapCr > 0);
  ranked.sort((a, b) => (b.marketCapCr ?? 0) - (a.marketCapCr ?? 0));
  ranked.forEach((stock, index) => {
    stock.rank = index + 1;
    stock.capTier = tierForRank(index + 1);
  });

  return {
    stocks,
    byCode: new Map(stocks.map((stock) => [stock.code, stock])),
    totalMarketCapCr: ranked.reduce((sum, stock) => sum + (stock.marketCapCr ?? 0), 0),
  };
  // Not persisted: `byCode` is a Map, which does not survive the Data Cache's JSON round trip.
}, { key: "bse:universe", tags: [CACHE_TAGS.bse] });

export type BseTapeRow = {
  code: string;
  /** The Bhavcopy carries better tickers than the scrip list does. */
  ticker: string;
  name: string;
  /** BSE security series: equity groups (A/B/X/T/Z/…), SME (M/MS/MT), funds (E/F), g-secs (G). */
  series: string;
  quote: BseQuote;
};

export type BseTape = {
  rows: Map<string, BseTapeRow>;
  /** The trading session these prices are from, as YYYY-MM-DD. */
  sessionDate: string | null;
};

// What counts as a share for the stock board. The Bhavcopy also carries ETF and mutual-fund
// units (E, F), government securities (G), InvITs/REITs (IF) and rights entitlements (R); a
// rights entitlement in particular is a claim rather than a company, and its price swings would
// otherwise dominate the top-losers list.
const EQUITY_SERIES = new Set(["A", "B", "X", "XT", "T", "TS", "Z", "ZP", "P", "M", "MS", "MT"]);

const BHAVCOPY_URL = (yyyymmdd: string) =>
  `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd}_F_0000.CSV`;

// A session's file is published while the day is still in progress but holds only a handful of
// rows until the close, so a file this small is treated as "not ready yet".
const MIN_SESSION_ROWS = 500;
const SESSION_LOOKBACK_DAYS = 7;

function csvRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

function tapeIdentifiers(row: BseTapeRow & { isin?: string }): string[] {
  return [...new Set([row.code, row.ticker, row.isin].filter((value): value is string => Boolean(value)))];
}

export function findBseTapeRow(tape: BseTape | null | undefined, identifiers: readonly (string | null | undefined)[]) {
  if (!tape) return null;
  for (const identifier of identifiers) {
    const key = identifier?.trim();
    if (!key) continue;
    const row = tape.rows.get(key) ?? tape.rows.get(key.toUpperCase());
    if (row) return row;
  }
  return null;
}

/** Dates to try, newest first: today in IST, then the days before it. */
function recentSessionStamps(now = new Date()): string[] {
  const stamps: string[] = [];
  for (let back = 0; back < SESSION_LOOKBACK_DAYS; back++) {
    const day = new Date(now.getTime() - back * 86_400_000);
    stamps.push(day.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).replace(/-/g, ""));
  }
  return stamps;
}

/**
 * Every scrip's prices for the most recent completed session, from BSE's own Bhavcopy.
 *
 * This is the exchange's settlement file rather than a screen-scraped widget, which matters:
 * it covers all ~4,900 scrips in both directions. The realtime gainer/loser endpoint was tried
 * first and turned out to return advances only — it reports no decliners at all, whichever
 * GLtype is asked for — so it cannot answer "top 10 losers" honestly.
 */
export const getBseTape = cached<BseTape>(TAPE_TTL_MS, async () => {
  for (const stamp of recentSessionStamps()) {
    const text = await fetchBseText(BHAVCOPY_URL(stamp));
    if (!text) continue;

    const rows = csvRows(text).filter((row) => row.FinInstrmTp === "STK");
    if (rows.length < MIN_SESSION_ROWS) continue;

    const parsed = new Map<string, BseTapeRow>();

    for (const row of rows) {
      const code = row.FinInstrmId;
      if (!code) continue;

      const price = toNumber(row.ClsPric) ?? toNumber(row.LastPric);
      const previousClose = toNumber(row.PrvsClsgPric);
      const change = price !== null && previousClose !== null ? price - previousClose : null;

      const parsedRow = {
        code,
        ticker: row.TckrSymb || code,
        name: row.FinInstrmNm || "",
        isin: row.ISIN || "",
        series: row.SctySrs || "",
        quote: {
          price,
          previousClose,
          change,
          changePercent: change !== null && previousClose ? (change / previousClose) * 100 : null,
          open: toNumber(row.OpnPric),
          dayHigh: toNumber(row.HghPric),
          dayLow: toNumber(row.LwPric),
          volume: toNumber(row.TtlTradgVol),
          // Turnover is filed in rupees; every other figure on the board is in crore.
          turnoverCr: (toNumber(row.TtlTrfVal) ?? 0) / 1e7,
          trades: toNumber(row.TtlNbOfTxsExctd),
        },
      };

      for (const identifier of tapeIdentifiers(parsedRow)) {
        parsed.set(identifier, parsedRow);
      }
    }

    return { rows: parsed, sessionDate: rows[0]?.TradDt || null };
  }

  return { rows: new Map(), sessionDate: null };
  // Not persisted: `rows` is a Map, which does not survive the Data Cache's JSON round trip.
}, { key: "bse:tape", tags: [CACHE_TAGS.bse] });

function emptyQuote(): BseQuote {
  return {
    price: null,
    previousClose: null,
    change: null,
    changePercent: null,
    open: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    turnoverCr: null,
    trades: null,
  };
}

function countBreadth(changes: number[]): BseBreadth {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;

  for (const change of changes) {
    if (change > 0) advancing++;
    else if (change < 0) declining++;
    else unchanged++;
  }

  return { advancing, declining, unchanged, traded: changes.length };
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * One listed company with the session's prices beside it.
 *
 * Anything the Bhavcopy files under a non-equity series is dropped rather than priced, so a
 * fund or a rights entitlement can never surface as a top mover.
 */
function join(stock: BseStock, tape: BseTape): (BseStock & BseQuote) | null {
  const row = findBseTapeRow(tape, [stock.code, stock.ticker, stock.isin]);
  if (row && !EQUITY_SERIES.has(row.series)) return null;

  return { ...stock, ticker: row?.ticker ?? stock.ticker, ...(row?.quote ?? emptyQuote()) };
}

/**
 * The board's headline figures: how much is listed, and how the session's breadth split overall
 * and by cap tier. The movers themselves are paged separately through getBseMovers, so nothing
 * here resolves a sector or slices a top ten that a reader may never scroll to.
 */
export async function getBseBoard(): Promise<BseBoard> {
  const [universe, tape] = await Promise.all([getBseUniverse(), getBseTape()]);

  const priced = universe.stocks
    .map((stock) => join(stock, tape))
    .filter((row): row is BseStock & BseQuote => row !== null && row.changePercent !== null);

  const byTier = {} as BseBoard["summary"]["byTier"];
  for (const tier of ["Large", "Mid", "Small"] as const) {
    const rows = priced.filter((row) => row.capTier === tier);
    const changes = rows.map((row) => row.changePercent as number);
    byTier[tier] = {
      count: universe.stocks.filter((stock) => stock.capTier === tier).length,
      breadth: countBreadth(changes),
      averageChangePercent: average(changes),
    };
  }

  return {
    summary: {
      listed: universe.stocks.length,
      priced: priced.length,
      totalMarketCapCr: universe.totalMarketCapCr,
      breadth: countBreadth(priced.map((row) => row.changePercent as number)),
      byTier,
      sessionDate: tape.sessionDate,
    },
  };
}

type RawIndustry = { Industry_name?: unknown };

/**
 * Every category the exchange classifies companies into, as BSE's own industry list gives them.
 *
 * Taken from the exchange rather than from whatever the classification walk happens to have seen,
 * so the board can show all of them from the first render — including the categories nothing has
 * been mapped into yet.
 */
export const getBseIndustries = cached<string[]>(UNIVERSE_TTL_MS, async () => {
  const raw = await fetchBse<RawIndustry[]>("/ddlIndustry/w");
  if (!Array.isArray(raw)) return [];

  const names = raw.map((entry) => toText(entry.Industry_name)).filter((name) => name.length > 0);
  return [...new Set(names)];
}, { key: "bse:industries", tags: [CACHE_TAGS.bse], persist: true });

/**
 * What counts as a standout move, up or down.
 *
 * On a session where the average scrip moves under a percent, five is the line between drifting
 * with the market and doing something worth a second look — and it is symmetric, so the star and
 * the red count mean the same thing in opposite directions.
 */
export const STANDOUT_PERCENT = 5;

export type BseSectorSummary = {
  sector: string;
  /** Classified companies in this category that traded and have a price to compare. */
  stocks: number;
  gainers: number;
  losers: number;
  /** The category's strongest performers — up by STANDOUT_PERCENT or more. */
  star: number;
  /** Its laggards — down by STANDOUT_PERCENT or more. */
  red: number;
  /** True for a grouping we keep ourselves rather than one the exchange publishes. */
  house: boolean;
};

export type BseSectorBoard = {
  sectors: BseSectorSummary[];
  /** Companies the walk has not reached yet, or that BSE files under no sector at all. */
  unclassified: number;
  classification: ClassificationProgress;
  sessionDate: string | null;
};

export type BseSectorBoardQuery = {
  /** Category, BSE sector, ticker, company name, scrip code, ISIN, group or cap tier. */
  q?: string;
};

function searchTerm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function containsSearch(value: string | number | null | undefined, term: string): boolean {
  return String(value ?? "").toLowerCase().includes(term);
}

function stockMatchesSectorSearch(row: BseStock & BseQuote, category: string, term: string): boolean {
  return (
    containsSearch(category, term) ||
    containsSearch(sectorOf(row.code), term) ||
    containsSearch(categoryOf(row.code), term) ||
    containsSearch(row.ticker, term) ||
    containsSearch(row.name, term) ||
    containsSearch(row.code, term) ||
    containsSearch(row.isin, term) ||
    containsSearch(row.group, term) ||
    containsSearch(row.capTier, term) ||
    containsSearch(row.rank, term)
  );
}

/**
 * The session broken down by the exchange's own sector categories.
 *
 * Every traded company is counted into its sector, so a block can say how many of its names rose
 * and which moved most — and the movers inside a block are then paged through getBseMovers with
 * the same sector, which is what lets a reader work through all of a category rather than its
 * top few.
 *
 * While the background classification is still running the counts describe the companies mapped
 * so far; `classification` says exactly how far that is, so the UI can state it rather than
 * present a partial picture as the whole one.
 */
/** Whether a company belongs in the named category — the exchange's, or the one we keep ourselves. */
function matchesCategory(code: string, category: string): boolean {
  return category === HOUSE_CATEGORY ? inHouseCategory(code) : categoryOf(code) === category;
}

export async function getBseSectorBoard(query: BseSectorBoardQuery = {}): Promise<BseSectorBoard> {
  const [universe, tape, industries] = await Promise.all([getBseUniverse(), getBseTape(), getBseIndustries()]);
  const classification = classifyUniverse(universe.stocks.map((stock) => stock.code));
  const term = searchTerm(query.q);

  const priced = universe.stocks
    .map((stock) => join(stock, tape))
    .filter((row): row is BseStock & BseQuote => row !== null && row.changePercent !== null);

  // Every category the exchange publishes starts with an empty bucket, so the board lists all of
  // them from the first render rather than growing a category at a time as the walk finds one. The
  // house category joins them and needs no classification at all — its members are named outright.
  const grouped = new Map<string, (BseStock & BseQuote)[]>([...industries, HOUSE_CATEGORY].map((name) => [name, []]));
  let unclassified = 0;

  for (const row of priced) {
    // A data-centre company is counted here as well as in whatever the exchange files it under, so
    // the official categories still add up to the exchange.
    if (inHouseCategory(row.code)) grouped.get(HOUSE_CATEGORY)?.push(row);

    const category = categoryOf(row.code);
    if (!category) {
      unclassified++;
      continue;
    }

    // A category the industry list did not mention still gets a bucket: the classification comes
    // from the same exchange, and dropping a company because two of its endpoints disagree would
    // lose it from the board entirely.
    const bucket = grouped.get(category);
    if (bucket) bucket.push(row);
    else grouped.set(category, [row]);
  }

  const sectors: BseSectorSummary[] = [...grouped.entries()]
    .filter(([sector, rows]) => term.length === 0 || containsSearch(sector, term) || rows.some((row) => stockMatchesSectorSearch(row, sector, term)))
    .map(([sector, rows]) => {
      const changes = rows.map((row) => row.changePercent as number);

      return {
        sector,
        stocks: rows.length,
        gainers: changes.filter((change) => change > 0).length,
        losers: changes.filter((change) => change < 0).length,
        star: changes.filter((change) => change >= STANDOUT_PERCENT).length,
        red: changes.filter((change) => change <= -STANDOUT_PERCENT).length,
        house: sector === HOUSE_CATEGORY,
      };
    });

  // Alphabetical: a reader looking for one category should find it where its name puts it, not
  // wherever the day's stock counts happen to place it.
  sectors.sort((a, b) => a.sector.localeCompare(b.sector));

  return { sectors, unclassified, classification, sessionDate: tape.sessionDate };
}

export type MoverQuery = {
  tier?: "all" | Lowercase<BseCapTier>;
  direction?: "gainers" | "losers";
  /** Which return the board is ranked by. Defaults to the session's own move. */
  period?: ReturnPeriod;
  /** Name, ticker, scrip code or ISIN — the same four ways the directory is searched. */
  q?: string;
  /** One of the exchange's categories, exactly as BSE's industry list names it. */
  category?: string;
  /** Only moves of at least this size, as a positive percentage in either direction. */
  minPercent?: number;
  page?: number;
  pageSize?: number;
};

export type BseMoverPage = {
  rows: (BseRow & { returnPercent: number | null })[];
  /** The return the rows are ranked by, and the session it is measured from. */
  period: ReturnPeriod;
  periodFrom: string | null;
  /** Every stock that moved this way on the exchange — the list is not trimmed to a top N. */
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sessionDate: string | null;
};

const MOVER_PAGE_SIZE = 5;
// A page is also a batch of sector lookups, so the ceiling bounds what one request can cost
// upstream as much as it bounds the response.
const MAX_MOVER_PAGE_SIZE = 50;

const TIER_FOR_KEY: Record<Lowercase<BseCapTier>, BseCapTier> = { large: "Large", mid: "Mid", small: "Small" };

/**
 * One page of the day's movers, over the whole list rather than a top ten.
 *
 * The board used to ship a fixed ten each way. Searching, filtering and paging all happen here
 * rather than in the browser for the same reason the directory does it: every mover in both
 * directions across four cap tiers is thousands of rows, and — more to the point — each row's
 * sector costs an upstream call, so only the rows actually being looked at are ever resolved.
 *
 * A search is the one thing that is not confined to the direction being viewed. Roughly half the
 * exchange falls on any given day, so searching "Neuland" from the gainers board and being told it
 * does not exist is simply wrong — a reader looking a company up wants that company, whichever way
 * it went, and it is the sort order that belongs to the tab, not the universe being searched.
 *
 * The period decides what "gainer" means. Over one session it is the day's move; over five years it
 * is the return against that session's close five years ago, which is a different list of companies
 * entirely — and the one that answers "what has actually compounded".
 */
export async function getBseMovers(query: MoverQuery): Promise<BseMoverPage> {
  const period = query.period ?? "1d";
  const [universe, tape, history] = await Promise.all([getBseUniverse(), getBseTape(), loadHistory(period)]);

  const tier = query.tier ?? "all";
  const direction = query.direction ?? "gainers";
  const term = (query.q ?? "").trim().toLowerCase();
  const minPercent = query.minPercent && query.minPercent > 0 ? query.minPercent : 0;
  const pageSize = Math.min(Math.max(query.pageSize ?? MOVER_PAGE_SIZE, 1), MAX_MOVER_PAGE_SIZE);
  const searching = term.length > 0;

  // Asking for a category is what keeps the background classification moving: the walk is started
  // here rather than by a separate warm-up, so the first board that needs it begins the map.
  if (query.category) classifyUniverse(universe.stocks.map((stock) => stock.code));

  const listed = universe.stocks
    .map((stock) => join(stock, tape))
    .filter((row): row is BseStock & BseQuote => row !== null)
    // A search reaches every listed company, including one that did not trade at all this session;
    // browsing a direction only ever means companies with a price to rank.
    .filter((row) => searching || row.changePercent !== null)
    .filter((row) => tier === "all" || row.capTier === TIER_FOR_KEY[tier])
    .filter((row) => !query.category || matchesCategory(row.code, query.category))
    // The figure everything below ranks, filters and reports on. Over one session that is the move
    // the Bhavcopy already states; over anything longer it is measured against the reference close.
    .map((row) => ({ ...row, returnPercent: returnFor(row, period, history) }));

  const rows = listed
    .filter(
      (row) => searching || (direction === "gainers" ? (row.returnPercent ?? 0) > 0 : (row.returnPercent ?? 0) < 0),
    )
    // The size of a move, not its sign: a filter of 5% means the same thing on both boards.
    .filter((row) => minPercent === 0 || Math.abs(row.returnPercent ?? 0) >= minPercent)
    .filter(
      (row) =>
        !searching ||
        row.name.toLowerCase().includes(term) ||
        row.ticker.toLowerCase().includes(term) ||
        row.code.includes(term) ||
        row.isin.toLowerCase() === term,
    )
    // Biggest return first in both directions, so page one is always the sharpest and every page
    // after it descends from there. A company with no return over this period — it did not trade,
    // or was not listed that far back — has no ranking among those that do, so it sorts to the
    // bottom either way rather than leading the list.
    .sort((a, b) => {
      const left = a.returnPercent;
      const right = b.returnPercent;
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return direction === "gainers" ? right - left : left - right;
    });

  const total = rows.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);

  return {
    rows: await attachSectors(rows.slice((page - 1) * pageSize, page * pageSize)),
    period,
    // Where the return is measured from: the session itself for 1d, otherwise the reference close.
    periodFrom: period === "1d" ? tape.sessionDate : (history[history.length - 1]?.date ?? null),
    total,
    page,
    pageSize,
    pages,
    sessionDate: tape.sessionDate,
  };
}

/**
 * The reference sessions a period needs.
 *
 * One file for a fixed period, and for "overall" every file there is — the earliest one a company
 * appears in is the furthest back it can honestly be measured from, and finding that means holding
 * them all. They are memoised for half a day, so this is one download per period per process.
 */
async function loadHistory(period: ReturnPeriod): Promise<Baseline[]> {
  if (period === "1d") return [];
  if (period !== "overall") return [await getBaseline(period)];

  return Promise.all(HISTORY_PERIODS.map((each) => getBaseline(each)));
}

/** One company's return over the period, in percent. */
function returnFor(row: BseStock & BseQuote, period: ReturnPeriod, history: Baseline[]): number | null {
  if (period === "1d") return row.changePercent;
  if (row.price === null) return null;

  const identifiers = [row.code, row.ticker, row.isin];
  return period === "overall"
    ? overallReturn(identifiers, row.price, history)
    : periodReturn(identifiers, row.price, history[0]);
}

export type DirectoryQuery = {
  q?: string;
  tier?: BseCapTier | "all";
  sort?: "mcap" | "change" | "name" | "price";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type BseDirectory = {
  rows: BseRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sessionDate: string | null;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * A searchable slice of the full listed universe.
 *
 * Filtering and paging happen on the server because the universe is ~4,900 rows: shipping it all
 * to the browser to filter there would be a megabyte of JSON per visitor. Sectors are resolved
 * only for the page being returned.
 */
export async function getBseDirectory(query: DirectoryQuery): Promise<BseDirectory> {
  const [universe, tape] = await Promise.all([getBseUniverse(), getBseTape()]);

  const term = (query.q ?? "").trim().toLowerCase();
  const tier = query.tier ?? "all";
  const sort = query.sort ?? "mcap";
  const direction = query.direction ?? (sort === "name" ? "asc" : "desc");
  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  let rows = universe.stocks
    .map((stock) => join(stock, tape))
    .filter((row): row is BseStock & BseQuote => row !== null);

  if (term) {
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        row.ticker.toLowerCase().includes(term) ||
        row.code.includes(term) ||
        row.isin.toLowerCase() === term,
    );
  }
  if (tier !== "all") {
    rows = rows.filter((row) => row.capTier === tier);
  }

  // A scrip with no price for the session sorts to the bottom either way: it has no ranking
  // among stocks that traded, so letting a null lead an ascending sort would bury the answer.
  const sortValue = (row: (typeof rows)[number]) =>
    sort === "change" ? row.changePercent : sort === "price" ? row.price : row.marketCapCr;

  rows.sort((a, b) => {
    if (sort === "name") {
      const byName = a.name.localeCompare(b.name);
      return direction === "asc" ? byName : -byName;
    }

    const left = sortValue(a);
    const right = sortValue(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return direction === "asc" ? left - right : right - left;
  });

  const total = rows.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: await attachSectors(slice),
    total,
    page,
    pageSize,
    pages,
    sessionDate: tape.sessionDate,
  };
}

/**
 * Every listed scrip joined to this session's tape, unpaged and unsorted.
 *
 * The directory above pages because it renders; a screener filters on several numeric criteria at
 * once and cannot know how many rows will survive them, so it needs the whole universe in hand.
 * This is the same join the directory does, exposed without the slicing.
 *
 * Sectors are deliberately not attached. Resolving them is a per-scrip lookup and there are ~4,900
 * of these; the directory does it for the twenty rows it is about to draw, which is affordable,
 * and doing it for all of them to support a filter nobody has applied yet is not.
 */
export async function getBseRows(): Promise<{ rows: (BseStock & BseQuote)[]; sessionDate: string | null }> {
  const [universe, tape] = await Promise.all([getBseUniverse(), getBseTape()]);

  return {
    rows: universe.stocks
      .map((stock) => join(stock, tape))
      .filter((row): row is BseStock & BseQuote => row !== null),
    sessionDate: tape.sessionDate,
  };
}

/**
 * What "trending" is measured by.
 *
 * The first three are figures the exchange itself publishes. "brokers" is the odd one out: it
 * ranks by where the brokers place a company on their own most-bought lists, so it answers "what
 * are retail investors buying" rather than "what did the exchange trade".
 */
export type TrendingRank = "brokers" | "turnover" | "trades" | "volume";

export type BseTrendingRow = BseRow & {
  /**
   * Where this company sits on any tracked broker's own published list. Empty for most rows: only
   * one of the five platforms publishes such a list at all — see ./broker-popularity.
   */
  brokers: BrokerPick[];
  /**
   * Best placing this company holds across every tracked broker, 1 = most bought. Null when no
   * broker lists it. This is what the "brokers" ranking sorts on, and a lower number is a better
   * placing — so ranking by it ascending puts the most-bought company first.
   */
  brokerRank: number | null;
  /** This scrip's share of the whole session's traded value, in percent. */
  turnoverShare: number | null;
  /**
   * The average rupee size of one trade in this scrip. A large-cap moved by institutions prints
   * in lakhs per trade; a name retail is crowding into prints in thousands, however high its
   * total turnover climbs — so this is what separates "big money moved it" from "a lot of people
   * bought it".
   */
  averageTradeValue: number | null;
};

export type TrendingQuery = {
  rank?: TrendingRank;
  /** Name, ticker, scrip code or ISIN — the same four ways the directory is searched. */
  q?: string;
  platform?: BsePlatform | "all";
  /** Only companies on this broker's own published list. */
  broker?: BrokerId | "all";
  tier?: "all" | Lowercase<BseCapTier>;
  /** Only moves of at least this size, as a positive percentage in either direction. */
  minPercent?: number;
  page?: number;
  pageSize?: number;
};

export type BseTrendingBoard = {
  rows: BseTrendingRow[];
  rank: TrendingRank;
  /** Exchange-wide session totals, which is what each row's share is a share of. */
  totals: { turnoverCr: number; volume: number; trades: number; traded: number };
  /**
   * How many of the matching stocks sit on each platform. Counted before the platform filter is
   * applied but after every other one, so the chips say what choosing them would actually yield.
   */
  platforms: { platform: BsePlatform; count: number }[];
  /** Every stock matching the query, not the page — the pager needs the whole count. */
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sessionDate: string | null;
};

const TRENDING_SIZE = 10;
const MAX_TRENDING_SIZE = 50;

/**
 * The best placing a company holds across every broker that lists it, or Infinity when none does.
 *
 * Infinity rather than 0 because these sort ascending: an unlisted company must fall to the bottom,
 * and a 0 would put it at the very top, ahead of every broker's own number one.
 */
function bestBrokerRank(picks: Record<string, BrokerPick[]>, row: { code: string }): number {
  const listed = picks[row.code] ?? [];
  return listed.length ? Math.min(...listed.map((pick) => pick.rank)) : Number.POSITIVE_INFINITY;
}

const TRENDING_METRIC: Record<Exclude<TrendingRank, "brokers">, (quote: BseQuote) => number | null> = {
  turnover: (quote) => quote.turnoverCr,
  trades: (quote) => quote.trades,
  volume: (quote) => quote.volume,
};

/**
 * The stocks BSE is actually crowding into this session.
 *
 * There is no such thing as a "most searched" feed. Every broker ranks its own search traffic
 * in-app and none publishes it — the same wall `MostTraded` hit on the NSE side. What some of them
 * do publish is a most-*bought* list, and what the exchange publishes is every scrip's traded
 * value, share count and transaction count. Those are the four rankings offered here, and choosing
 * between them is a real choice rather than a display preference:
 *
 *   brokers   where the brokers place a company on their own most-bought lists — what retail is
 *             buying, but only across the customers of the brokers that publish anything
 *   turnover  the rupees that changed hands — where the money went, dominated by large caps
 *   trades    how many separate transactions — the closest public proxy for crowd attention
 *   volume    share count, which flatters low-priced scrips and is the least comparable
 *
 * The three exchange rankings cover the whole traded universe, so a mid-cap that had an unusual day
 * can displace a habitual heavyweight. The broker ranking is necessarily narrower: it can only
 * contain companies some broker has actually listed, so it is a short board by construction.
 *
 * Searching, filtering and paging all happen here rather than in the browser for the same reason
 * `getBseMovers` does it: the traded universe is thousands of rows, and each row's sector costs an
 * upstream call, so only the page actually being looked at is ever resolved.
 */
export async function getBseTrending(query: TrendingQuery = {}): Promise<BseTrendingBoard> {
  const rank = query.rank ?? "turnover";
  // The broker board still only contains companies that traded, so it is gated on turnover the
  // same way the turnover board is — a listing nobody traded today is not something to show.
  const metric = TRENDING_METRIC[rank === "brokers" ? "turnover" : rank];
  const term = (query.q ?? "").trim().toLowerCase();
  const platform = query.platform ?? "all";
  const broker = query.broker ?? "all";
  const tier = query.tier ?? "all";
  const minPercent = query.minPercent && query.minPercent > 0 ? query.minPercent : 0;
  const pageSize = Math.min(Math.max(query.pageSize ?? TRENDING_SIZE, 1), MAX_TRENDING_SIZE);

  const [universe, tape, brokerPicks] = await Promise.all([getBseUniverse(), getBseTape(), getBrokerPopularity()]);

  // A scrip with no price did not trade at all; one with turnover but no transaction count is a
  // filing artefact. Both would otherwise sort into the board on a null treated as zero.
  const traded = universe.stocks
    .map((stock) => join(stock, tape))
    .filter((row): row is BseStock & BseQuote => row !== null && row.price !== null && (metric(row) ?? 0) > 0);

  // Computed over everything that traded, not over the filtered set: a row's share of the session
  // means its share of the exchange, and would be a different — and misleading — number if it were
  // recomputed against whatever the reader happened to filter down to.
  const totals = traded.reduce(
    (sum, row) => ({
      turnoverCr: sum.turnoverCr + (row.turnoverCr ?? 0),
      volume: sum.volume + (row.volume ?? 0),
      trades: sum.trades + (row.trades ?? 0),
      traded: sum.traded + 1,
    }),
    { turnoverCr: 0, volume: 0, trades: 0, traded: 0 },
  );

  const matching = traded
    .filter(
      (row) =>
        !term ||
        row.name.toLowerCase().includes(term) ||
        row.ticker.toLowerCase().includes(term) ||
        row.code.includes(term) ||
        row.isin.toLowerCase() === term,
    )
    .filter((row) => tier === "all" || row.capTier === TIER_FOR_KEY[tier])
    // The size of a move, not its sign — a 5% filter means the same thing in either direction.
    .filter((row) => minPercent === 0 || Math.abs(row.changePercent ?? 0) >= minPercent)
    // "Show me what Groww's customers are buying, that also traded on BSE today."
    .filter((row) => broker === "all" || (brokerPicks[row.code] ?? []).some((pick) => pick.broker === broker))
    // Ranking by broker placing over companies no broker lists would be ranking by nothing, so the
    // board is confined to the listed ones rather than padded with unplaced rows at the bottom.
    .filter((row) => rank !== "brokers" || (brokerPicks[row.code] ?? []).length > 0);

  // Faceted: the counts describe the search and the other filters, so a platform chip that would
  // return nothing reads as zero rather than silently emptying the board when it is clicked.
  const platforms = BSE_PLATFORMS.map((each) => ({
    platform: each,
    count: matching.filter((row) => bsePlatform(row.group) === each).length,
  })).filter((entry) => entry.count > 0);

  const rows = matching
    .filter((row) => platform === "all" || bsePlatform(row.group) === platform)
    .sort((a, b) =>
      rank === "brokers"
        ? // A better placing is a *lower* number, so ascending placing is descending popularity:
          // the broker's own #1 leads the board. Companies level on placing — which is what two
          // brokers listing different names at #3 looks like — fall back to the money behind them.
          bestBrokerRank(brokerPicks, a) - bestBrokerRank(brokerPicks, b) ||
          (b.turnoverCr ?? 0) - (a.turnoverCr ?? 0)
        : (metric(b) ?? 0) - (metric(a) ?? 0),
    );

  const total = rows.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);

  const resolved = await attachSectors(rows.slice((page - 1) * pageSize, page * pageSize));

  return {
    rows: resolved.map((row) => ({
      ...row,
      brokers: brokerPicks[row.code] ?? [],
      brokerRank: (brokerPicks[row.code] ?? []).length ? bestBrokerRank(brokerPicks, row) : null,
      turnoverShare:
        totals.turnoverCr > 0 && row.turnoverCr !== null ? (row.turnoverCr / totals.turnoverCr) * 100 : null,
      // Turnover is carried in crore, so it is scaled back to rupees before being split across trades.
      averageTradeValue: row.turnoverCr !== null && row.trades ? (row.turnoverCr * 1e7) / row.trades : null,
    })),
    rank,
    totals,
    platforms,
    total,
    page,
    pageSize,
    pages,
    sessionDate: tape.sessionDate,
  };
}
