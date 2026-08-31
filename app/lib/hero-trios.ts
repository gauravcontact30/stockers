// The four hero slides, every one of them chosen by the data rather than by us.
//
// The slider used to open on two fixed sector themes — data centres and defence — with two rankings
// behind them. All four are rankings now:
//
//   1. "Defence"              the three strongest one-year returns among India's listed defence names
//   2. "Retail"               the same, over the organised retail and quick-commerce sector
//   3. "Most gainers, 3Y"     the three strongest three-year returns in the tracked universe
//   4. "Investor favourites"  the three the market's buyers have crowded into this week
//
// The first three are read from the daily return caches, which cost nothing at request time once
// warm and cannot disagree with the returns tables further down the page. The fourth is the only
// one that reaches a live feed: it reads the brokers' own published most-bought lists and the
// exchange's trade-count tape, which is the closest thing to "where investors are actually putting
// money right now" that anybody publishes.
//
// All four are resolved on the server and handed to the carousel as props, because the hero is
// server-rendered and then hydrated, and a list computed independently in the browser would differ
// from the one already in the markup.
//
// None of them throws. A slide that cannot be built comes back as null and the scene says it is
// reading the board — a hero that 500s because a feed changed its shape would be a very poor trade
// for a ranking.

import "server-only";

import { getBseMovers, getBseTrending, type BseTrendingRow, type TrendingRank } from "./bse-market";
import { getOneYearReturns, getReturnsOnDemand, type PeriodReturnsCache, type ReturnPeriod } from "./historical-returns";
import { bseCatalogue } from "./bse-catalogue";
import { indianStocks, sectors, type StockMeta } from "./indian-stocks";
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
   * The buying evidence, on the one slide that is ranked by it.
   *
   * Optional because only the investor slide has it, and absent rather than zeroed when a figure
   * was not published: a card drawing "0 trades" against a company whose tape nobody read would be
   * inventing a fact. Every field here is a published number — a broker's own placing, the
   * exchange's trade count and traded value, and the measured one-week move.
   */
  flow?: {
    brokerRank: number | null;
    brokers: string[];
    weekPercent: number | null;
    trades: number | null;
    turnoverCr: number | null;
  };
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

/**
 * India's listed defence names, as a named pool.
 *
 * A pool rather than a sector filter, and that is forced by the classification rather than chosen:
 * neither the catalogue nor BSE's own industry list has a "Defence" bucket. The exchange files
 * every one of these under capital goods — and Solar Industries, which makes the ammunition and
 * the propellants, under chemicals — so a sector filter would return turbines and switchgear beside
 * them and call the result a defence board.
 *
 * These are the listed companies whose order books are defence programmes: the aircraft, the
 * warships, the missiles, the optics and electronics that go inside them, and the explosives they
 * carry. Which three of them lead is still the data's to decide.
 */
export const AGRICULTURE_POOL = [
  "UPL",
  "PIIND",
  "SUMICHEM",
  "CHAMBLFERT",
  "DEEPAKFERT",
  "GNFC",
  "GSFC",
  "RALLIS",
  "FACT",
  "BHARATRAS",
  "MADRASFERT",
  "GSPCROP",
] as const;

export const FINANCIAL_SECTORS = ["Banking", "NBFC & Financial Services", "Insurance"] as const;
export const HEALTHCARE_SECTORS = ["Pharmaceuticals", "Healthcare Services"] as const;

