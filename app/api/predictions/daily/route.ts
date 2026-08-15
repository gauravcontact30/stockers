import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getDailyPredictions } from "../../../lib/daily-predictions";
import { getAllQuotes } from "../../../lib/market-data";

export async function GET() {
  const quotes = await getAllQuotes();
  const cache = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );

  return NextResponse.json(cache, { headers: cacheHeaders(300) });
}
