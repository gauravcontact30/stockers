import { NextResponse } from "next/server";
import { stockIcon } from "../../../lib/company-logos";
import { etfCategories, indianETFs } from "../../../lib/indian-etfs";
import { getQuotesFor } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await getQuotesFor(indianETFs);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const etfs = indianETFs.map((etf) => {
    const quote = quoteMap.get(etf.symbol);
    return {
      symbol: etf.symbol,
      name: etf.name,
      category: etf.category,
      amc: etf.amc,
      popular: etf.popular,
      logo: stockIcon(etf.symbol, etf.domain),
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

  const liveCount = etfs.filter((etf) => etf.live).length;

  return NextResponse.json({
    etfs,
    categories: etfCategories,
    generatedAt: new Date().toISOString(),
    liveCount,
    totalCount: etfs.length,
    source: "Yahoo Finance (unofficial public feed)",
  });
}
