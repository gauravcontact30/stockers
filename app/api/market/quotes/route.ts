import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { indianStocks, sectors } from "../../../lib/indian-stocks";
import { stockIcon } from "../../../lib/company-logos";
import { getAllQuotes } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await getAllQuotes();
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const stocks = indianStocks.map((stock) => {
    const quote = quoteMap.get(stock.symbol);
    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      logo: stockIcon(stock.symbol, stock.domain),
      price: quote?.price ?? null,
      previousClose: quote?.previousClose ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      dayHigh: quote?.dayHigh ?? null,
      dayLow: quote?.dayLow ?? null,
      volume: quote?.volume ?? null,
      live: quote?.live ?? false,
      asOf: quote?.asOf ?? null,
    };
  });

  const liveCount = stocks.filter((stock) => stock.live).length;

  return NextResponse.json(
    {
      stocks,
      sectors,
      generatedAt: new Date().toISOString(),
      liveCount,
      totalCount: stocks.length,
      source: "Yahoo Finance (unofficial public feed)",
    },
    { headers: cacheHeaders(60) },
  );
}
