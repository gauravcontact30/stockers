import { unstable_cache } from "next/cache";
import { bseCatalogue } from "./bse-catalogue";
import { getBseDirectory } from "./bse-market";
import { CACHE_TAGS } from "./cache";
import { readJsonCache } from "./data-cache";
import { indianStocks } from "./indian-stocks";
import { getPerformanceSummaries, type PerformanceSummary } from "./stock-performance";
import { getStockDetail, type DetailStock } from "./stock-detail";

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
  price?: number | null;
  changePercent?: number | null;
  sessionDate?: string | null;
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
  stats: { label: string; value: string | number | null }[];
  performance: AccuracyPerformancePoint[];
  comparison: AccuracyComparisonRow[];
  comparisonBasis: {
    category: string;
    capTier: string | null;
    period: string;
    rank: number;
    total: number;
  } | null;
  checks: { label: string; ok: boolean; detail: string; source: string }[];
};

export type AccuracyPerformancePoint = {
  key: "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "Overall";
  value: number | null;
  measuredFrom: string | null;
};

export type AccuracyComparisonRow = {
  rank: number;
  isTarget: boolean;
  symbol: string;
  name: string;
  scripCode: string;
  sector: string | null;
  industry: string | null;
  capTier: string | null;
  price: number | null;
  changePercent: number | null;
  marketCapCr: number | null;
  returns: Record<string, number | null>;
  performance: AccuracyPerformancePoint[];
};

