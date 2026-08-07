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
import { mapWithConcurrency } from "./market-data";
// Generic helpers, not NSE-specific: the same TTL memo and the same lenient number parsing that
// India's exchange feeds require (values arrive as padded, comma-separated strings).
import { cached, toNumber, toText } from "./nse-client";

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
  movers: Record<"all" | Lowercase<BseCapTier>, { gainers: BseRow[]; losers: BseRow[] }>;
};

// SEBI's own definition, which is what "large / mid / small cap" means to an Indian investor:
// the top 100 companies by market capitalisation are large cap, the next 150 are mid cap, and
// everything below that is small cap.
const LARGE_CAP_RANKS = 100;
const MID_CAP_RANKS = 250;

const UNIVERSE_TTL_MS = 6 * 60 * 60 * 1000;
const TAPE_TTL_MS = 15 * 60 * 1000;
const SECTOR_TTL_MS = 24 * 60 * 60 * 1000;
const SECTOR_CONCURRENCY = 8;
const TOP_N = 10;

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
});

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

      parsed.set(code, {
        code,
        ticker: row.TckrSymb || code,
        name: row.FinInstrmNm || "",
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
      });
    }

    return { rows: parsed, sessionDate: rows[0]?.TradDt || null };
  }

  return { rows: new Map(), sessionDate: null };
});

type RawHeader = { Sector?: unknown; IndustryNew?: unknown; Industry?: unknown };
type SectorInfo = { sector: string | null; industry: string | null };

const sectorCache = new Map<string, { value: SectorInfo; expiresAt: number }>();

/** One scrip's sector classification, remembered for a day. */
async function loadSector(code: string): Promise<SectorInfo> {
  const hit = sectorCache.get(code);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const raw = await fetchBse<RawHeader>(`/ComHeader/w?quotetype=EQ&scripcode=${encodeURIComponent(code)}&seriesid=`);
  const value: SectorInfo = {
    sector: toText(raw?.Sector) || null,
    industry: toText(raw?.IndustryNew) || toText(raw?.Industry) || null,
  };

  // A failed lookup is cached briefly too, so one unhappy scrip can't be retried on every render.
  sectorCache.set(code, { value, expiresAt: Date.now() + (value.sector ? SECTOR_TTL_MS : 60_000) });
  return value;
}

export async function attachSectors(rows: (BseStock & BseQuote)[]): Promise<BseRow[]> {
  const sectors = await mapWithConcurrency(rows, SECTOR_CONCURRENCY, (row) => loadSector(row.code));
  return rows.map((row, index) => ({ ...row, ...sectors[index] }));
}

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
  const row = tape.rows.get(stock.code);
  if (row && !EQUITY_SERIES.has(row.series)) return null;

  return { ...stock, ticker: row?.ticker ?? stock.ticker, ...(row?.quote ?? emptyQuote()) };
}

/**
 * The landing page's market board: exchange-wide breadth, the same split by cap tier, and the ten
 * biggest moves in each direction for the market as a whole and for each tier.
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

  const pick = (rows: typeof priced, direction: "gainers" | "losers") =>
    [...rows]
      .sort((a, b) =>
        direction === "gainers"
          ? (b.changePercent as number) - (a.changePercent as number)
          : (a.changePercent as number) - (b.changePercent as number),
      )
      .filter((row) => (direction === "gainers" ? (row.changePercent as number) > 0 : (row.changePercent as number) < 0))
      .slice(0, TOP_N);

  const groups = {
    all: priced,
    large: priced.filter((row) => row.capTier === "Large"),
    mid: priced.filter((row) => row.capTier === "Mid"),
    small: priced.filter((row) => row.capTier === "Small"),
  };

  // Sectors are looked up once for the whole board rather than per group, so a name that appears
  // in both the "all" and its own tier list costs a single upstream call.
  const shortlist = Object.values(groups).flatMap((rows) => [...pick(rows, "gainers"), ...pick(rows, "losers")]);
  const withSectors = await attachSectors(dedupeByCode(shortlist));
  const sectorByCode = new Map(withSectors.map((row) => [row.code, row]));
  const decorate = (rows: (BseStock & BseQuote)[]): BseRow[] =>
    rows.map((row) => sectorByCode.get(row.code) ?? { ...row, sector: null, industry: null });

  return {
    summary: {
      listed: universe.stocks.length,
      priced: priced.length,
      totalMarketCapCr: universe.totalMarketCapCr,
      breadth: countBreadth(priced.map((row) => row.changePercent as number)),
      byTier,
      sessionDate: tape.sessionDate,
    },
    movers: {
      all: { gainers: decorate(pick(groups.all, "gainers")), losers: decorate(pick(groups.all, "losers")) },
      large: { gainers: decorate(pick(groups.large, "gainers")), losers: decorate(pick(groups.large, "losers")) },
      mid: { gainers: decorate(pick(groups.mid, "gainers")), losers: decorate(pick(groups.mid, "losers")) },
      small: { gainers: decorate(pick(groups.small, "gainers")), losers: decorate(pick(groups.small, "losers")) },
    },
  };
}

function dedupeByCode<T extends { code: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(row.code)) seen.set(row.code, row);
  return [...seen.values()];
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
