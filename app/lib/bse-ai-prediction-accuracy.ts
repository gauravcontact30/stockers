import "server-only";

import { z } from "zod";
import { readJsonCache, writeJsonCache } from "./data-cache";
import { getBseMovers, getBseRows, type BseCapTier, type BseQuote, type BseStock } from "./bse-market";
import { bseCatalogue, type CatalogueEntry } from "./bse-catalogue";
import { findStock } from "./stock-search";
import { getMarketNews, type NewsItem } from "./market-news";
import { getQuotesFor, type LiveQuote, type QuoteSubject } from "./market-data";
import { aiModel, chatJson, extractJsonObject } from "./openrouter";

const CACHE_FILE = "bse-ai-locked-picks.json";
const SESSION_SNAPSHOT_FILE = "bse-ai-prediction-accuracy-session.json";
const PICK_COUNT = 10;
const CANDIDATE_COUNT = 30;
const ACTUAL_POOL_COUNT = 50;
const IST_TIME_ZONE = "Asia/Kolkata";
const CAP_TIERS: BseCapTier[] = ["Large", "Mid", "Small"];
const TIER_QUERY: Record<BseCapTier, "large" | "mid" | "small"> = { Large: "large", Mid: "mid", Small: "small" };

export type PredictionSource = "ai" | "heuristic";
export type PredictionStatus = "locked" | "not-generated";

export type PredictionSourceLink = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
};

export type LockedPredictionPick = {
  symbol: string;
  stockName: string;
  bseCode: string | null;
  sector: string;
  capTier: "Large" | "Mid" | "Small" | null;
  confidence: number;
  reason: string;
  positiveNewsSignals: string[];
  sources: PredictionSourceLink[];
};

export type LockedPredictionCache = {
  date: string;
  generatedAt: string;
  cutoffAt: string;
  source: PredictionSource;
  model: string | null;
  picksByCap: Record<BseCapTier, LockedPredictionPick[]>;
  /** Kept so an older cache file still reads without crashing. */
  picks?: LockedPredictionPick[];
};

export type PredictionPerformance = {
  symbol: string;
  stockName: string;
  bseCode: string | null;
  sector: string;
  capTier: "Large" | "Mid" | "Small" | null;
  rank: number;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
  live: boolean;
  asOf: string | null;
  priceSource: "Yahoo Finance live quote" | "BSE Bhavcopy";
  confidence?: number;
  reason?: string;
  positiveNewsSignals?: string[];
  sources?: PredictionSourceLink[];
  matchedActualRank: number | null;
  rankDifference: number | null;
};

export type AccuracySummary = {
  matched: number;
  total: number;
  percent: number;
};

export type BseAiPredictionAccuracy = {
  status: PredictionStatus;
  date: string;
  cutoffAt: string;
  marketCloseAt: string;
  generatedAt: string | null;
  source: PredictionSource | null;
  model: string | null;
  message: string;
  predictionsByCap: Record<BseCapTier, PredictionPerformance[]>;
  actualTopByCap: Record<BseCapTier, PredictionPerformance[]>;
  accuracyByCap: Record<BseCapTier, AccuracySummary>;
  /** Large-cap rows kept for older callers. */
  predictions: PredictionPerformance[];
  /** Large-cap rows kept for older callers. */
  actualTop: PredictionPerformance[];
  accuracy: AccuracySummary;
  sessionDate: string | null;
  asOf: string;
  persistedSession: boolean;
  persistedAt: string | null;
};

type Candidate = {
  symbol: string;
  stockName: string;
  bseCode: string | null;
  sector: string;
  capTier: BseCapTier | null;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  score: number;
  headlines: PredictionSourceLink[];
};

type BseJoinedRow = BseStock & BseQuote & { sector?: string | null };

let catalogueById: Map<string, CatalogueEntry> | null = null;

const AiPickSchema = z.object({
  ticker: z.string().min(1).max(24),
  stockName: z.string().min(1).max(120),
  bseCode: z.string().min(1).max(12).optional().nullable(),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(220),
  positiveNewsSignals: z.array(z.string().min(1).max(120)).max(4).default([]),
  sourceUrls: z.array(z.string().url()).max(5).default([]),
  sourceTitles: z.array(z.string().min(1).max(160)).max(5).default([]),
});

const AiResponseSchema = z.object({
  picks: z.array(AiPickSchema).min(1).max(PICK_COUNT),
});

