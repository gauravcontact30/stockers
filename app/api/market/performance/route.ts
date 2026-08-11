import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getCachedPerformanceSummaries, getCachedPerformanceSummary } from "../../../lib/stock-performance";

export const revalidate = 60;

// The landing page renders dozens of stock cards, each needing the same eight return figures.
// A batch form lets the client coalesce them into one round-trip instead of one request per
// card, while `?symbol=` stays supported for the single-stock AI report.
const MAX_BATCH = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const batchParam = params.get("symbols");

  if (batchParam !== null) {
    const symbols = Array.from(
      new Set(
        batchParam
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      )
    ).slice(0, MAX_BATCH);

    if (symbols.length === 0) {
      return NextResponse.json({ error: "symbols query param must list at least one symbol" }, { status: 400 });
    }

    const results = await getCachedPerformanceSummaries(symbols);
    return NextResponse.json(
      { results },
      { headers: cacheHeaders(60) }
    );
  }

  const symbol = params.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param is required" }, { status: 400 });
  }

  const data = await getCachedPerformanceSummary(symbol);
  return NextResponse.json(data, { headers: cacheHeaders(60) });
}