async function readPredictionCache(): Promise<PredictionCache | null> {
  return readJsonCache<PredictionCache>("daily-predictions.json").catch(() => null);
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

const PERF_KEYS = [
  ["1D", "oneDay", null],
  ["1W", "oneWeek", "1w"],
  ["1M", "oneMonth", "1m"],
  ["3M", "threeMonth", "3m"],
  ["6M", "sixMonth", "6m"],
  ["1Y", "oneYear", "1y"],
  ["3Y", "threeYear", "3y"],
  ["5Y", "fiveYear", "5y"],
  ["Overall", "overall", "overall"],
] as const;

function performanceFor(stock: DetailStock | null, summary: PerformanceSummary | null | undefined, sessionDate: string | null): AccuracyPerformancePoint[] {
  return PERF_KEYS.map(([key, summaryKey, bseKey]) => {
    const bseValue = bseKey ? (stock?.returns[bseKey] ?? null) : null;
    const summaryValue = summary?.[summaryKey] ?? null;
    return {
      key,
      value: key === "1D" ? (stock?.changePercent ?? summaryValue) : bseValue ?? summaryValue,
      measuredFrom:
        key === "1D"
          ? sessionDate
          : bseKey
            ? (stock?.measuredFrom[bseKey] ?? (key === "Overall" ? (summary?.overallSince ?? null) : null))
            : null,
    };
  });
}

function statsFor(stock: DetailStock | null) {
  if (!stock) return [];
  return [
    { label: "Open", value: stock.open },
    { label: "Day high", value: stock.dayHigh },
    { label: "Day low", value: stock.dayLow },
    { label: "Prev close", value: stock.previousClose },
    { label: "Volume", value: stock.volume },
    { label: "Turnover cr", value: stock.turnoverCr },
    { label: "Trades", value: stock.trades },
    { label: "Market cap cr", value: stock.marketCapCr },
    { label: "Mcap rank", value: stock.rank },
    { label: "ISIN", value: stock.isin || null },
    { label: "Group", value: stock.group || null },
  ];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasCompleteSessionStats(stock: DetailStock | null): boolean {
  if (!stock) return false;
  return [
    stock.open,
    stock.dayHigh,
    stock.dayLow,
    stock.previousClose,
    stock.volume,
    stock.turnoverCr,
    stock.trades,
    stock.marketCapCr,
  ].every(isFiniteNumber);
}

function hasCompletePerformance(points: AccuracyPerformancePoint[]): boolean {
  return points.length === PERF_KEYS.length && points.every((point) => isFiniteNumber(point.value));
}

function rankComparison(rows: DetailStock[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const left = a.returns["1y"];
    const right = b.returns["1y"];
    if (left === null && right === null) return a.name.localeCompare(b.name);
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left || a.name.localeCompare(b.name);
  });

  return new Map(sorted.map((row, index) => [row.code, index + 1]));
}

function comparisonFor(detail: Awaited<ReturnType<typeof getStockDetail>> | null, summaries: Map<string, PerformanceSummary>): AccuracyComparisonRow[] {
  if (!detail) return [];
  const rows = [detail.stock, ...detail.peers];
  const ranks = rankComparison(rows);
  return rows.map((row) => ({
    rank: ranks.get(row.code) ?? rows.length,
    isTarget: row.code === detail.stock.code,
    symbol: row.ticker,
    name: row.name,
    scripCode: row.code,
    sector: row.sector,
    industry: row.industry,
    capTier: row.capTier,
    price: row.price,
    changePercent: row.changePercent,
    marketCapCr: row.marketCapCr,
    returns: row.returns,
    performance: performanceFor(row, summaries.get(row.ticker), detail.sessionDate),
  }));
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

export async function searchPricedBseAccuracyMatches(query: string, limit = 8): Promise<BseAccuracyMatch[]> {
  const matches = searchBseAccuracyMatches(query, limit);
  return Promise.all(
    matches.map(async (match) => {
      try {
        const directory = await getBseDirectory({ q: match.scripCode, page: 1, pageSize: 1 });
        const row = directory.rows.find((item) => item.code === match.scripCode) ?? null;
        return {
          ...match,
          price: row?.price ?? null,
          changePercent: row?.changePercent ?? null,
          sessionDate: directory.sessionDate,
        };
      } catch {
        return { ...match, price: null, changePercent: null, sessionDate: null };
      }
    }),
  );
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

  const [predictionCache, directory, detail] = await Promise.all([
    readPredictionCache(),
    getBseDirectory({ q: stock.scripCode, page: 1, pageSize: 1 }),
    getStockDetail(stock.scripCode, 24).catch(() => null),
  ]);
  const row = directory.rows.find((item) => item.code === stock.scripCode) ?? null;
  const prediction = predictionCache?.predictions?.[stock.symbol];
  const hasPrediction = isValidPrediction(prediction);
  const symbols = detail ? [detail.stock.ticker, ...detail.peers.map((peer) => peer.ticker)] : [stock.symbol];
  const summaries = await getPerformanceSummaries(symbols).catch(() => []);
  const summariesBySymbol = new Map(summaries.map((summary) => [summary.symbol, summary]));
  const performance = performanceFor(detail?.stock ?? null, summariesBySymbol.get(detail?.stock.ticker ?? stock.symbol), directory.sessionDate);
  const comparison = comparisonFor(detail, summariesBySymbol);
  const comparisonRank = comparison.find((item) => item.isTarget)?.rank ?? null;
  const hasOfficialTape =
    row &&
    isFiniteNumber(row.price) &&
    isFiniteNumber(row.previousClose) &&
    isFiniteNumber(row.changePercent) &&
    Boolean(directory.sessionDate);

  const checks = [
    {
      label: "BSE identity",
      ok: Boolean(row && row.code === stock.scripCode && row.name && row.isin),
      detail: row
        ? `${row.name} is matched to BSE scrip ${row.code}${row.isin ? ` and ISIN ${row.isin}` : ""}.`
        : "The stock was not found in the current BSE directory slice.",
      source: "BSE ListofScripData",
    },
    {
      label: "Official session tape",
      ok: Boolean(hasOfficialTape),
      detail: directory.sessionDate
        ? `Close, previous close and change are from the BSE Bhavcopy session ${directory.sessionDate}.`
        : "No recent BSE Bhavcopy session is available.",
      source: "BSE Bhavcopy",
    },
    {
      label: "Session stats",
      ok: hasCompleteSessionStats(detail?.stock ?? null),
      detail: "Open, high, low, previous close, volume, turnover, trades and market cap are all present.",
      source: "BSE Bhavcopy + ListofScripData",
    },
    {
      label: "Performance windows",
      ok: hasCompletePerformance(performance),
      detail: "1D, 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y and Overall values are populated from measured price history.",
      source: "BSE archive / measured quote history",
    },
    {
      label: "Peer rank",
      ok: comparison.length > 1 && comparisonRank !== null,
      detail:
        detail?.peerBasis && comparisonRank !== null
          ? `Ranked #${comparisonRank} among ${comparison.length} shown ${detail.peerBasis.capTier ?? "category"} peers by ${detail.peerBasis.period} return.`
          : "No same-category comparison set is available yet.",
      source: "BSE category and measured returns",
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
    stats: statsFor(detail?.stock ?? null),
    performance,
    comparison,
    comparisonBasis:
      detail?.peerBasis && comparisonRank !== null
        ? {
            category: detail.peerBasis.category,
            capTier: detail.peerBasis.capTier,
            period: detail.peerBasis.period,
            rank: comparisonRank,
            total: comparison.length,
          }
        : null,
    checks,
  };
}