function emptyCapRows<T>(): Record<BseCapTier, T[]> {
  return { Large: [], Mid: [], Small: [] };
}

function emptyCapAccuracy(): Record<BseCapTier, AccuracySummary> {
  return {
    Large: { matched: 0, total: PICK_COUNT, percent: 0 },
    Mid: { matched: 0, total: PICK_COUNT, percent: 0 },
    Small: { matched: 0, total: PICK_COUNT, percent: 0 },
  };
}

export function tradingDayKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST_TIME_ZONE });
}

export function predictionCutoffAt(day = tradingDayKey()): string {
  return `${day}T09:15:00+05:30`;
}

export function marketCloseAt(day = tradingDayKey()): string {
  return `${day}T15:30:00+05:30`;
}

export function isBeforePredictionCutoff(now = new Date()): boolean {
  return now.getTime() < new Date(predictionCutoffAt(tradingDayKey(now))).getTime();
}

export function isAfterMarketClose(now = new Date()): boolean {
  return now.getTime() >= new Date(marketCloseAt(tradingDayKey(now))).getTime();
}

function asPct(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function cleanSymbol(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function clip(value: string, limit: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

function quoteScore(row: BseJoinedRow | null | undefined): number {
  if (!row) return 0;
  return Math.max(-8, Math.min(8, row.changePercent ?? 0));
}

function sourceOf(item: NewsItem): PredictionSourceLink {
  return {
    title: item.title,
    url: item.url,
    publisher: item.source,
    publishedAt: item.publishedAt,
  };
}

function rowIdentifiers(row: { symbol?: string; ticker?: string; bseCode?: string | null; code?: string | null }) {
  return [row.symbol, row.ticker, row.bseCode, row.code].map(cleanSymbol).filter(Boolean);
}

function buildRowMaps(rows: BseJoinedRow[]) {
  const byId = new Map<string, BseJoinedRow>();
  for (const row of rows) {
    for (const id of rowIdentifiers(row)) byId.set(id, row);
  }
  return byId;
}

function catalogueEntryFor(row: { symbol?: string; bseCode?: string | null; code?: string | null }) {
  if (!catalogueById) {
    catalogueById = new Map<string, CatalogueEntry>();
    for (const entry of bseCatalogue()) {
      catalogueById.set(cleanSymbol(entry.symbol), entry);
      catalogueById.set(cleanSymbol(entry.scripCode), entry);
    }
  }

  return rowIdentifiers(row).map((id) => catalogueById?.get(id)).find(Boolean) ?? null;
}

function quoteSubjectFor(row: { symbol: string; bseCode: string | null }): QuoteSubject | null {
  const entry = catalogueEntryFor(row);
  const symbol = cleanSymbol(entry?.symbol) || cleanSymbol(row.symbol);
  if (!symbol) return null;

  return {
    symbol,
    yahooSymbol: entry?.yahooSymbol ?? (row.bseCode ? `${row.bseCode}.BO` : `${symbol}.NS`),
  };
}

function sectorFor(row: { symbol?: string; bseCode?: string | null; code?: string | null; sector?: string | null }): string {
  return row.sector || catalogueEntryFor(row)?.sector || "unclassified";
}

function capTierFor(row: { symbol?: string; bseCode?: string | null; code?: string | null; capTier?: BseCapTier | null }) {
  return row.capTier ?? catalogueEntryFor(row)?.capTier ?? null;
}

function quoteKey(row: { symbol: string; bseCode: string | null }): string | null {
  const subject = quoteSubjectFor(row);
  return subject?.symbol ?? null;
}

function withLiveQuote(row: PredictionPerformance, quote: LiveQuote | undefined): PredictionPerformance {
  if (!quote?.live) return row;

  return {
    ...row,
    price: quote.price,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    dayHigh: quote.dayHigh,
    dayLow: quote.dayLow,
    volume: quote.volume,
    live: true,
    asOf: quote.asOf,
    priceSource: "Yahoo Finance live quote",
  };
}

async function attachLiveQuotes(rows: PredictionPerformance[]): Promise<PredictionPerformance[]> {
  const subjectsBySymbol = new Map<string, QuoteSubject>();

  for (const row of rows) {
    const subject = quoteSubjectFor(row);
    if (subject) subjectsBySymbol.set(subject.symbol, subject);
  }

  if (subjectsBySymbol.size === 0) return rows;

  const quotes = await getQuotesFor([...subjectsBySymbol.values()]).catch(() => [] as LiveQuote[]);
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  return rows.map((row) => {
    const key = quoteKey(row);
    return withLiveQuote(row, key ? bySymbol.get(key) : undefined);
  });
}

function rowForPick(map: Map<string, BseJoinedRow>, pick: { symbol: string; bseCode: string | null }) {
  return map.get(cleanSymbol(pick.symbol)) ?? map.get(cleanSymbol(pick.bseCode)) ?? null;
}

function toPerformance(
  input: {
    symbol: string;
    stockName: string;
    bseCode: string | null;
    sector?: string;
    capTier?: BseCapTier | null;
    confidence?: number;
    reason?: string;
    positiveNewsSignals?: string[];
    sources?: PredictionSourceLink[];
  },
  row: BseJoinedRow | null,
  rank: number,
): PredictionPerformance {
  return {
    symbol: cleanSymbol(row?.ticker) || cleanSymbol(input.symbol),
    stockName: row?.name || input.stockName,
    bseCode: row?.code ?? input.bseCode,
    sector: row ? sectorFor(row) : input.sector ?? sectorFor({ symbol: input.symbol, bseCode: input.bseCode }),
    capTier: row ? capTierFor(row) : input.capTier ?? capTierFor({ symbol: input.symbol, bseCode: input.bseCode }),
    rank,
    price: row?.price ?? null,
    previousClose: row?.previousClose ?? null,
    change: row?.change ?? null,
    changePercent: row?.changePercent ?? null,
    dayHigh: row?.dayHigh ?? null,
    dayLow: row?.dayLow ?? null,
    volume: row?.volume ?? null,
    turnoverCr: row?.turnoverCr ?? null,
    live: false,
    asOf: null,
    priceSource: "BSE Bhavcopy",
    confidence: input.confidence,
    reason: input.reason,
    positiveNewsSignals: input.positiveNewsSignals,
    sources: input.sources,
    matchedActualRank: null,
    rankDifference: null,
  };
}

export function calculateAccuracy(
  predicted: readonly { symbol: string; bseCode: string | null; rank: number }[],
  actual: readonly { symbol: string; bseCode: string | null; rank: number }[],
): { rows: { matchedActualRank: number | null; rankDifference: number | null }[]; summary: AccuracySummary } {
  const actualRanks = new Map<string, number>();
  for (const row of actual) {
    for (const id of rowIdentifiers(row)) actualRanks.set(id, row.rank);
  }

  let matched = 0;
  const rows = predicted.map((row) => {
    const actualRank = rowIdentifiers(row).map((id) => actualRanks.get(id)).find((rank) => rank !== undefined) ?? null;
    if (actualRank !== null) matched++;
    return {
      matchedActualRank: actualRank,
      rankDifference: actualRank === null ? null : row.rank - actualRank,
    };
  });

  return {
    rows,
    summary: {
      matched,
      total: PICK_COUNT,
      percent: asPct((matched / PICK_COUNT) * 100),
    },
  };
}

function heuristicPicks(candidates: Candidate[], capTier: BseCapTier): LockedPredictionPick[] {
  return candidates.slice(0, PICK_COUNT).map((candidate) => ({
    symbol: candidate.symbol,
    stockName: candidate.stockName,
    bseCode: candidate.bseCode,
    sector: candidate.sector,
    capTier: candidate.capTier ?? capTier,
    confidence: Math.max(55, Math.min(88, Math.round(candidate.score))),
    reason:
      candidate.headlines.length > 0
        ? `Positive pre-open coverage and recent BSE momentum put ${candidate.symbol} near the top of the shortlist.`
        : `No strong pre-open headline matched this stock; fallback ranking used recent BSE momentum.`,
    positiveNewsSignals: candidate.headlines.slice(0, 3).map((headline) => headline.title),
    sources: candidate.headlines.slice(0, 3),
  }));
}

async function buildCandidates(): Promise<Candidate[]> {
  const [news, bseRows] = await Promise.all([
    getMarketNews(null).catch(() => ({ items: [] as NewsItem[] })),
    getBseRows(),
  ]);
  const rows = bseRows.rows;
  const rowMap = buildRowMaps(rows);
  const grouped = new Map<string, Candidate>();

  for (const item of news.items) {
    if (item.sentiment !== "Positive" || !item.symbol) continue;
    const stock = findStock(item.symbol);
    if (!stock) continue;

    const row = rowMap.get(stock.symbol) ?? rowMap.get(stock.scripCode) ?? null;
    const existing = grouped.get(stock.symbol);
    const headline = sourceOf(item);
    if (existing) {
      existing.headlines.push(headline);
      existing.score += 18;
      continue;
    }

    grouped.set(stock.symbol, {
      symbol: stock.symbol,
      stockName: stock.name,
      bseCode: stock.scripCode || row?.code || null,
      sector: stock.sector,
      capTier: row?.capTier ?? stock.capTier ?? null,
      price: row?.price ?? null,
      previousClose: row?.previousClose ?? null,
      changePercent: row?.changePercent ?? null,
      score: 62 + quoteScore(row),
      headlines: [headline],
    });
  }

  const candidates = [...grouped.values()]
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + Math.min(18, candidate.headlines.length * 6),
    }))
    .sort((left, right) => right.score - left.score || (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity));

  const fallbackRows = [...rows]
    .filter((row) => row.price !== null && row.changePercent !== null)
    .sort((left, right) => (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity));

  for (const row of fallbackRows) {
    const symbol = cleanSymbol(row.ticker);
    if (!symbol || grouped.has(symbol)) continue;
    if (candidates.length >= CANDIDATE_COUNT * CAP_TIERS.length) break;
    candidates.push({
      symbol,
      stockName: row.name,
      bseCode: row.code,
      sector: sectorFor(row),
      capTier: row.capTier,
      price: row.price,
      previousClose: row.previousClose,
      changePercent: row.changePercent,
      score: 54 + quoteScore(row),
      headlines: [],
    });
  }

  return candidates;
}

