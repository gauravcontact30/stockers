import { NextResponse } from "next/server";
import { indianETFs } from "../../../lib/indian-etfs";
import { getDailyEtfPredictions } from "../../../lib/daily-predictions";
import { getQuotesFor } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await getQuotesFor(indianETFs);
  const cache = await getDailyEtfPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent }))
  );

  return NextResponse.json(cache);
}
