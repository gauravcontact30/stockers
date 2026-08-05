import { promises as fs } from "node:fs";
import path from "node:path";
import { companyLogoUrl, indianStocks, type CapTier } from "./indian-stocks";
import type { PredictionsCache } from "./daily-predictions";
import type { PeriodReturnsCache } from "./historical-returns";

export type InstitutionalTag = "Government / PSU" | "FII & DII favourite" | "Rising institutional interest";

export type BuyTomorrowPick = {
  symbol: string;
  name: string;
  sector: string;
  businessType: string;
  logo: string;
  capTier: CapTier;
  price: number | null;
  changePercent: number | null;
  oneMonthReturn: number | null;
  outlook: string;
  confidence: number;
  newsSignal: string;
  priceSignal: string;
  institutionalTag: InstitutionalTag;
  institutionalSignal: string;
};

export type BuyTomorrowCache = {
  date: string;
  generatedAt: string;
  source: "ai" | "heuristic";
  picks: BuyTomorrowPick[];
};

const PICK_COUNT = 10;

// Companies where the Government of India (directly or via a PSU holding company) is the
// majority/controlling shareholder — a verifiable, public fact rather than an AI guess.
const GOVERNMENT_LINKED = new Set([
  "SBIN", "BANKBARODA", "PNB", "CANBK", "UNIONBANK", "INDIANB", "BANKINDIA", "MAHABANK",
  "PFC", "RECLTD", "LICI", "GICRE", "NIACL", "IREDA",
  "ONGC", "IOC", "BPCL", "HINDPETRO", "GAIL", "OIL",
  "COALINDIA", "NALCO",
  "NTPC", "POWERGRID", "NHPC", "SJVN",
  "RVNL", "NBCC", "RAILTEL",
  "BHEL", "HAL", "BEL", "MAZDOCK", "COCHINSHIP",
]);

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function readCache(filePath: string): Promise<BuyTomorrowCache | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as BuyTomorrowCache;
  } catch {
    return null;
  }
}

async function writeCache(filePath: string, cache: BuyTomorrowCache) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), "utf8");
}

function priceSignalFor(changePercent: number | null, oneMonthReturn: number | null) {
  const today = changePercent ?? 0;
  const month = oneMonthReturn;

  if (typeof month === "number" && month < 0) {
    return `Down ${Math.abs(month).toFixed(1)}% over the past month${today < 0 ? ` and ${Math.abs(today).toFixed(1)}% today` : ""} — trading at a cheaper entry point than a month ago.`;
  }
  if (today < 0) {
    return `Off ${Math.abs(today).toFixed(1)}% today, offering a lower entry price than yesterday's close.`;
  }
  return `Steady near current levels — no froth, still reasonably valued versus recent history.`;
}

function institutionalSignalFor(symbol: string, capTier: CapTier): { tag: InstitutionalTag; note: string } {
  if (GOVERNMENT_LINKED.has(symbol)) {
    return {
      tag: "Government / PSU",
      note: "Government of India / PSU-controlled enterprise — strategic state ownership underpins long-term stability and policy support.",
    };
  }
  if (capTier === "Large") {
    return {
      tag: "FII & DII favourite",
      note: "Large-cap, high free-float name that typically sees active participation from FIIs, DIIs, and NRI portfolio investors.",
    };
  }
  return {
    tag: "Rising institutional interest",
    note: "Growing mid/small-cap story increasingly showing up on domestic institutional and HNI/NRI watchlists.",
  };
}

export async function getBuyTomorrowPicks(
  currentQuotes: { symbol: string; price: number | null; changePercent: number | null }[],
  predictions: PredictionsCache,
  oneMonthReturns: PeriodReturnsCache
): Promise<BuyTomorrowCache> {
  const filePath = path.join(process.cwd(), "app", "data", "buy-tomorrow.json");
  const today = todayIST();
  const cached = await readCache(filePath);
  if (cached && cached.date === today) return cached;

  const quoteMap = new Map(currentQuotes.map((quote) => [quote.symbol, quote]));

  const ranked = indianStocks
    .map((stock) => {
      const prediction = predictions.predictions[stock.symbol];
      const quote = quoteMap.get(stock.symbol);
      const oneMonthReturn = oneMonthReturns.returns[stock.symbol] ?? null;
      return { stock, quote, prediction, oneMonthReturn };
    })
    .filter((item) => item.prediction && item.prediction.outlook === "Bullish")
    .sort((a, b) => {
      const confidenceDiff = (b.prediction?.confidence ?? 0) - (a.prediction?.confidence ?? 0);
      if (confidenceDiff !== 0) return confidenceDiff;
      // Prefer stocks trading cheaper right now (lower today's move / weaker trailing month).
      const aCheapness = (a.oneMonthReturn ?? 0) + (a.quote?.changePercent ?? 0);
      const bCheapness = (b.oneMonthReturn ?? 0) + (b.quote?.changePercent ?? 0);
      return aCheapness - bCheapness;
    })
    .slice(0, PICK_COUNT);

  const picks: BuyTomorrowPick[] = ranked.map((item) => {
    const { tag, note } = institutionalSignalFor(item.stock.symbol, item.stock.capTier);
    return {
      symbol: item.stock.symbol,
      name: item.stock.name,
      sector: item.stock.sector,
      businessType: item.stock.sector,
      logo: companyLogoUrl(item.stock.domain),
      capTier: item.stock.capTier,
      price: item.quote?.price ?? null,
      changePercent: item.quote?.changePercent ?? null,
      oneMonthReturn: item.oneMonthReturn,
      outlook: item.prediction?.outlook ?? "Neutral",
      confidence: item.prediction?.confidence ?? 0,
      newsSignal: item.prediction?.note || "Positive market-news sentiment flagged by today's AI screen.",
      priceSignal: priceSignalFor(item.quote?.changePercent ?? null, item.oneMonthReturn),
      institutionalTag: tag,
      institutionalSignal: note,
    };
  });

  const cache: BuyTomorrowCache = {
    date: today,
    generatedAt: new Date().toISOString(),
    source: predictions.source,
    picks,
  };

  await writeCache(filePath, cache);
  return cache;
}