async function aiPicks(candidates: Candidate[], capTier: BseCapTier): Promise<LockedPredictionPick[] | null> {
  if (candidates.length === 0) return null;

  const result = await chatJson({
    feature: "bse-ai-prediction-accuracy",
    system:
      `You pick ten ${capTier} cap BSE-listed Indian stocks most likely to outperform today before the 9:15 AM IST open. ` +
      "Use only the candidate list, its pre-open positive news signals, and recent exchange context supplied by the app. " +
      "Do not invent live prices, returns, headlines, source links, or companies outside the list. " +
      'Return JSON only: {"picks":[{"ticker":"...", "stockName":"...", "bseCode":"...", "confidence":0-100, "reason":"...", "positiveNewsSignals":["..."], "sourceUrls":["..."], "sourceTitles":["..."]}]}',
    user: JSON.stringify(
      candidates.map((candidate) => ({
        ticker: candidate.symbol,
        stockName: candidate.stockName,
        bseCode: candidate.bseCode,
        sector: candidate.sector,
        previousSessionChangePercent: candidate.changePercent,
        positiveNews: candidate.headlines.slice(0, 4),
      })),
    ),
    temperature: 0.2,
    parse: (text) => {
      const parsed = extractJsonObject(text);
      const checked = AiResponseSchema.safeParse(parsed);
      if (!checked.success) return null;

      const bySymbol = new Map(candidates.map((candidate) => [candidate.symbol, candidate]));
      const used = new Set<string>();
      const picks: LockedPredictionPick[] = [];

      for (const item of checked.data.picks) {
        const symbol = cleanSymbol(item.ticker);
        const candidate = bySymbol.get(symbol);
        if (!candidate || used.has(symbol)) continue;
        used.add(symbol);

        picks.push({
          symbol,
          stockName: item.stockName || candidate.stockName,
          bseCode: item.bseCode ?? candidate.bseCode,
          sector: candidate.sector,
          capTier: candidate.capTier ?? capTier,
          confidence: Math.round(item.confidence),
          reason: clip(item.reason, 220),
          positiveNewsSignals:
            item.positiveNewsSignals.length > 0
              ? item.positiveNewsSignals.map((signal) => clip(signal, 120)).slice(0, 4)
              : candidate.headlines.slice(0, 3).map((headline) => headline.title),
          sources:
            item.sourceUrls.length > 0
              ? item.sourceUrls.slice(0, 4).map((url, index) => ({
                  url,
                  title: item.sourceTitles[index] ?? candidate.headlines[index]?.title ?? url,
                  publisher: candidate.headlines[index]?.publisher ?? "Source",
                  publishedAt: candidate.headlines[index]?.publishedAt ?? new Date().toISOString(),
                }))
              : candidate.headlines.slice(0, 4),
        });
      }

      return picks.length === PICK_COUNT ? picks : null;
    },
  });

  return result;
}

