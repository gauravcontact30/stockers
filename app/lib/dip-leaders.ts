// The stocks that won the year and are on sale today.
//
// Two conditions, and neither is interesting without the other. A stock that has compounded for a
// year but sits at its high is not cheap; a stock at its low that has gone nowhere for a year is
// not a winner, it is a faller. This screen is the intersection: strong over the last year,
// trading below its own recent range right now, and down on the session.
//
// Everything here is measured. The year's return comes from BSE's Bhavcopy archive — the same
// published closes every other board on this site is ranked from — and the discount is today's
// price against this company's own recent reference closes, not against a peer group or an
// estimate. The news tilt is counted from headlines that were classified individually; it colours
// the card and is never allowed to put a stock on the list or take it off, because a screen that
// moved on sentiment would stop being a measurement.

import { getBaseline } from "./bse-history";
import { getBseMovers } from "./bse-market";
import { CACHE_TAGS, revalidating } from "./cache";
import { getMarketNews } from "./market-news";

/** How the last year's headlines fell, for the one stock a card is about. */
export type DipNewsTilt = {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  /** 25 (uniformly negative) to 75 (uniformly positive); 50 when there is nothing to read. */
  score: number;
  /** The most recent headline, so the card cites something rather than only scoring it. */
  headline: string | null;
  headlineUrl: string | null;
  /** Whether the headlines were classified by the model or by the fallback word list. */
  classifier: "ai" | "heuristic" | null;
};

export type DipLeader = {
  code: string;
  ticker: string;
  name: string;
  sector: string | null;
  capTier: string | null;
  price: number | null;
  /** Today's move. Negative by construction — a stock has to be down to be on this list. */
  changePercent: number | null;
  /** The measured one-year return. This is the "performed best last year" half. */
  yearReturn: number | null;
  /** The highest of this company's own recent reference closes. */
  referenceHigh: number | null;
  /** How far below that it trades today, as a negative percentage. The "on sale" half. */
  offRecentHigh: number | null;
  news: DipNewsTilt;
};

export type DipLeaderBoard = {
  leaders: DipLeader[];
  /** The session the prices and the discount are measured in. */
  sessionDate: string | null;
  /** How many of the year's winners were examined to find these. */
  examined: number;
  fetchedAt: string;
};

/**
 * How many of the year's best performers to examine.
 *
 * The movers board caps a page at fifty however many are asked for, so this is a number of pages
 * rather than a single large request — the first attempt asked for 400 in one go, silently got 50,
 * and the screen found one company that cleared the quality floor instead of a field to rank.
 *
 * Deep enough to have something to choose from on a day when the leaders are mostly green, and
 * shallow enough to stay arithmetic over data the application already holds.
 */
const CANDIDATE_PAGES = 8;

/** How many cards the slide shows. */
export const DIP_LEADER_COUNT = 3;

/**
 * The floor a company has to clear to be worth naming.
 *
 * Without it this screen is a list of micro-caps: the first run returned three scrips up 250-550%
 * on the year, each trading a few lakh rupees a day, because a thinly-traded scrip is where the
 * largest percentage moves always are. Those figures are real and still misleading — a 500% year
 * on ₹40 lakh of turnover describes the float, not the business.
 *
 * So the screen still covers the whole exchange, but a company has to be a real, traded one: a
 * market capitalisation the exchange has actually computed, and enough turnover today that the
 * closing price came from a market rather than from a handful of trades. Both thresholds are named
 * on the slide's footnote rather than applied quietly.
 */
export const MIN_MARKET_CAP_CR = 1_000;
export const MIN_TURNOVER_CR = 1;

/** What the movers board caps a page at, whatever is asked for. */
const PAGE_SIZE = 50;

/**
 * The windows a stock's "recent range" is measured over.
 *
 * Short enough to describe where it has been trading lately rather than where it was a year ago —
 * a stock up 300% over the year is below its one-year-ago close on almost no day, so measuring the
 * discount against that would find nothing.
 */
const RECENT_WINDOWS = ["1w", "1m", "3m"] as const;

/** The tilt of a set of already-classified headlines. */
export function tiltFrom(
  items: { sentiment: string; title: string; url: string }[],
  classifier: "ai" | "heuristic" | null,
): DipNewsTilt {
  const positive = items.filter((item) => item.sentiment === "positive").length;
  const negative = items.filter((item) => item.sentiment === "negative").length;
  const total = items.length;

  return {
    positive,
    negative,
    neutral: total - positive - negative,
    total,
    // Centred on 50 and bounded to 25-75, so an unread stock and a genuinely balanced one both
    // read as neutral rather than one of them looking like a conviction call.
    score: total === 0 ? 50 : Math.round(50 + ((positive - negative) / total) * 25),
    headline: items[0]?.title ?? null,
    headlineUrl: items[0]?.url ?? null,
    classifier: total === 0 ? null : classifier,
  };
}

