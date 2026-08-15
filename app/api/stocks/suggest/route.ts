import { NextResponse } from "next/server";
import { findBseTapeRow, getBseTape } from "../../../lib/bse-market";
import { cacheHeaders } from "../../../lib/cache";
import { suggestStocks } from "../../../lib/stock-search";

// The answer depends on the query string, so it cannot be rendered once at build time — see the
// sibling /api/stocks/search route, which was bitten by exactly that.
const DEFAULT_LIMIT = 20;

export type StockSuggestion = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  scripCode: string;
  /** Last traded price from the session the tape covers, or null when the scrip did not trade. */
  price: number | null;
  changePercent: number | null;
};

/**
 * Type-ahead suggestions across every listed company, priced.
 *
 * The prices come from the one Bhavcopy tape the rest of the BSE boards already read, so pricing
 * twenty suggestions costs a Map lookup each rather than twenty quote requests. The tape is a
 * network fetch behind a cache, and a dropdown is more useful unpriced than not at all — so a feed
 * that is down leaves `price` null instead of failing the request.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit"));
  const { hits, total } = suggestStocks(params.get("q") ?? "", Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT);

  const tape = await getBseTape().catch(() => null);

  const suggestions: StockSuggestion[] = hits.map((hit) => {
    const quote = findBseTapeRow(tape, [hit.scripCode, hit.symbol])?.quote;
    return {
      symbol: hit.symbol,
      name: hit.name,
      sector: hit.sector,
      capTier: hit.capTier,
      scripCode: hit.scripCode,
      price: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
    };
  });

  return NextResponse.json(
    { suggestions, total, sessionDate: tape?.sessionDate ?? null },
    { headers: cacheHeaders(60) },
  );
}
