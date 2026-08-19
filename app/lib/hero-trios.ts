// The four hero slides, every one of them chosen by the data rather than by us.
//
// The slider used to open on two fixed sector themes — data centres and defence — with two rankings
// behind them. All four are rankings now:
//
//   1. "Capital goods"        the three strongest one-year returns filed under capital goods
//   2. "Healthcare"           the same, over pharma and hospitals together, as BSE buckets them
//   3. "Most gainers, 1M"     the three strongest one-month returns in the tracked universe
//   4. "Investor favourites"  the three most widely held outside the promoter group, as filed
//
// The first three are read from the committed return caches, which cost nothing at request time and
// cannot disagree with the returns tables further down the page. The fourth is the only one that
// reaches a feed: it reads the companies' own quarterly shareholding patterns, which is the only
// source for "where FIIs, DIIs, the government and retail investors are actually invested" that is
// not an inference from price or volume.
//
// All four are resolved on the server and handed to the carousel as props, because the hero is
// server-rendered and then hydrated, and a list computed independently in the browser would differ
// from the one already in the markup.
//
// None of them throws. A slide that cannot be built comes back as null and the scene says it is
// reading the board — a hero that 500s because a feed changed its shape would be a very poor trade
// for a ranking.

import "server-only";

import { getBseMovers } from "./bse-market";
import { getOneMonthReturns, getOneYearReturns, type PeriodReturnsCache } from "./historical-returns";
import { indianStocks, type StockMeta } from "./indian-stocks";
import { getOwnership, type Ownership } from "./shareholding";
import { getCachedPerformanceSummaries, type PerformanceSummary } from "./stock-performance";

/**
 * One company on a dynamic trio slide.
 *
 * Structurally the same as `TrioStock` in `../components/hero-scenes`, but declared here rather
 * than imported: that module is a client component, and pulling it into a server module would drag
 * the whole scene tree — and `use client` — behind it. The carousel is where the two meet.
 */
export type DynamicTrioStock = {
  symbol: string;
  company: string;
  blurb: string;
  accent: string;
  wash: string;
  tier: "Large" | "Mid" | "Small";
  sector: string;
  /**
   * The filed ownership split, on the one slide that is ranked by it.
   *
   * Optional because only the investor slide has it, and absent rather than zeroed when a company
   * has not filed: a card drawing "FII 0.0%" against a company nobody has read the filing for would
   * be inventing a fact. Percentages of total shares, straight from the quarterly pattern.
   */
  ownership?: { fii: number; dii: number; government: number; retail: number; outsidePromoters: number };
};

export type DynamicTrio = readonly [DynamicTrioStock, DynamicTrioStock, DynamicTrioStock];

/**
 * Three accents, applied by position.
 *
 * The static trios each pick their own palette; these lists change from day to day, so a colour
 * chosen per company would make the same card change colour as it moved up the ranking. Position
 * is the stable thing here, so position is what carries the colour.
 */
const ACCENTS = [
  { accent: "border-emerald-300", wash: "bg-emerald-50/70" },
  { accent: "border-sky-300", wash: "bg-sky-50/70" },
  { accent: "border-amber-300", wash: "bg-amber-50/70" },
] as const;

/** BSE's cap tiers, as the card's badge spells them. */
function tierOf(value: string | null | undefined): DynamicTrioStock["tier"] {
  if (value === "Large" || value === "Mid" || value === "Small") return value;
  // Small rather than blank: everything outside the largest 250 by market capitalisation is small
  // cap by SEBI's definition, which is the same rule the catalogue build applies.
  return "Small";
}

/** Exactly three, or nothing. A trio slide cannot be built from two companies. */
function trioOf(entries: Omit<DynamicTrioStock, "accent" | "wash">[]): DynamicTrio | null {
  if (entries.length < 3) return null;

  const [first, second, third] = entries
    .slice(0, 3)
    .map((entry, index) => ({ ...entry, ...ACCENTS[index] }));

  return [first, second, third] as const;
}

const STOCK_BY_SYMBOL = new Map(indianStocks.map((stock) => [stock.symbol, stock]));
const TICKER_SUMMARY_DEADLINE_MS = 1200;

/** The catalogue's own sector names for the two sector slides. */
export const CAPITAL_GOODS_SECTORS = ["Capital Goods & Industrials"] as const;
// BSE files drugmakers and hospitals under one "Healthcare" bucket; the catalogue splits them into
// a finer pair. The slide is about the sector as the exchange means it, so it takes both back.
export const HEALTHCARE_SECTORS = ["Pharmaceuticals", "Healthcare Services"] as const;

