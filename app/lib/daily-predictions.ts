// Reads OPENROUTER_API_KEY through `./openrouter`. The `server-only` import makes a client
// component that pulls this in a build error, rather than a key that quietly ships to the browser.
import "server-only";

import { readJsonCache, writeJsonCache } from "./data-cache";
import { indianStocks } from "./indian-stocks";
import { indianETFs } from "./indian-etfs";
import { aiConfigured, chatJson } from "./openrouter";

export type Outlook = "Bullish" | "Bearish" | "Neutral";

export type Prediction = {
  symbol: string;
  outlook: Outlook;
  confidence: number;
  note: string;
};

export type PredictionsCache = {
  date: string;
  generatedAt: string;
  source: "ai" | "heuristic";
  predictions: Record<string, Prediction>;
};

type UniverseItem = { symbol: string; name: string; sector: string };
type ChangeInput = UniverseItem & { changePercent: number | null };

const CHUNK_SIZE = 25;

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function heuristicPrediction(symbol: string, changePercent: number | null): Prediction {
  const pct = changePercent ?? 0;
  const outlook: Outlook = pct > 1 ? "Bullish" : pct < -1 ? "Bearish" : "Neutral";
  const confidence = Math.min(92, 55 + Math.round(Math.abs(pct) * 8));
  const note =
    outlook === "Bullish"
      ? "Momentum and today's move favor continuation if broader sentiment holds."
      : outlook === "Bearish"
        ? "Recent weakness warrants caution; watch for signs of stabilization."
        : "Price action is range-bound; a clearer catalyst is needed for direction.";
  return { symbol, outlook, confidence, note };
}

/**
 * The reply here is a JSON *array*, not an object, so it does not go through
 * `extractJsonObject` — the outlook for a chunk is one entry per input item.
 */
async function generateChunkWithAI(chunk: ChangeInput[], entityLabel: string): Promise<Record<string, Prediction> | null> {
  return chatJson({
    feature: "daily-predictions",
    system: `You are an AI research agent producing a one-day outlook for ${entityLabel}. Respond ONLY with a JSON array, one object per input item, in this exact shape: {"symbol": string, "outlook": "Bullish"|"Bearish"|"Neutral", "confidence": number (0-100), "note": string (max 140 characters)}. Do not include any text outside the JSON array.`,
    user: JSON.stringify(chunk),
    temperature: 0.2,
    parse: (text) => {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
      if (!Array.isArray(parsed)) return null;

      const results: Record<string, Prediction> = {};
      for (const item of parsed as Prediction[]) {
        if (item?.symbol) results[item.symbol] = item;
      }
      // A chunk that named nothing is a fallback, not a success: every symbol in it drops back to
      // its heuristic outlook exactly as if the request had failed.
      return Object.keys(results).length > 0 ? results : null;
    },
  });
}

async function generateWithAI(itemsWithChange: ChangeInput[], entityLabel: string): Promise<Record<string, Prediction> | null> {
  // Checked once here rather than per chunk: without a key there is nothing to attempt, and
  // letting each of the chunks below record its own "unconfigured" call would put a spike of
  // dozens of them on the AI dashboard for a single unconfigured run.
  if (!aiConfigured()) return null;

  const chunks: ChangeInput[][] = [];
  for (let i = 0; i < itemsWithChange.length; i += CHUNK_SIZE) {
    chunks.push(itemsWithChange.slice(i, i + CHUNK_SIZE));
  }

  const chunkResults = await Promise.all(chunks.map((chunk) => generateChunkWithAI(chunk, entityLabel)));
  const merged: Record<string, Prediction> = {};
  for (const chunkResult of chunkResults) {
    if (chunkResult) Object.assign(merged, chunkResult);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

async function getDailyPredictionsFor(
  cacheFileName: string,
  universe: UniverseItem[],
  entityLabel: string,
  currentQuotes: { symbol: string; changePercent: number | null }[]
): Promise<PredictionsCache> {
  const today = todayIST();
  const cached = await readJsonCache<PredictionsCache>(cacheFileName);
  if (cached && cached.date === today) return cached;

  const changeMap = new Map(currentQuotes.map((quote) => [quote.symbol, quote.changePercent]));
  const itemsWithChange: ChangeInput[] = universe.map((item) => ({
    ...item,
    changePercent: changeMap.get(item.symbol) ?? null,
  }));

  const aiResults = await generateWithAI(itemsWithChange, entityLabel);

  const predictions: Record<string, Prediction> = {};
  for (const item of itemsWithChange) {
    predictions[item.symbol] = aiResults?.[item.symbol] ?? heuristicPrediction(item.symbol, item.changePercent);
  }

  const cache: PredictionsCache = {
    date: today,
    generatedAt: new Date().toISOString(),
    source: aiResults ? "ai" : "heuristic",
    predictions,
  };

  await writeJsonCache(cacheFileName, cache);
  return cache;
}

export async function getDailyPredictions(
  currentQuotes: { symbol: string; changePercent: number | null }[]
): Promise<PredictionsCache> {
  const universe = indianStocks.map((stock) => ({ symbol: stock.symbol, name: stock.name, sector: stock.sector }));
  return getDailyPredictionsFor("daily-predictions.json", universe, "Indian stocks", currentQuotes);
}

export async function getDailyEtfPredictions(
  currentQuotes: { symbol: string; changePercent: number | null }[]
): Promise<PredictionsCache> {
  const universe = indianETFs.map((etf) => ({ symbol: etf.symbol, name: etf.name, sector: etf.category }));
  return getDailyPredictionsFor("etf-daily-predictions.json", universe, "Indian ETFs and index funds", currentQuotes);
}
