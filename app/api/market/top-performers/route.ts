import { NextRequest, NextResponse } from "next/server";
import type { ReturnPeriod } from "../../../lib/historical-returns";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PERIOD,
  MAX_PAGE_SIZE,
  PERIOD_OPTIONS,
  getTopPerformers,
  type Direction,
  type TopPerformer,
} from "../../../lib/top-performers";

export type { Direction, TopPerformer };

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
 * not an AI call, so nothing here is gated.
 *
 * The ranking itself lives in ../../../lib/top-performers, so the landing page can prefetch this
 * board's opening view on the server rather than making the browser ask for it after hydration.
 * This handler answers everything after that first view — every tab, window, search and page turn.
 *
 * No `use cache`: the query space here is reader-supplied and effectively unbounded, so a cache
 * keyed on it would hold thousands of entries and hit almost none. What it reads underneath — the
 * return caches and the quote feed — is already cached a layer down.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const requestedPeriod = params.get("period");
  const period: ReturnPeriod =
    requestedPeriod && PERIOD_OPTIONS.has(requestedPeriod as ReturnPeriod) ? (requestedPeriod as ReturnPeriod) : DEFAULT_PERIOD;

  const board = await getTopPerformers({
    period,
    direction: params.get("direction") === "losers" ? "losers" : "gainers",
    pageSize: positiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    page: positiveInt(params.get("page"), 1, Number.MAX_SAFE_INTEGER),
    query: params.get("q") ?? "",
  });

  return NextResponse.json(board, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" },
  });
}