/** How far `price` sits below the highest of the reference closes, as a negative percentage. */
export function discountFrom(price: number, referenceHigh: number | null): number | null {
  if (referenceHigh === null || referenceHigh <= 0) return null;
  return ((price - referenceHigh) / referenceHigh) * 100;
}

async function loadDipLeaders(): Promise<DipLeaderBoard> {
  // The year's best performers first, then the recent closes to price them against.
  //
  // Deliberately sequential. Ranking by the year already pulls the Bhavcopy tape and the one-year
  // reference session; asking for three more at the same moment put five concurrent downloads on
  // BSE at once, and on a cold process the tape is the one that loses. Both halves are cached for
  // hours, so the ordering costs a little on the very first call and nothing after it.
  const first = await getBseMovers({ period: "1y", direction: "gainers", page: 1, pageSize: PAGE_SIZE });

  // The rest of the field, now that the universe, the tape and the one-year reference session are
  // all warm — every page after the first is a sort and a slice over data already in memory.
  const rest = await Promise.all(
    Array.from({ length: Math.min(CANDIDATE_PAGES, first.pages) - 1 }, (_, index) =>
      getBseMovers({ period: "1y", direction: "gainers", page: index + 2, pageSize: PAGE_SIZE }),
    ),
  );

  const candidates = [first, ...rest].flatMap((page) => page.rows);
  const recent = await Promise.all(RECENT_WINDOWS.map((window) => getBaseline(window)));

  const scored = candidates.flatMap((row) => {
    const price = row.price;
    if (typeof price !== "number" || price <= 0) return [];

    // Down on the session. This is the literal "trading at its lowest today" condition, and it is
    // checked before anything else because it is the one a reader can see on the card.
    if (typeof row.changePercent !== "number" || row.changePercent >= 0) return [];

    // A real, traded company rather than a thin scrip or a mutual-fund unit. See the note on the
    // thresholds above: without this the screen is only ever micro-caps.
    if (typeof row.marketCapCr !== "number" || row.marketCapCr < MIN_MARKET_CAP_CR) return [];
    if (typeof row.turnoverCr !== "number" || row.turnoverCr < MIN_TURNOVER_CR) return [];

    // The top of this company's own recent range, from its published closes.
    const closes = recent.map((baseline) => baseline.prices.get(row.code)).filter((close): close is number => typeof close === "number" && close > 0);
    if (closes.length === 0) return [];

    const referenceHigh = Math.max(...closes);
    const offRecentHigh = discountFrom(price, referenceHigh);

    // Below its own recent range, not merely down for one session.
    if (offRecentHigh === null || offRecentHigh >= 0) return [];

    return [{ row, price, referenceHigh, offRecentHigh }];
  });

  // Deepest discount first — that is the "cheapest today" the reader came for. The year's return
  // breaks ties, so between two equally marked-down winners the stronger one leads.
  scored.sort((a, b) => a.offRecentHigh - b.offRecentHigh || (b.row.returnPercent ?? 0) - (a.row.returnPercent ?? 0));

  const chosen = scored.slice(0, DIP_LEADER_COUNT);

  // Headlines are fetched only for the three that made the list, never for all 150 candidates.
  const feeds = await Promise.all(chosen.map((entry) => getMarketNews(entry.row.ticker).catch(() => null)));

  const leaders: DipLeader[] = chosen.map((entry, index) => {
    const feed = feeds[index];

    return {
      code: entry.row.code,
      ticker: entry.row.ticker,
      name: entry.row.name,
      sector: entry.row.sector,
      capTier: entry.row.capTier,
      price: entry.price,
      changePercent: entry.row.changePercent,
      yearReturn: entry.row.returnPercent,
      referenceHigh: entry.referenceHigh,
      offRecentHigh: entry.offRecentHigh,
      news: tiltFrom(feed?.items ?? [], feed?.classifier ?? null),
    };
  });

  return {
    leaders,
    sessionDate: first.sessionDate,
    examined: candidates.length,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * The board behind the hero's fourth slide.
 *
 * Held for a quarter of an hour and served while the next is fetched, so the landing page never
 * waits on a Bhavcopy download or on three news lookups. Tagged across all three families it draws
 * on, so purging any of them drops this too rather than leaving a board composed of stale parts.
 */
export const getDipLeaders = revalidating<DipLeaderBoard>({
  key: "bse:dip-leaders",
  ttlMs: 15 * 60_000,
  // An empty board usually means an upstream feed was unreachable rather than that the exchange
  // has no discounted winners, so it is retried sooner than a full one.
  ttlFor: (board) => (board.leaders.length > 0 ? 15 * 60_000 : 60_000),
  tags: [CACHE_TAGS.bse, CACHE_TAGS.nse, CACHE_TAGS.news],
  persist: true,
  load: loadDipLeaders,
});
