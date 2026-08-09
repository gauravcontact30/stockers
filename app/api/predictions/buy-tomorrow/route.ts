import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { getBuyTomorrowPicks } from "../../../lib/buy-tomorrow";
import { getDailyPredictions } from "../../../lib/daily-predictions";
import { getOneMonthReturns } from "../../../lib/historical-returns";
import { getAllQuotes } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await guardFeature(request, "buy-tomorrow");
  if (!guard.allowed) return lockedResponse(guard, "buy-tomorrow");

  const [quotes, oneMonth] = await Promise.all([getAllQuotes(), getOneMonthReturns()]);
  const predictions = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );
  const cache = await getBuyTomorrowPicks(
    quotes.map((quote) => ({ symbol: quote.symbol, price: quote.price, changePercent: quote.changePercent })),
    predictions,
    oneMonth
  );

  return NextResponse.json(cache, { headers: cacheHeaders(300, "private") });
}