/**
 * The tracked companies with a measured return over this period, strongest first.
 *
 * Only companies the catalogue knows are eligible — a symbol with a return but no name or sector
 * would put a blank card on the landing page — and the optional filter is what makes this the
 * ranking for one sector rather than for the whole board.
 */
function rankedByReturn(
  cache: PeriodReturnsCache,
  keep: (stock: StockMeta) => boolean = () => true,
) {
  return Object.entries(cache.returns)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    .sort((a, b) => b[1] - a[1])
    .flatMap(([symbol, gain]) => {
      const stock = STOCK_BY_SYMBOL.get(symbol);
      if (!stock || !keep(stock)) return [];
      return [{ symbol, gain, stock }];
    });
}

/**
 * The three strongest one-year returns inside one set of sectors.
 *
 * Read from the same cached return set the returns tables use, so the hero cannot disagree with the
 * page a reader lands on after clicking it. "Top three" is decided by measured return rather than by
 * size: a slide that simply listed a sector's largest companies would say the same thing every day
 * for a year, and would not be a ranking at all.
 */
async function sectorLeaderTrio(sectors: readonly string[], label: string): Promise<DynamicTrio | null> {
  try {
    const wanted = new Set<string>(sectors);
    const ranked = rankedByReturn(await getOneYearReturns(), (stock) => wanted.has(stock.sector));

    return trioOf(
      ranked.map(({ symbol, gain, stock }, index) => ({
        symbol,
        company: stock.name,
        // The figure and the placing that put it on the slide. The card's own matrix carries every
        // other window, so this line does not repeat them.
        blurb: `#${index + 1} in ${label} on one-year return, up ${Math.round(gain)}%.`,
        tier: tierOf(stock.capTier),
        sector: stock.sector,
      })),
    );
  } catch {
    return null;
  }
}

/** The three strongest capital goods names of the last year. */
export function capitalGoodsTrio(): Promise<DynamicTrio | null> {
  return sectorLeaderTrio(CAPITAL_GOODS_SECTORS, "capital goods");
}

/** The same, across drugmakers and hospital chains together. */
export function healthcareTrio(): Promise<DynamicTrio | null> {
  return sectorLeaderTrio(HEALTHCARE_SECTORS, "healthcare");
}

/**
 * The three strongest one-month returns in the tracked universe.
 *
 * A month rather than a year on purpose: the slide beside it already reports a year, and the two
 * windows almost never name the same companies — which is the point of showing both.
 */
export async function monthGainerTrio(): Promise<DynamicTrio | null> {
  try {
    const ranked = rankedByReturn(await getOneMonthReturns());

    return trioOf(
      ranked.map(({ symbol, gain, stock }) => ({
        symbol,
        company: stock.name,
        blurb: `Up ${Math.round(gain)}% over the last month — the ${stock.sector.toLowerCase()} name that ran hardest.`,
        tier: tierOf(stock.capTier),
        sector: stock.sector,
      })),
    );
  } catch {
    return null;
  }
}

/**
 * The candidates the investor slide ranks.
 *
 * A named pool rather than the whole catalogue, and that is a real constraint rather than a
 * shortcut: an ownership split is one company's own quarterly filing, read one company at a time,
 * so ranking four hundred of them would mean four hundred reads of a feed this app does not own.
 * These are the widely-followed names a reader is most likely to be weighing, every one of them
 * NSE-listed and therefore filing a pattern each quarter.
 */
export const INVESTOR_POOL = [
  "RELIANCE",
  "HDFCBANK",
  "ICICIBANK",
  "INFY",
  "SBIN",
  "ITC",
  "LT",
  "AXISBANK",
] as const;

/** A percentage from the filing, rounded the way the board rounds it. */
const owned = (ownership: Ownership, key: "fii" | "dii" | "government" | "retail"): number =>
  ownership.groups.find((group) => group.key === key)?.percent ?? 0;

/**
 * The three companies of the pool whose registers sit furthest outside the promoter group.
 *
 * "Where investors are most invested", answered from the filings rather than from turnover: the
 * ranking is FII + DII + government + retail as a share of total shares, which is exactly the part
 * of a company owned by somebody who chose to buy it. A promoter's own holding is not an investment
 * decision anybody made this quarter, so it is what the ranking measures against rather than part
 * of it.
 *
 * `allSettled` rather than `all`: one company whose filing could not be read costs itself its place
 * on the board, not the whole slide.
 */
