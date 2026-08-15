// The two hero slides whose companies are chosen by the market rather than by us.
//
// Slides one and two are fixed themes — data centres and defence — because the *theme* is the
// editorial point and the companies in it are stable. Slides three and four are the opposite: the
// theme is a ranking, so the companies have to come out of the data or the slide is a lie the day
// after it is written.
//
//   "Most gainers, last 1 year"  the three strongest one-year returns in the tracked universe
//   "Where investors are buying" the three names India's retail brokers place highest
//
// Both are resolved on the server and handed to the carousel as props, for the same reason the day
// is: the hero is server-rendered and hydrated, and a list computed independently in the browser
// would differ from the one in the markup.
//
// Neither throws. A slide that cannot be built comes back as null and the carousel falls back to
// its static trio — a hero that 500s because a broker's website changed its HTML would be a very
// poor trade for a ranking.

import "server-only";

import { getBseMovers, getBseTrending } from "./bse-market";
import { getOneYearReturns } from "./historical-returns";
import { indianStocks } from "./indian-stocks";
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
 * The three strongest one-year returns in the tracked universe.
 *
 * Read from the same cached return set the returns tables use, so the hero cannot disagree with the
 * page a reader lands on after clicking it. Only companies the catalogue knows are eligible — a
 * symbol with a return but no name or sector would put a blank card on the landing page.
 */
export async function topYearGainerTrio(): Promise<DynamicTrio | null> {
  try {
    const { returns } = await getOneYearReturns();

    const ranked = Object.entries(returns)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .sort((a, b) => b[1] - a[1]);

    const entries = ranked.flatMap(([symbol, gain]) => {
      const stock = STOCK_BY_SYMBOL.get(symbol);
      if (!stock) return [];

      return [
        {
          symbol,
          company: stock.name,
          // The figure that put it on the slide, said plainly. The card's own matrix carries every
          // other window, so this line does not repeat them.
          blurb: `Up ${Math.round(gain)}% over the last year — the ${stock.sector.toLowerCase()} name that ran hardest.`,
          tier: tierOf(stock.capTier),
          sector: stock.sector,
        },
      ];
    });

    return trioOf(entries);
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

/**
 * The three companies India's retail brokers place highest on their own most-bought lists.
 *
 * "Where investors are actually investing", as closely as a public source can answer it: these are
 * the brokers' own published lists, not our inference from turnover. `getBseTrending` already does
 * the join from a broker's scrip codes to the exchange's traded universe, ranked by best placing,
 * so this asks it for the top of that board rather than repeating the work.
 */
export async function investorFavouriteTrio(): Promise<DynamicTrio | null> {
  try {
    const board = await getBseTrending({ rank: "brokers", pageSize: 3 });

    const entries = board.rows.flatMap((row) => {
      const sector = row.sector ?? STOCK_BY_SYMBOL.get(row.ticker)?.sector ?? "";
      if (!sector) return [];

      const placings = row.brokers ?? [];
      const best = placings.reduce<number | null>(
        (top, pick) => (top === null || pick.rank < top ? pick.rank : top),
        null,
      );
      const house = placings[0]?.brokerName;

      return [
        {
          symbol: row.ticker,
          company: row.name,
          // Attributed to the broker that published it. An unattributed "most bought" would be a
          // claim of ours about what the country is buying, which is not something we can know.
          blurb:
            best !== null && house
              ? `Placed #${best} on ${house}'s own most-bought list.`
              : "On a tracked broker's published most-bought list.",
          tier: tierOf(row.capTier),
          sector,
        },
      ];
    });

    return trioOf(entries);
  } catch {
    return null;
  }
}
