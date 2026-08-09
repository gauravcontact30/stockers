import { promises as fs } from "node:fs";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { bseCatalogue } from "./bse-catalogue";
import { getBseDirectory } from "./bse-market";
import { CACHE_TAGS } from "./cache";
import { indianStocks } from "./indian-stocks";

type CachedPrediction = {
  symbol?: string;
  outlook?: string;
  confidence?: number;
  note?: string;
};

type PredictionCache = {
  date?: string;
  generatedAt?: string;
  source?: "ai" | "heuristic";
  predictions?: Record<string, CachedPrediction>;
};

export type AccuracyMetrics = {
  catalogueTotal: number;
  completeCatalogueRows: number;
  bseMatrixCoverage: number;
  predictionCoverage: number;
  sectorsCovered: number;
  nseLinked: number;
  bseOnly: number;
  validPredictionRows: number;
  predictionUniverse: number;
  averageConfidence: number;
  highestConfidence: number;
  predictionSource: string;
  predictionGeneratedAt?: string;
};

export type BseAccuracyMatch = {
  symbol: string;
  name: string;
  scripCode: string;
  yahooSymbol: string;
  sector: string;
  capTier: string;
};

export type BseStockAccuracy = BseAccuracyMatch & {
  matrixAccuracy: number;
  exchangeDataCoverage: number;
  predictionConfidence: number | null;
  predictionStatus: "available" | "not-covered";
  predictionOutlook: string | null;
  predictionNote: string | null;
  predictionSource: string;
  predictionGeneratedAt?: string;
  price: number | null;
  changePercent: number | null;
  sessionDate: string | null;
  checks: { label: string; ok: boolean; detail: string }[];
};

async function readPredictionCache(): Promise<PredictionCache | null> {
  try {
    const file = path.join(process.cwd(), "app", "data", "daily-predictions.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as PredictionCache;
  } catch {
    return null;
  }
}

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function isValidPrediction(item: CachedPrediction | undefined): item is CachedPrediction & {
  symbol: string;
  outlook: string;
  confidence: number;
} {
  return Boolean(
    item?.symbol &&
      ["Bullish", "Bearish", "Neutral"].includes(item.outlook ?? "") &&
      typeof item.confidence === "number" &&
      Number.isFinite(item.confidence) &&
      item.confidence >= 0 &&
      item.confidence <= 100,
  );
}

function toMatch(stock: ReturnType<typeof bseCatalogue>[number]): BseAccuracyMatch {
  return {
    symbol: stock.symbol,
    name: stock.name,
    scripCode: stock.scripCode,
    yahooSymbol: stock.yahooSymbol,
    sector: stock.sector,
    capTier: stock.capTier,
  };
}

export const getAccuracyMetrics = unstable_cache(
  async (): Promise<AccuracyMetrics> => {
    const catalogue = bseCatalogue();
    const predictionCache = await readPredictionCache();
    const predictionRows = Object.values(predictionCache?.predictions ?? {});
    const validPredictionRows = predictionRows.filter(isValidPrediction);
    const completeCatalogueRows = catalogue.filter(
      (stock) => stock.symbol && stock.name && stock.scripCode && stock.yahooSymbol && stock.sector && stock.capTier,
    ).length;
    const nseLinked = catalogue.filter((stock) => stock.yahooSymbol.endsWith(".NS")).length;

    return {
      catalogueTotal: catalogue.length,
      completeCatalogueRows,
      bseMatrixCoverage: percentage(completeCatalogueRows, catalogue.length),
      predictionCoverage: percentage(validPredictionRows.length, indianStocks.length),
      sectorsCovered: new Set(catalogue.map((stock) => stock.sector).filter(Boolean)).size,
      nseLinked,
      bseOnly: catalogue.length - nseLinked,
      validPredictionRows: validPredictionRows.length,
      predictionUniverse: indianStocks.length,
      averageConfidence:
        validPredictionRows.length > 0
          ? Math.round(validPredictionRows.reduce((total, item) => total + item.confidence, 0) / validPredictionRows.length)
          : 0,
      highestConfidence: validPredictionRows.reduce((max, item) => Math.max(max, item.confidence), 0),
      predictionSource: predictionCache?.source ?? "unknown",
      predictionGeneratedAt: predictionCache?.generatedAt,
    };
  },
  ["stockers", "accuracy-matrix"],
  { revalidate: 60, tags: [CACHE_TAGS.bse, CACHE_TAGS.ai] },
);

export function searchBseAccuracyMatches(query: string, limit = 8): BseAccuracyMatch[] {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  return bseCatalogue()
    .filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(term) ||
        stock.name.toLowerCase().includes(term) ||
        stock.scripCode.includes(term) ||
        stock.yahooSymbol.toLowerCase().includes(term),
    )
    .slice(0, limit)
    .map(toMatch);
}

export async function getBseStockAccuracy(query: string): Promise<BseStockAccuracy | null> {
  const term = query.trim().toLowerCase();
  if (!term) return null;

  const stock = bseCatalogue().find(
    (entry) =>
      entry.symbol.toLowerCase() === term ||
      entry.scripCode === term ||
      entry.yahooSymbol.toLowerCase() === term ||
      entry.name.toLowerCase() === term,
  );
  if (!stock) return null;

  const [predictionCache, directory] = await Promise.all([
    readPredictionCache(),
    getBseDirectory({ q: stock.scripCode, page: 1, pageSize: 1 }),
  ]);
  const row = directory.rows.find((item) => item.code === stock.scripCode) ?? null;
  const prediction = predictionCache?.predictions?.[stock.symbol];
  const hasPrediction = isValidPrediction(prediction);

  const checks = [
    {
      label: "Identity",
      ok: Boolean(stock.symbol && stock.name && stock.scripCode && stock.yahooSymbol),
      detail: "Symbol, company name, scrip code and Yahoo ticker are present.",
    },
    {
      label: "Classification",
      ok: Boolean(stock.sector && stock.capTier),
      detail: "Sector bucket and cap tier are available for filtering and grouping.",
    },
    {
      label: "Exchange tape",
      ok: Boolean(
        row &&
          typeof row.price === "number" &&
          Number.isFinite(row.price) &&
          typeof row.changePercent === "number" &&
          Number.isFinite(row.changePercent) &&
          directory.sessionDate,
      ),
      detail: directory.sessionDate
        ? `Latest BSE Bhavcopy session: ${directory.sessionDate}.`
        : "No recent BSE Bhavcopy session is available.",
    },
  ];

  return {
    ...toMatch(stock),
    matrixAccuracy: percentage(checks.filter((check) => check.ok).length, checks.length),
    exchangeDataCoverage: checks[2].ok ? 100 : 0,
    predictionConfidence: hasPrediction ? prediction.confidence : null,
    predictionStatus: hasPrediction ? "available" : "not-covered",
    predictionOutlook: hasPrediction ? (prediction.outlook ?? null) : null,
    predictionNote: hasPrediction ? (prediction.note ?? null) : null,
    predictionSource: predictionCache?.source ?? "unknown",
    predictionGeneratedAt: predictionCache?.generatedAt,
    price: row?.price ?? null,
    changePercent: row?.changePercent ?? null,
    sessionDate: directory.sessionDate,
    checks,
  };
}