function sectorLabelFallback(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "Unclassified";
  return text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectorNameFor(key: string | null | undefined): string {
  return sectors.find((sector) => sector.key === key)?.name ?? sectorLabelFallback(key);
}

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
 * The three strongest one-year returns inside a named set of companies.
 *
 * Read from the same cached return set the returns tables use, so the hero cannot disagree with the
 * page a reader lands on after clicking it. "Top three" is decided by measured return rather than by
 * size: a slide that simply listed a sector's largest companies would say the same thing every day
 * for a year, and would not be a ranking at all.
 */
async function leaderTrio(keep: (stock: StockMeta) => boolean, label: string): Promise<DynamicTrio | null> {
  try {
    const ranked = rankedByReturn(await getOneYearReturns(), keep);

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

/** The three strongest defence names of the last year. */
async function cataloguePoolTrio(
  symbols: readonly string[],
  period: ReturnPeriod,
  label: string,
): Promise<DynamicTrio | null> {
  try {
    const wanted = new Set(symbols);
    const entries = bseCatalogue().filter((entry) => wanted.has(entry.symbol));
    const returns = await getReturnsOnDemand(entries, period);
    const ranked = entries
      .flatMap((entry) => {
        const gain = returns[entry.symbol];
        return typeof gain === "number" && Number.isFinite(gain) ? [{ entry, gain }] : [];
      })
      .sort((a, b) => b.gain - a.gain);

    return trioOf(
      ranked.map(({ entry, gain }, index) => ({
        symbol: entry.symbol,
        company: entry.name,
        blurb: `#${index + 1} ${label} stock on one-year return, up ${Math.round(gain)}%.`,
        tier: tierOf(entry.capTier),
        sector: sectorNameFor(entry.sector),
      })),
    );
  } catch {
    return null;
  }
}

export function agriculturalTrio(): Promise<DynamicTrio | null> {
  return cataloguePoolTrio(AGRICULTURE_POOL, "1y", "agriculture-linked");
}

/** The same, across the organised retail chains, quick-commerce platforms and restaurant groups. */
export function financialTrio(): Promise<DynamicTrio | null> {
  const wanted = new Set<string>(FINANCIAL_SECTORS);
  return leaderTrio((stock) => wanted.has(stock.sector), "financial");
}

/**
 * The three strongest three-year returns in the tracked universe.
 *
 * Three years rather than one: the two sector slides beside it already report a year, and a window
 * that spans a whole cycle names very different companies from one that spans a rally — which is
 * the point of showing both.
 */
function trioFromMoverRows(
  rows: {
    ticker: string;
    name: string;
    returnPercent: number | null;
    capTier: string | null;
    sector: string | null;
    industry: string | null;
  }[],
  label: string,
): DynamicTrio | null {
  return trioOf(
    rows.flatMap((row) => {
      const gain = row.returnPercent;
      if (typeof gain !== "number" || !Number.isFinite(gain)) return [];
      return [
        {
          symbol: row.ticker,
          company: row.name,
          blurb: `Up ${Math.round(gain)}% over ${label}, from the BSE mover board.`,
          tier: tierOf(row.capTier),
          sector: row.sector || row.industry || "Unclassified",
        },
      ];
    }),
  );
}

export async function threeMonthGainerTrio(): Promise<DynamicTrio | null> {
  try {
    const board = await getBseMovers({ direction: "gainers", period: "3m", page: 1, pageSize: 3 });
    return trioFromMoverRows(board.rows, "the last three months");
  } catch {
    return null;
  }
}

/** How deep into each buying board to look before intersecting it with the tracked catalogue. */
const BUYING_CANDIDATES = 50;

type BuyingCandidate = { row: BseTrendingRow; stock: StockMeta };

/**
 * One buying board, narrowed to companies the catalogue knows.
 *
 * The intersection is not tidiness. The trending boards cover all ~4,950 listed scrips, and a card
 * for one outside the catalogue would carry no cap tier, no sector the pill can draw, and — because
 * the performance endpoint would have to guess its Yahoo symbol — a fair chance of a dash where the
 * price belongs. A hero card with three blanks on it is worse than a different company.
 *
 * The direction filter is the difference between the two boards, and it is deliberate.
 *
 * On the **tape** board it has to be applied: the exchange publishes no buy/sell split, so trading
 * above the previous close is the only stand-in there is for "being bought", and without it the
 * board would rank the scrips being dumped just as highly. The scene's footnote says so rather than
 * hiding it behind the word "bought".
 *
 * On the **broker** board it must not be. A broker's published most-bought list already *is* a
 * record of what its customers bought; the session's price direction is a second, weaker signal,
 * and requiring both throws away the better one. That is not hypothetical — on a session where the
 * whole broker list closed down, filtering it left the board with nothing and the slide fell to the
 * tape for all three cards.
 */
async function buyingCandidates(rank: TrendingRank): Promise<BuyingCandidate[]> {
  const board = await getBseTrending({
    rank,
    direction: rank === "brokers" ? "all" : "bought",
    // The window the slide is about. Each row reports its own measured one-week move, which is what
    // the cards draw beside the broker placing.
    returnPeriod: "1w",
    page: 1,
    pageSize: BUYING_CANDIDATES,
  });

  return board.rows.flatMap((row) => {
    const stock = STOCK_BY_SYMBOL.get(row.ticker.toUpperCase());
    return stock ? [{ row, stock }] : [];
  });
}

/** Why this company is on the buying slide, in one line. */
function buyingBlurb(row: BseTrendingRow): string {
  const week = row.returnPercent;
  const move = typeof week === "number" && Number.isFinite(week) ? `, up ${Math.round(week)}% over the week` : "";
  const broker = row.brokers[0]?.brokerName;

  return broker && row.brokerRank !== null
    ? `#${row.brokerRank} most bought on ${broker}${move}.`
    : `Among the week's most heavily traded names on the bid${move}.`;
}

/**
 * The three companies the market's buyers have crowded into this week.
 *
 * "Where investors are most invested" answered from what is actually published rather than from a
 * flow figure nobody discloses. Two real sources, in that order of preference:
 *
 *   the brokers   Groww and the other tracked platforms publish their own most-bought lists. That
 *                 is a true buying signal for their customers and nobody else's, and it is the
 *                 nearest thing there is to a retail investor saying what they bought.
 *   the tape      the exchange publishes, per scrip, how many separate transactions printed. A
 *                 stock printing tens of thousands of small trades while it rises is one a crowd is
 *                 buying into. It fills the board when the broker lists come back short.
 *
 * Each card reports its measured one-week return beside the placing, so the slide's week is a
 * measured week rather than an asserted one.
 *
 * `allSettled` rather than `all`: the broker lists are somebody else's marketing page rather than a
 * contract, and one of them refusing should cost itself its rows, not the whole slide.
 */
export async function healthcareInvestorTrio(): Promise<DynamicTrio | null> {
  try {
    const wanted = new Set<string>(HEALTHCARE_SECTORS);
    const [listed, crowded] = await Promise.allSettled([buyingCandidates("brokers"), buyingCandidates("trades")]);
    const onList = (listed.status === "fulfilled" ? listed.value : [])
      .filter((candidate) => wanted.has(candidate.stock.sector))
      .filter((candidate) => candidate.row.brokerRank !== null)
      .sort((left, right) => (left.row.brokerRank ?? 0) - (right.row.brokerRank ?? 0));

    const seen = new Set(onList.map((candidate) => candidate.stock.symbol));
    const ordered = [
      ...onList,
      ...(crowded.status === "fulfilled" ? crowded.value : []).filter(
        (candidate) => wanted.has(candidate.stock.sector) && !seen.has(candidate.stock.symbol),
      ),
    ];

    return trioOf(
      ordered.map(({ row, stock }) => ({
        symbol: stock.symbol,
        company: stock.name,
        blurb: buyingBlurb(row),
        tier: tierOf(stock.capTier),
        sector: stock.sector,
        flow: {
          brokerRank: row.brokerRank,
          brokers: row.brokers.map((pick) => pick.brokerName),
          weekPercent: row.returnPercent,
          trades: row.trades,
          turnoverCr: row.turnoverCr,
        },
      })),
    ) ?? (await leaderTrio((stock) => wanted.has(stock.sector), "healthcare"));
  } catch {
    const wanted = new Set<string>(HEALTHCARE_SECTORS);
    return leaderTrio((stock) => wanted.has(stock.sector), "healthcare");
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
