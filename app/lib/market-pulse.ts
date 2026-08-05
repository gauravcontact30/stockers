import { indianStocks } from "./indian-stocks";
import { getAllQuotes } from "./market-data";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
// Market breadth shifts through the trading session, so this is cached far shorter than the
// once-a-day disk caches used elsewhere (predictions, returns) — an in-memory TTL is enough.
const CACHE_TTL_MS = 15 * 60 * 1000;

export type Mood = "Risk-On" | "Neutral" | "Risk-Off";

export type MarketBreadth = {
  totalTracked: number;
  advancing: number;
  declining: number;
  unchanged: number;
  averageChangePercent: number;
  topSector: { name: string; averageChangePercent: number } | null;
  bottomSector: { name: string; averageChangePercent: number } | null;
  topGainer: { symbol: string; name: string; changePercent: number } | null;
  topLoser: { symbol: string; name: string; changePercent: number } | null;
};

export type MarketPulse = {
  breadth: MarketBreadth;
  mood: Mood;
  summary: string;
  themes: string[];
  sectorsToWatch: string[];
  generatedAt: string;
  source: "ai" | "heuristic";
};

let cache: { data: MarketPulse; expiresAt: number } | null = null;

function computeBreadth(quotes: { symbol: string; changePercent: number | null }[]): MarketBreadth {
  const stockMap = new Map(indianStocks.map((stock) => [stock.symbol, stock]));
  const live = quotes.filter((q) => typeof q.changePercent === "number");

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let changeSum = 0;
  const sectorTotals = new Map<string, { sum: number; count: number }>();
  let topGainer: MarketBreadth["topGainer"] = null;
  let topLoser: MarketBreadth["topLoser"] = null;

  for (const quote of live) {
    const pct = quote.changePercent as number;
    const stock = stockMap.get(quote.symbol);
    changeSum += pct;
    if (pct > 0) advancing++;
    else if (pct < 0) declining++;
    else unchanged++;

    if (stock) {
      const bucket = sectorTotals.get(stock.sector) ?? { sum: 0, count: 0 };
      bucket.sum += pct;
      bucket.count += 1;
      sectorTotals.set(stock.sector, bucket);

      if (!topGainer || pct > topGainer.changePercent) topGainer = { symbol: stock.symbol, name: stock.name, changePercent: pct };
      if (!topLoser || pct < topLoser.changePercent) topLoser = { symbol: stock.symbol, name: stock.name, changePercent: pct };
    }
  }

  const sectorAverages = Array.from(sectorTotals.entries()).map(([name, { sum, count }]) => ({
    name,
    averageChangePercent: sum / count,
  }));
  sectorAverages.sort((a, b) => b.averageChangePercent - a.averageChangePercent);

  return {
    totalTracked: live.length,
    advancing,
    declining,
    unchanged,
    averageChangePercent: live.length > 0 ? changeSum / live.length : 0,
    topSector: sectorAverages[0] ?? null,
    bottomSector: sectorAverages[sectorAverages.length - 1] ?? null,
    topGainer,
    topLoser,
  };
}

function moodFromBreadth(breadth: MarketBreadth): Mood {
  const decisive = breadth.advancing + breadth.declining;
  if (decisive === 0) return "Neutral";
  const advanceRatio = breadth.advancing / decisive;
  if (advanceRatio >= 0.55) return "Risk-On";
  if (advanceRatio <= 0.45) return "Risk-Off";
  return "Neutral";
}

function buildHeuristicPulse(breadth: MarketBreadth): MarketPulse {
  const mood = moodFromBreadth(breadth);
  const direction = breadth.averageChangePercent >= 0 ? "higher" : "lower";

  const summary =
    `${breadth.advancing} of ${breadth.totalTracked} tracked stocks are trading ${breadth.averageChangePercent >= 0 ? "higher" : "lower"} today, ` +
    `with the average move running ${direction} at ${breadth.averageChangePercent.toFixed(2)}%.` +
    (breadth.topSector ? ` ${breadth.topSector.name} is leading the tape.` : "") +
    (breadth.bottomSector && breadth.bottomSector.name !== breadth.topSector?.name ? ` ${breadth.bottomSector.name} is lagging.` : "");

  const themes = [
    breadth.topSector ? `${breadth.topSector.name} strength` : "Sector rotation",
    breadth.bottomSector ? `${breadth.bottomSector.name} weakness` : "Mixed breadth",
    mood === "Risk-On" ? "Broad-based buying" : mood === "Risk-Off" ? "Broad-based selling" : "Range-bound trading",
  ];

  const sectorsToWatch = [breadth.topSector?.name, breadth.bottomSector?.name].filter((s): s is string => Boolean(s));

  return {
    breadth,
    mood,
    summary,
    themes,
    sectorsToWatch,
    generatedAt: new Date().toISOString(),
    source: "heuristic",
  };
}

async function generatePulseWithAI(breadth: MarketBreadth): Promise<MarketPulse | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers-market-pulse",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are stockers, an AI market-breadth analyst for Indian equities. You are given real, computed breadth statistics (advancers/decliners, average move, leading/lagging sectors) from a live universe of Indian stocks — not the full market. Return compact JSON only, with these keys: mood, summary, themes, sectorsToWatch. mood must be exactly one of \"Risk-On\", \"Neutral\", or \"Risk-Off\", consistent with the advance/decline data given. summary is 2-3 sentences on today's mood grounded in the numbers provided. themes is an array of 3 short (2-5 word) theme labels. sectorsToWatch is an array of 2-3 sector names to watch, drawn from the data given.",
          },
          {
            role: "user",
            content: `Real breadth data from our tracked Indian stock universe: ${JSON.stringify(breadth)}. Write today's market pulse from this data.`,
          },
        ],
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const mood: Mood = ["Risk-On", "Neutral", "Risk-Off"].includes(parsed.mood) ? parsed.mood : moodFromBreadth(breadth);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary : buildHeuristicPulse(breadth).summary;
    const themes = Array.isArray(parsed.themes) ? parsed.themes.filter((t: unknown) => typeof t === "string") : [];
    const sectorsToWatch = Array.isArray(parsed.sectorsToWatch) ? parsed.sectorsToWatch.filter((t: unknown) => typeof t === "string") : [];

    return {
      breadth,
      mood,
      summary,
      themes: themes.length > 0 ? themes : buildHeuristicPulse(breadth).themes,
      sectorsToWatch: sectorsToWatch.length > 0 ? sectorsToWatch : buildHeuristicPulse(breadth).sectorsToWatch,
      generatedAt: new Date().toISOString(),
      source: "ai",
    };
  } catch {
    return null;
  }
}

export async function getMarketPulse(): Promise<MarketPulse> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const quotes = await getAllQuotes();
  const breadth = computeBreadth(quotes);
  const pulse = (await generatePulseWithAI(breadth)) ?? buildHeuristicPulse(breadth);

  cache = { data: pulse, expiresAt: Date.now() + CACHE_TTL_MS };
  return pulse;
}
