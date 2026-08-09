import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { indianETFs } from "../../../lib/indian-etfs";
import { getDailyEtfPredictions } from "../../../lib/daily-predictions";
import { getQuotesFor } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await guardFeature(request, "etf-research");
  if (!guard.allowed) return lockedResponse(guard, "etf-research");

  const quotes = await getQuotesFor(indianETFs);
  const cache = await getDailyEtfPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );

  return NextResponse.json(cache, { headers: cacheHeaders(300, "private") });
}
