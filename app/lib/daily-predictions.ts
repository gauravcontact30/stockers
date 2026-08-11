import { promises as fs } from "node:fs";
import path from "node:path";
import { indianStocks } from "./indian-stocks";
import { indianETFs } from "./indian-etfs";
import { appOrigin } from "./app-origin";

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
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function readCache(filePath: string): Promise<PredictionsCache | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as PredictionsCache;
  } catch {
    return null;
  }
}

async function writeCache(filePath: string, cache: PredictionsCache) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), "utf8");
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

async function generateChunkWithAI(chunk: ChangeInput[], entityLabel: string): Promise<Record<string, Prediction> | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appOrigin(),
        "X-Title": "stockers-daily-predictions-agent",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              `You are an AI research agent producing a one-day outlook for ${entityLabel}. Respond ONLY with a JSON array, one object per input item, in this exact shape: {"symbol": string, "outlook": "Bullish"|"Bearish"|"Neutral", "confidence": number (0-100), "note": string (max 140 characters)}. Do not include any text outside the JSON array.`,
          },
          {
            role: "user",
            content: JSON.stringify(chunk),
          },
        ],
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Prediction[];
    const results: Record<string, Prediction> = {};
    for (const item of parsed) {
      if (item?.symbol) results[item.symbol] = item;
    }
    return results;
  } catch {
    return null;
  }
}

async function generateWithAI(itemsWithChange: ChangeInput[], entityLabel: string): Promise<Record<string, Prediction> | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

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
  const filePath = path.join(process.cwd(), "app", "data", cacheFileName);
  const today = todayIST();
  const cached = await readCache(filePath);
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

  await writeCache(filePath, cache);
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
