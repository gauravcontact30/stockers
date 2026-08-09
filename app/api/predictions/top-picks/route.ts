import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { getDailyPredictions } from "../../../lib/daily-predictions";
import { getAllQuotes } from "../../../lib/market-data";
import { getTopPicksToday } from "../../../lib/top-picks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await guardFeature(request, "top-picks");
  if (!guard.allowed) return lockedResponse(guard, "top-picks");

  const quotes = await getAllQuotes();
  const predictions = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );
  const cache = await getTopPicksToday(
    quotes.map((quote) => ({ symbol: quote.symbol, price: quote.price, changePercent: quote.changePercent })),
    predictions
  );

  return NextResponse.json(cache, { headers: cacheHeaders(300, "private") });
}