async function generateLockedPrediction(now: Date): Promise<LockedPredictionCache | null> {
  const candidates = await buildCandidates();
  const picksByCap = emptyCapRows<LockedPredictionPick>();
  let source: PredictionSource = "ai";

  for (const capTier of CAP_TIERS) {
    const capCandidates = candidates
      .filter((candidate) => candidate.capTier === capTier)
      .slice(0, CANDIDATE_COUNT);
    const generated = await aiPicks(capCandidates, capTier);
    if (!generated) source = "heuristic";
    const picks = generated ?? heuristicPicks(capCandidates, capTier);
    if (picks.length < PICK_COUNT) return null;
    picksByCap[capTier] = picks;
  }

  const cache: LockedPredictionCache = {
    date: tradingDayKey(now),
    generatedAt: now.toISOString(),
    cutoffAt: predictionCutoffAt(tradingDayKey(now)),
    source,
    model: source === "ai" ? aiModel() : null,
    picksByCap,
  };

  await writeJsonCache(CACHE_FILE, cache);
  return cache;
}

async function lockedPrediction(now: Date): Promise<LockedPredictionCache | null> {
  const today = tradingDayKey(now);
  const cached = await readJsonCache<LockedPredictionCache>(CACHE_FILE);
  if (cached?.date === today) {
    if (cached.picksByCap && CAP_TIERS.every((tier) => cached.picksByCap[tier]?.length >= PICK_COUNT)) {
      return {
        ...cached,
        picksByCap: {
          Large: cached.picksByCap.Large.slice(0, PICK_COUNT),
          Mid: cached.picksByCap.Mid.slice(0, PICK_COUNT),
          Small: cached.picksByCap.Small.slice(0, PICK_COUNT),
        },
      };
    }
    if (cached.picks?.length && cached.picks.length >= PICK_COUNT) return null;
  }
  if (!isBeforePredictionCutoff(now)) return null;
  return generateLockedPrediction(now);
}

