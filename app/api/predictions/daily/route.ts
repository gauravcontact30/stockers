import { NextResponse } from "next/server";
import { getDailyPredictions } from "../../../lib/daily-predictions";
import { getAllQuotes } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await getAllQuotes();
  const cache = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );

  return NextResponse.json(cache);
}
