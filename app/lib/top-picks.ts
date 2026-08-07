import { promises as fs } from "node:fs";
import path from "node:path";
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

const PICK_COUNT = 6;
const ANALYSIS_CONCURRENCY = 3;

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function readCache(filePath: string): Promise<TopPicksCache | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as TopPicksCache;
  } catch {
    return null;
  }
}

async function writeCache(filePath: string, cache: TopPicksCache) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), "utf8");
}

export async function getTopPicksToday(
  currentQuotes: { symbol: string; price: number | null; changePercent: number | null }[],
  predictions: PredictionsCache
): Promise<TopPicksCache> {
  const filePath = path.join(process.cwd(), "app", "data", "top-picks.json");
  const today = todayIST();
  const cached = await readCache(filePath);
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

  await writeCache(filePath, cache);
  return cache;
}
