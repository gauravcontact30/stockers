import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getStockBuyReport, UnknownStockError } from "../../../lib/stock-buy-analysis";

/**
 * The landing page's Stock Analysis section: a buy / hold / avoid read on one BSE-listed company,
 * and the five higher-scoring names to consider instead of it.
 *
 * A GET rather than a POST, unlike the other AI routes here, because it is a read of a report that
 * is entirely a function of the ticker. That makes it cacheable, which matters for where it sits:
 * this is the one AI endpoint an anonymous visitor can reach, on the busiest page in the app, and
 * the popular tickers are typed by one reader after another. `../../../lib/stock-buy-analysis`
 * holds each report for ten minutes in process, and five minutes at the edge keeps most of the
 * repeats from arriving at all.
 *
 * It sits under `/api/ai/` deliberately: `proxy.ts` rate-limits that whole prefix at 20 requests a
 * minute per IP, which is the spend ceiling on a route that anyone can call.
 */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim() ?? "";

  if (!symbol) {
    return NextResponse.json({ error: "Search for a BSE-listed stock to analyse." }, { status: 400 });
  }

  try {
    const report = await getStockBuyReport(symbol);
    return NextResponse.json(report, { headers: cacheHeaders(300) });
  } catch (error) {
    // A ticker nobody lists is the reader's typo, not an outage, and it must not be cached as one.
    if (error instanceof UnknownStockError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("stock-analysis:", error);
    return NextResponse.json(
      { error: "Couldn't analyse that stock right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
