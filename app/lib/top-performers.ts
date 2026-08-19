// The strongest and weakest names over a window, ranked once and read from two places.
//
// This used to live inside `app/api/market/top-performers/route.ts`, which was fine while the only
// caller was the browser. The landing page now resolves this board's opening view on the server and
// hands it to the client component as its first value — and a route handler is not something a
// server component may call, short of the app making an HTTP request to itself.
//
// So the ranking moved here, where both reach it: the handler for every question the reader asks
// after the first, and `app/components/streamed-top-performers.tsx` for the one the page opens on.

import { bseCatalogue } from "./bse-catalogue";
import { getReturnsForPeriod, getReturnsOnDemand, type ReturnPeriod } from "./historical-returns";
import { indianStocks, sectors, type CapTier } from "./indian-stocks";
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
  /** The move a name had to make to appear, or null for a search, which applies no bar. */
  threshold: number | null;
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

/**
 * How many matches a search considers, and how many of those may cost a live history request.
 *
 * A two-letter query matches hundreds of scrips across the exchange, and there is no reading a
 * board that long — the ranked best are what the reader gets. The tighter of the two caps is the
 * on-demand one: a cached name is free, an uncached one is a round trip to Yahoo, and a page of
 * five rows does not justify forty of them.
 */
const SEARCH_MATCH_LIMIT = 25;
const ON_DEMAND_LIMIT = 12;

/**
 * A company the board can rank: what a row shows, plus the symbol its price history is keyed by.
 * Both catalogues are reduced to this shape so a search can reach either one.
 */
type Subject = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
};

const sectorNameFor = (key: string) => sectors.find((sector) => sector.key === key)?.name ?? "Unclassified";

let universe: Subject[] | null = null;

/**
 * Every listed company as one universe, hand-classified entries first.
 *
 * `indianStocks` is the ~400 names with a checked sector; `bseCatalogue()` is all ~4,950 active
 * BSE equities. A symbol in both keeps the hand-classified sector, because it is the finer one —
 * "Pharmaceuticals" rather than BSE's "Healthcare". Built once and held for the life of the
 * process, mirroring the search index in ./stock-search that the box above this board reads.
 */
function exchangeUniverse(): Subject[] {
  if (universe) return universe;

  const bySymbol = new Map<string, Subject>();

  for (const stock of indianStocks) {
    bySymbol.set(stock.symbol, {
      symbol: stock.symbol,
      yahooSymbol: stock.yahooSymbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
    });
  }

  for (const entry of bseCatalogue()) {
    if (bySymbol.has(entry.symbol)) continue;
    bySymbol.set(entry.symbol, {
      symbol: entry.symbol,
      yahooSymbol: entry.yahooSymbol,
      name: entry.name,
      sector: sectorNameFor(entry.sector),
      capTier: entry.capTier,
    });
  }

  universe = [...bySymbol.values()];
  return universe;
}

/**
 * How well a company answers the query; lower sorts first.
 *
 * The same ordering ./stock-search applies to the dropdown, so the company the box put on its
 * first row is the company this board leads with rather than whichever match happens to have
 * moved most.
 */
function rank(subject: Subject, term: string): number {
  const symbol = subject.symbol.toLowerCase();
  const name = subject.name.toLowerCase();
  return symbol === term ? 0 : symbol.startsWith(term) ? 1 : name.startsWith(term) ? 2 : symbol.includes(term) ? 3 : 4;
}

/** The tracked catalogue past the 50% bar, in the direction asked for. The unfiltered board. */
function rankedMatches(direction: Direction, returns: Record<string, number | null>): TopPerformer[] {
  const matches: TopPerformer[] = [];

  for (const stock of indianStocks) {
    const periodReturn = returns[stock.symbol];
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

  return matches;
}

/**
 * The companies a search names, with their measured return over the window.
 *
 * Deliberately neither the ranking's universe nor its rules — both of them answered the wrong
 * question when a name was typed in, and between them left the box unable to show a company it
 * had itself suggested:
 *
 *  - The 50% bar is dropped. It exists to keep an unfiltered board to names that actually moved;
 *    applied to a search it hides the answer that was asked for. A company up 12% over the year
 *    is under the bar on the gainers tab and over it on the losers tab, so searching one returned
 *    an empty panel either way.
 *  - The tracked catalogue is dropped. Returns are cached daily for ~400 companies, but the box
 *    above this board suggests across all ~4,950 listed scrips. A searched name outside the cache
 *    (Cupid, say) simply did not exist here; now its history is fetched on the spot.
 *
 * The direction tab still orders the result — strongest first on gainers, weakest first on losers
 * — it just no longer decides who is allowed on screen.
 */
async function searchMatches(
  term: string,
  period: ReturnPeriod,
  cached: Record<string, number | null>,
): Promise<TopPerformer[]> {
  const candidates = exchangeUniverse()
    .filter((subject) => subject.symbol.toLowerCase().includes(term) || subject.name.toLowerCase().includes(term))
    .sort((a, b) => rank(a, term) - rank(b, term) || a.symbol.localeCompare(b.symbol))
    .slice(0, SEARCH_MATCH_LIMIT);

  const uncached = candidates
    .filter((subject) => typeof cached[subject.symbol] !== "number")
    .slice(0, ON_DEMAND_LIMIT);

  // A history feed that is down costs the uncached names their rows, not the whole search: the
  // cached ones are already in hand and answer the query perfectly well without it.
  const fetched: Record<string, number | null> = uncached.length
    ? await getReturnsOnDemand(uncached, period).catch(() => ({}))
    : {};

  const matches: TopPerformer[] = [];
  for (const subject of candidates) {
    const held = cached[subject.symbol];
    const periodReturn = typeof held === "number" ? held : fetched[subject.symbol];
    if (typeof periodReturn !== "number" || !Number.isFinite(periodReturn)) continue;

    matches.push({
      symbol: subject.symbol,
      name: subject.name,
      sector: subject.sector,
      capTier: subject.capTier,
      price: null,
      changePercent: null,
      periodReturn,
    });
  }

  return matches;
}

export type TopPerformersQuery = {
  period?: ReturnPeriod;
  direction?: Direction;
  page?: number;
  pageSize?: number;
  /** A company name or ticker fragment, already lowercased by the caller or not — handled here. */
  query?: string;
};

/**
 * One page of the board.
 *
 * Unfiltered, the universe is the tracked catalogue rather than all ~4,950 listed scrips: a return
 * needs price history per company, and that is the set the daily caches cover. A search is the one
 * case that reaches past it — see `searchMatches` for why, and for what it costs.
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

  // A search and an unfiltered board are two different questions. The board asks what moved most
  // and needs the 50% bar to stay readable; a search asks how one named company has done, and that
  // bar is exactly what made it answer nothing. See `searchMatches`.
  const matches = query
    ? await searchMatches(query, period, periodReturns.returns)
    : rankedMatches(direction, periodReturns.returns);

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
  // Keyed off the whole exchange rather than the tracked catalogue, so a searched company from
  // outside it gets its last traded price on the row like every other name.
  const subjects = new Map(exchangeUniverse().map((subject) => [subject.symbol, subject]));
  const quotes = await getQuotesFor(
    visible.map((entry) => subjects.get(entry.symbol)).filter((subject): subject is Subject => Boolean(subject)),
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
    // Null while searching: the bar is not applied to a named company, and reporting one that did
    // not filter anything would misdescribe the board.
    threshold: query ? null : THRESHOLD,
    asOfDate: periodReturns.date,
    generatedAt: periodReturns.generatedAt,
    source: "Yahoo Finance (unofficial public feed)",
  };
}
