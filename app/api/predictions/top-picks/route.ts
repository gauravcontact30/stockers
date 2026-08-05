import { NextResponse } from "next/server";
import { getDailyPredictions } from "../../../lib/daily-predictions";
import { getAllQuotes } from "../../../lib/market-data";
import { getTopPicksToday } from "../../../lib/top-picks";

export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await getAllQuotes();
  const predictions = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );
  const cache = await getTopPicksToday(
    quotes.map((quote) => ({ symbol: quote.symbol, price: quote.price, changePercent: quote.changePercent })),
    predictions
  );

  return NextResponse.json(cache);
}
