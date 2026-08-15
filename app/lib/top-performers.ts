// The strongest and weakest names over a window, ranked once and read from two places.
//
// This used to live inside `app/api/market/top-performers/route.ts`, which was fine while the only
// caller was the browser. The landing page now resolves this board's opening view on the server and
// hands it to the client component as its first value — and a route handler is not something a
// server component may call, short of the app making an HTTP request to itself.
//
// So the ranking moved here, where both reach it: the handler for every question the reader asks
// after the first, and `app/components/streamed-top-performers.tsx` for the one the page opens on.

import { getReturnsForPeriod, type ReturnPeriod } from "./historical-returns";
import { indianStocks } from "./indian-stocks";
import { getAllQuotes } from "./market-data";

export type Direction = "gainers" | "losers";

export type TopPerformer = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  price: number | null;
  changePercent: number | null;
  periodReturn: number;
};

export type TopPerformersBoard = {
  stocks: TopPerformer[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  period: ReturnPeriod;
  direction: Direction;
  threshold: number;
  asOfDate: string | null;
  generatedAt: string | null;
  source: string;
};

/**
 * The move a name has to have made to appear at all, in either direction.
 *
 * Fifty percent is the brief: over a year it is a genuinely strong run — or a genuinely broken
 * one — and over the longer windows it keeps both boards to names that actually moved rather than
 * drifted sideways.
 */
export const THRESHOLD = 50;

/** The windows the panel offers. "max" is the whole listed history. */
export const PERIOD_OPTIONS = new Set<ReturnPeriod>(["1y", "3y", "5y", "max"]);
export const DEFAULT_PERIOD: ReturnPeriod = "1y";

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 25;

export type TopPerformersQuery = {
  period?: ReturnPeriod;
  direction?: Direction;
  page?: number;
  pageSize?: number;
  /** A company name or ticker fragment, already lowercased by the caller or not — handled here. */
  query?: string;
};

/**
 * One page of the ranking.
 *
 * The universe is the tracked catalogue rather than all ~4,950 listed scrips: a return needs price
 * history per company, and that is the set the daily caches cover.
 */
export async function getTopPerformers(options: TopPerformersQuery = {}): Promise<TopPerformersBoard> {
  const period = options.period && PERIOD_OPTIONS.has(options.period) ? options.period : DEFAULT_PERIOD;
  const direction: Direction = options.direction === "losers" ? "losers" : "gainers";
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const requestedPage = Math.max(options.page ?? 1, 1);
  const query = (options.query ?? "").trim().toLowerCase();

  // Prices are a bonus on the cards: a quote feed that is down should cost the board its prices,
  // not its rankings, which come from the return cache alone.
  const [periodReturns, quotes] = await Promise.all([getReturnsForPeriod(period), getAllQuotes().catch(() => [])]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const matches: TopPerformer[] = [];
  for (const stock of indianStocks) {
    if (query && !stock.symbol.toLowerCase().includes(query) && !stock.name.toLowerCase().includes(query)) continue;

    const periodReturn = periodReturns.returns[stock.symbol];
    if (typeof periodReturn !== "number" || !Number.isFinite(periodReturn)) continue;
    if (direction === "gainers" ? periodReturn < THRESHOLD : periodReturn > -THRESHOLD) continue;

    const quote = quoteMap.get(stock.symbol);
    matches.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      price: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
      periodReturn,
    });
  }

  // Biggest move first, whichever way the board is pointing.
  matches.sort((a, b) => (direction === "gainers" ? b.periodReturn - a.periodReturn : a.periodReturn - b.periodReturn));

  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  // A page beyond the end is a stale request from a filter that has since narrowed — answer with
  // the last page that exists rather than an empty one.
  const page = Math.min(requestedPage, pages);
  const start = (page - 1) * pageSize;

  return {
    stocks: matches.slice(start, start + pageSize),
    total: matches.length,
    page,
    pages,
    pageSize,
    period,
    direction,
    threshold: THRESHOLD,
    asOfDate: periodReturns.date,
    generatedAt: periodReturns.generatedAt,
    source: "Yahoo Finance (unofficial public feed)",
  };
}