async function actualTopForCap(capTier: BseCapTier): Promise<{ rows: PredictionPerformance[]; sessionDate: string | null }> {
  const actual = await getBseMovers({
    tier: TIER_QUERY[capTier],
    direction: "gainers",
    period: "1d",
    page: 1,
    pageSize: ACTUAL_POOL_COUNT,
  });

  const pool = actual.rows.map((row, index) =>
    toPerformance({ symbol: row.ticker, stockName: row.name, bseCode: row.code, sector: row.sector ?? undefined, capTier }, row, index + 1),
  );
  const rows = (await attachLiveQuotes(pool))
    .sort((left, right) => {
      const liveDiff = Number(right.live) - Number(left.live);
      if (liveDiff !== 0) return liveDiff;
      return (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity);
    })
    .slice(0, PICK_COUNT)
    .map((row, index) => ({ ...row, rank: index + 1, capTier }));

  return { rows, sessionDate: actual.sessionDate };
}

function sessionSnapshotMessage(snapshotDate: string, currentDate: string): string {
  if (snapshotDate === currentDate) {
    return `Market is closed for ${snapshotDate}. Showing the persisted 3:30 PM IST accuracy snapshot until the next live session starts.`;
  }
  return `Showing the persisted ${snapshotDate} market-close accuracy snapshot until the next pre-open AI lock is generated.`;
}

async function readSessionSnapshot(currentDate: string): Promise<BseAiPredictionAccuracy | null> {
  const snapshot = await readJsonCache<BseAiPredictionAccuracy>(SESSION_SNAPSHOT_FILE);
  if (!snapshot || snapshot.status !== "locked" || !snapshot.date) return null;

  return {
    ...snapshot,
    message: sessionSnapshotMessage(snapshot.date, currentDate),
    marketCloseAt: snapshot.marketCloseAt ?? marketCloseAt(snapshot.date),
    persistedSession: true,
    persistedAt: snapshot.persistedAt ?? snapshot.asOf,
  };
}

