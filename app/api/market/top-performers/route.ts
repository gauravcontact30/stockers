import { NextRequest, NextResponse } from "next/server";
import { getReturnsForPeriod, type ReturnPeriod } from "../../../lib/historical-returns";
import { indianStocks } from "../../../lib/indian-stocks";
import { getAllQuotes } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

/**
 * The move a name has to have made to appear at all, in either direction.
 *
 * Fifty percent is the brief: over a year it is a genuinely strong run — or a genuinely broken
 * one — and over the longer windows it keeps both boards to names that actually moved rather than
 * drifted sideways.
 */
const THRESHOLD = 50;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 25;

/** The windows the panel offers. "max" is the whole listed history. */
const PERIOD_OPTIONS = new Set<ReturnPeriod>(["1y", "3y", "5y", "max"]);
const DEFAULT_PERIOD: ReturnPeriod = "1y";

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

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * The strongest and the weakest names over one of four windows, from the same daily return caches
 * the dip screener reads.
 *
 * Public, like the rest of the exchange boards on the landing page: these are measured returns,
 * not an AI call, so nothing here is gated. The universe is the tracked catalogue rather than all
 * ~4,950 listed scrips — a return needs price history per company, and that is the set the daily
 * caches cover.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const requestedPeriod = params.get("period");
  const period: ReturnPeriod =
    requestedPeriod && PERIOD_OPTIONS.has(requestedPeriod as ReturnPeriod) ? (requestedPeriod as ReturnPeriod) : DEFAULT_PERIOD;

  const direction: Direction = params.get("direction") === "losers" ? "losers" : "gainers";
  const pageSize = positiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const requestedPage = positiveInt(params.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const query = (params.get("q") ?? "").trim().toLowerCase();

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

  return NextResponse.json(
    {
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
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
  );
}
