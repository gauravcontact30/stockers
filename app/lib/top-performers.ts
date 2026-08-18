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
import { getQuotesFor } from "./market-data";

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
  // not its rankings, which come from the return cache alone. So the ranking is built first, with
  // no quote feed involved at all, and prices are attached to the finished page further down.
  const periodReturns = await getReturnsForPeriod(period);

  const matches: TopPerformer[] = [];
  for (const stock of indianStocks) {
    if (query && !stock.symbol.toLowerCase().includes(query) && !stock.name.toLowerCase().includes(query)) continue;

    const periodReturn = periodReturns.returns[stock.symbol];
    if (typeof periodReturn !== "number" || !Number.isFinite(periodReturn)) continue;
    if (direction === "gainers" ? periodReturn < THRESHOLD : periodReturn > -THRESHOLD) continue;

    matches.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      price: null,
      changePercent: null,
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
  const visible = matches.slice(start, start + pageSize);

  /**
   * Quotes for the rows on screen, and no others.
   *
   * This used to call `getAllQuotes()` alongside the return cache, which fetches a live quote for
   * every one of the ~400 tracked companies before the board slices five of them out. At twelve in
   * flight and a six-second ceiling each, that is tens of seconds spent on ~395 quotes nobody was
   * going to see, and it is why the landing page's stock-returns section took ~48s to stream and
   * held the whole HTML response open behind it.
   *
   * The ranking never needed them: it comes from the return cache, which is exactly why a dead
   * quote feed is survivable here. Fetching after pagination makes the cost a page of rows rather
   * than a catalogue, and leaves the failure behaviour identical - no quotes, no prices, same rows.
   */
  const subjects = new Map(indianStocks.map((stock) => [stock.symbol, stock]));
  const quotes = await getQuotesFor(
    visible.map((entry) => subjects.get(entry.symbol)).filter((stock): stock is (typeof indianStocks)[number] => Boolean(stock)),
  ).catch(() => []);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const stocks = visible.map((entry) => {
    const quote = quoteMap.get(entry.symbol);
    return quote ? { ...entry, price: quote.price ?? null, changePercent: quote.changePercent ?? null } : entry;
  });

  return {
    stocks,
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