async function persistSessionSnapshot(report: BseAiPredictionAccuracy, now: Date): Promise<BseAiPredictionAccuracy> {
  const snapshot: BseAiPredictionAccuracy = {
    ...report,
    message: sessionSnapshotMessage(report.date, report.date),
    marketCloseAt: report.marketCloseAt ?? marketCloseAt(report.date),
    persistedSession: true,
    persistedAt: now.toISOString(),
    asOf: report.asOf,
  };

  await writeJsonCache(SESSION_SNAPSHOT_FILE, snapshot);
  return snapshot;
}

export async function getBseAiPredictionAccuracy(now = new Date()): Promise<BseAiPredictionAccuracy> {
  const date = tradingDayKey(now);
  const cutoffAt = predictionCutoffAt(date);
  const marketClose = marketCloseAt(date);
  const locked = await lockedPrediction(now);

  if (!locked) {
    const snapshot = await readSessionSnapshot(date);
    if (snapshot) return snapshot;

    const [rows, actualLarge, actualMid, actualSmall] = await Promise.all([
      getBseRows(),
      actualTopForCap("Large"),
      actualTopForCap("Mid"),
      actualTopForCap("Small"),
    ]);

    const actualTopByCap = { Large: actualLarge.rows, Mid: actualMid.rows, Small: actualSmall.rows };

    return {
      status: "not-generated",
      date,
      cutoffAt,
      marketCloseAt: marketClose,
      generatedAt: null,
      source: null,
      model: null,
      message: `No locked AI prediction was generated before 9:15 AM IST for ${date}.`,
      predictionsByCap: emptyCapRows<PredictionPerformance>(),
      actualTopByCap,
      accuracyByCap: emptyCapAccuracy(),
      predictions: [],
      actualTop: actualTopByCap.Large,
      accuracy: { matched: 0, total: PICK_COUNT, percent: 0 },
      sessionDate: actualLarge.sessionDate ?? actualMid.sessionDate ?? actualSmall.sessionDate ?? rows.sessionDate,
      asOf: now.toISOString(),
      persistedSession: false,
      persistedAt: null,
    };
  }

  const [rows, actualLarge, actualMid, actualSmall] = await Promise.all([
    getBseRows(),
    actualTopForCap("Large"),
    actualTopForCap("Mid"),
    actualTopForCap("Small"),
  ]);

  const rowMap = buildRowMaps(rows.rows);
  const actualTopByCap = { Large: actualLarge.rows, Mid: actualMid.rows, Small: actualSmall.rows };

  const predictionsByCap = emptyCapRows<PredictionPerformance>();
  const accuracyByCap = emptyCapAccuracy();

  for (const capTier of CAP_TIERS) {
    const base = locked.picksByCap[capTier].map((pick, index) => toPerformance(pick, rowForPick(rowMap, pick), index + 1));
    const liveRows = await attachLiveQuotes(base);
    const scored = calculateAccuracy(liveRows, actualTopByCap[capTier]);
    predictionsByCap[capTier] = liveRows.map((row, index) => ({
      ...row,
      capTier,
      matchedActualRank: scored.rows[index].matchedActualRank,
      rankDifference: scored.rows[index].rankDifference,
    }));
    accuracyByCap[capTier] = scored.summary;
  }

  const overallMatched = CAP_TIERS.reduce((total, tier) => total + accuracyByCap[tier].matched, 0);
  const overallTotal = CAP_TIERS.length * PICK_COUNT;

  const report: BseAiPredictionAccuracy = {
    status: "locked",
    date,
    cutoffAt: locked.cutoffAt,
    marketCloseAt: marketClose,
    generatedAt: locked.generatedAt,
    source: locked.source,
    model: locked.model,
    message: `AI picks were locked before the 9:15 AM IST market open and will not be recalculated today.`,
    predictionsByCap,
    actualTopByCap,
    accuracyByCap,
    predictions: predictionsByCap.Large,
    actualTop: actualTopByCap.Large,
    accuracy: { matched: overallMatched, total: overallTotal, percent: asPct((overallMatched / overallTotal) * 100) },
    sessionDate: actualLarge.sessionDate ?? actualMid.sessionDate ?? actualSmall.sessionDate ?? rows.sessionDate,
    asOf: now.toISOString(),
    persistedSession: false,
    persistedAt: null,
  };

  if (isAfterMarketClose(now)) return persistSessionSnapshot(report, now);
  return report;
}
