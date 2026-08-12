import { readJsonCache, writeJsonCache } from "./data-cache";
import { indianStocks, type CapTier } from "./indian-stocks";
import { stockIcon } from "./company-logos";
import { mapWithConcurrency } from "./market-data";
import { generateAnalysis, type AnalysisResult } from "./stock-analysis";
import type { PredictionsCache } from "./daily-predictions";

export type TopPick = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  logo: string | null;
  price: number | null;
  changePercent: number | null;
  outlook: string;
  confidence: number;
  analysis: AnalysisResult;
};

export type TopPicksCache = {
  date: string;
  generatedAt: string;
  source: "ai" | "heuristic";
  picks: TopPick[];
};

const CACHE_FILE = "top-picks.json";
const PICK_COUNT = 6;
const ANALYSIS_CONCURRENCY = 3;

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function getTopPicksToday(
  currentQuotes: { symbol: string; price: number | null; changePercent: number | null }[],
  predictions: PredictionsCache
): Promise<TopPicksCache> {
  const today = todayIST();
  const cached = await readJsonCache<TopPicksCache>(CACHE_FILE);
  if (cached && cached.date === today) return cached;

  const quoteMap = new Map(currentQuotes.map((quote) => [quote.symbol, quote]));

  const ranked = indianStocks
    .map((stock) => {
      const prediction = predictions.predictions[stock.symbol];
      const quote = quoteMap.get(stock.symbol);
      return { stock, quote, prediction };
    })
    .filter((item) => item.prediction)
    .sort((a, b) => {
      const bullishRank = (p?: { outlook: string }) => (p?.outlook === "Bullish" ? 1 : 0);
      const bullishDiff = bullishRank(b.prediction) - bullishRank(a.prediction);
      if (bullishDiff !== 0) return bullishDiff;
      const confidenceDiff = (b.prediction?.confidence ?? 0) - (a.prediction?.confidence ?? 0);
      if (confidenceDiff !== 0) return confidenceDiff;
      return (b.quote?.changePercent ?? -Infinity) - (a.quote?.changePercent ?? -Infinity);
    })
    .slice(0, PICK_COUNT);

  const analyses = await mapWithConcurrency(ranked, ANALYSIS_CONCURRENCY, (item) => generateAnalysis(item.stock.symbol));

  const picks: TopPick[] = ranked.map((item, index) => ({
    symbol: item.stock.symbol,
    name: item.stock.name,
    sector: item.stock.sector,
    capTier: item.stock.capTier,
    logo: stockIcon(item.stock.symbol, item.stock.domain),
    price: item.quote?.price ?? null,
    changePercent: item.quote?.changePercent ?? null,
    outlook: item.prediction?.outlook ?? "Neutral",
    confidence: item.prediction?.confidence ?? 0,
    analysis: analyses[index],
  }));

  const cache: TopPicksCache = {
    date: today,
    generatedAt: new Date().toISOString(),
    source: analyses.some((a) => a.source === "ai") ? "ai" : "heuristic",
    picks,
  };

  await writeJsonCache(CACHE_FILE, cache);
  return cache;
}