export async function investorHeldTrio(): Promise<DynamicTrio | null> {
  try {
    const settled = await Promise.allSettled(INVESTOR_POOL.map((symbol) => getOwnership(symbol)));

    const ranked = settled
      .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
      .flatMap((ownership) => {
        const stock = STOCK_BY_SYMBOL.get(ownership.symbol);
        if (!stock) return [];

        const split = {
          fii: owned(ownership, "fii"),
          dii: owned(ownership, "dii"),
          government: owned(ownership, "government"),
          retail: owned(ownership, "retail"),
        };
        const outsidePromoters = Math.round((split.fii + split.dii + split.government + split.retail) * 10) / 10;
        // Nothing measured means the filing was read but carried no split — which is not a company
        // held by nobody, it is a filing this parser got nothing out of. It has no place in a
        // ranking of who holds the most.
        if (outsidePromoters <= 0) return [];

        return [
          {
            symbol: ownership.symbol,
            company: stock.name,
            blurb: `${outsidePromoters}% of the register is held outside the promoter group, as filed for ${ownership.quarter}.`,
            tier: tierOf(stock.capTier),
            sector: stock.sector,
            ownership: { ...split, outsidePromoters },
          },
        ];
      })
      .sort((a, b) => b.ownership.outsidePromoters - a.ownership.outsidePromoters);

    return trioOf(ranked);
  } catch {
    return null;
  }
}

/**
 * One company on the two strips that frame every slide.
 *
 * Declared here rather than imported from `../components/hero-ticker` for the same reason
 * `DynamicTrioStock` is: that module is a client component, and pulling it into a server module
 * would drag `use client` behind it. The two shapes are structurally identical, so the carousel
 * passes one to the other without a cast.
 */
export type HeroTickerRow = {
  symbol: string;
  name: string;
  weekPercent: number;
  sector: string | null;
  direction: "gainer" | "loser";
  returnPercent: number;
  returns: {
    oneWeek: number | null;
    threeMonth: number | null;
    sixMonth: number | null;
    oneYear: number | null;
    threeYear: number | null;
    fiveYear: number | null;
    overall: number | null;
  };
};

function tickerReturns(summary: PerformanceSummary | undefined, weekPercent: number): HeroTickerRow["returns"] {
  return {
    oneWeek: summary?.oneWeek ?? weekPercent,
    threeMonth: summary?.threeMonth ?? null,
    sixMonth: summary?.sixMonth ?? null,
    oneYear: summary?.oneYear ?? null,
    threeYear: summary?.threeYear ?? null,
    fiveYear: summary?.fiveYear ?? null,
    overall: summary?.overall ?? null,
  };
}

function tickerSummaries(symbols: string[]): Promise<PerformanceSummary[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (summaries: PerformanceSummary[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(summaries);
    };
    const timer = setTimeout(() => finish([]), TICKER_SUMMARY_DEADLINE_MS);

    getCachedPerformanceSummaries(symbols).then(finish, () => finish([]));
  });
}

/**
 * The week's strongest large caps, for the rail across the top of each slide and the tape along
 * the foot of it.
 *
 * Both strips used to be hard-coded — a rail of five invented index levels ("S&P BSE SENSEX
 * 81,204 ▲0.6%") and a tape of eight invented quotes, two of them showing falls. Figures that look
 * measured but are not have no business on a landing page, and these sat on every slide.
 *
 * Large caps rather than the whole exchange, which is a real editorial choice and not a detail: the
 * exchange-wide weekly leaderboard is microcaps up 40-70% on a few hundred trades, with no logo, no
 * name a reader recognises, and no business being the first thing on the page. `tier: "large"` is
 * what makes this a strip of companies rather than a strip of tickers.
 *
 * Empty rather than throwing, and empty rather than falling back to invented rows: the strips
 * render nothing at all when this comes back empty. A slide missing its chrome is a smaller problem
 * than a slide carrying figures nobody measured.
 */
export async function topWeeklyGainers(count = 8): Promise<HeroTickerRow[]> {
  try {
    const board = await getBseMovers({
      tier: "large",
      direction: "gainers",
      period: "1w",
      page: 1,
      pageSize: count,
    });

    const ranked = board.rows.flatMap((row) => {
      // `direction: "gainers"` already excludes falls, so this is a guard on the shape rather than
      // on the sign — a row whose weekly return could not be measured has nothing to put on a strip.
      if (typeof row.returnPercent !== "number" || !Number.isFinite(row.returnPercent)) return [];

      return [
        {
          symbol: row.ticker,
          name: row.name,
          sector: row.sector,
          direction: "gainer" as const,
          returnPercent: row.returnPercent,
          weekPercent: row.returnPercent,
        },
      ];
    });

    const summaries = await tickerSummaries(ranked.map((row) => row.symbol));
    const bySymbol = new Map(summaries.map((summary) => [summary.symbol, summary]));

    return ranked.map((row) => ({
      ...row,
      returns: tickerReturns(bySymbol.get(row.symbol), row.weekPercent),
    }));
  } catch {
    return [];
  }
}
