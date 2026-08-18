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

/**
 * The daily cycle this module runs on, in IST:
 *
 *   08:50  the AI reads the morning's positive coverage and locks ten stocks per cap tier
 *   09:15  the exchange opens; the locked list stops changing and only prices refresh
 *   15:30  the exchange closes; the day's accuracy is frozen into a session snapshot
 *
 * Between 15:30 and the next 08:50 the previous list is *held*, not cleared: replacing it is what
 * the 08:50 run is for, so until that run happens the page keeps showing the picks it locked last.
 */
const PREDICTION_LOCK_TIME = "08:50";
const MARKET_OPEN_TIME = "09:15";
const MARKET_CLOSE_TIME = "15:30";
/** How far ahead of 8:50 a scheduled run may fire and still be treated as that day's lock. */
const SCHEDULE_GRACE_MS = 5 * 60_000;

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
  generatedAfterCutoff?: boolean;
  picksByCap: Record<BseCapTier, LockedPredictionPick[]>;
  /** Kept so an older cache file still reads without crashing. */
  picks?: LockedPredictionPick[];
};

/** A locked list plus whether it belongs to today or is yesterday's, still being held. */
type ActiveLock = LockedPredictionCache & { holdover: boolean };

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

/** Where the BSE day stands right now, which is what the live board's wording depends on. */
export type MarketSessionState = "pre-open" | "live" | "closed" | "holiday";

/**
 * Today's AI marked against today's market, for one cap tier.
 *
 * Every number is derived from the two lists the page already shows — the 8:50 lock on one side,
 * the live top ten on the other — so the score a reader sees is one they could recompute from the
 * rows in front of them. Nothing here is an opinion, and nothing carries over from yesterday.
 */
export type CapScorecard = {
  /** Locked picks that are in the live top ten right now. */
  hitCount: number;
  hitRate: number;
  /** How close the matched picks landed to the rank the AI gave them, 0-100. */
  rankAccuracy: number;
  avgPickMovePercent: number;
  avgMarketMovePercent: number;
  /** Pick average minus market average, in percentage points: the AI's edge, or its cost. */
  edgePercent: number;
  beatMarketCount: number;
  avgConfidence: number;
  /** 100 when stated confidence matches the hit rate it actually delivered. */
  confidenceCalibration: number;
  /** Share of the ten slots that are locked and being held, 0-100. */
  lockIntegrity: number;
  /** The blend the cards headline: hit rate, rank accuracy, calibration and edge. */
  intelligenceScore: number;
};

export type PredictionScorecard = {
  byCap: Record<BseCapTier, CapScorecard>;
  overall: CapScorecard;
};

export type BseAiPredictionAccuracy = {
  status: PredictionStatus;
  date: string;
  /** The trading day the locked list belongs to, which is `date` unless a previous list is held. */
  lockDate: string | null;
  /** 8:50 AM IST of `lockDate`: when this list was, or was due to be, locked. */
  lockAt: string | null;
  /** 8:50 AM IST of the next trading day whose list has not been locked yet. */
  nextLockAt: string;
  /** True while yesterday's locked list is being held because today's 8:50 run has not run yet. */
  holdover: boolean;
  cutoffAt: string;
  marketCloseAt: string;
  generatedAt: string | null;
  source: PredictionSource | null;
  model: string | null;
  message: string;
  marketSession: MarketSessionState;
  scorecard: PredictionScorecard;
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

function istInstant(day: string, time: string): string {
  return `${day}T${time}:00+05:30`;
}

/** 8:50 AM IST — when the AI locks the ten picks for `day`, 25 minutes before the open. */
export function predictionLockAt(day = tradingDayKey()): string {
  return istInstant(day, PREDICTION_LOCK_TIME);
}

export function predictionCutoffAt(day = tradingDayKey()): string {
  return istInstant(day, MARKET_OPEN_TIME);
}

export function marketCloseAt(day = tradingDayKey()): string {
  return istInstant(day, MARKET_CLOSE_TIME);
}

export function isBeforePredictionCutoff(now = new Date()): boolean {
  return now.getTime() < new Date(predictionCutoffAt(tradingDayKey(now))).getTime();
}

/** Before 8:50 AM IST the day's list does not exist yet, so the previous one stays on screen. */
export function isBeforePredictionLock(now = new Date()): boolean {
  return now.getTime() < new Date(predictionLockAt(tradingDayKey(now))).getTime();
}

export function isAfterMarketClose(now = new Date()): boolean {
  return now.getTime() >= new Date(marketCloseAt(tradingDayKey(now))).getTime();
}

/**
 * Exchange holidays, as `YYYY-MM-DD` in `BSE_MARKET_HOLIDAYS`.
 *
 * Unset, only weekends are skipped — which is the safe direction to be wrong in: a run on a
 * holiday locks a list nobody trades against and the next real session replaces it anyway,
 * whereas skipping a real session would leave the page holding a stale list all day.
 */
function marketHolidays(): Set<string> {
  return new Set(
    (process.env.BSE_MARKET_HOLIDAYS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function isTradingDay(day: string): boolean {
  // Noon IST rather than midnight: midnight IST is the *previous* date in UTC, and `getUTCDay`
  // would then report the wrong weekday for every single day.
  const weekday = new Date(istInstant(day, "12:00")).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !marketHolidays().has(day);
}

function addDays(day: string, count: number): string {
  const at = new Date(istInstant(day, "12:00"));
  at.setUTCDate(at.getUTCDate() + count);
  return tradingDayKey(at);
}

/** The next 8:50 AM IST lock still ahead of `now`, skipping weekends and configured holidays. */
export function nextPredictionLockAt(now = new Date()): string {
  const today = tradingDayKey(now);
  if (isTradingDay(today) && now.getTime() < new Date(predictionLockAt(today)).getTime()) {
    return predictionLockAt(today);
  }

  // A fortnight is longer than any BSE closure, so this always terminates on a real session.
  for (let ahead = 1; ahead <= 14; ahead++) {
    const day = addDays(today, ahead);
    if (isTradingDay(day)) return predictionLockAt(day);
  }
  return predictionLockAt(addDays(today, 1));
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

export function marketSessionState(now = new Date()): MarketSessionState {
  const day = tradingDayKey(now);
  if (!isTradingDay(day)) return "holiday";
  if (isBeforePredictionCutoff(now)) return "pre-open";
  if (isAfterMarketClose(now)) return "closed";
  return "live";
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function moves(rows: readonly PredictionPerformance[]): number[] {
  return rows.map((row) => row.changePercent).filter((value): value is number => typeof value === "number");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const EMPTY_SCORECARD: CapScorecard = {
  hitCount: 0,
  hitRate: 0,
  rankAccuracy: 0,
  avgPickMovePercent: 0,
  avgMarketMovePercent: 0,
  edgePercent: 0,
  beatMarketCount: 0,
  avgConfidence: 0,
  confidenceCalibration: 0,
  lockIntegrity: 0,
  intelligenceScore: 0,
};

/**
 * Marks one cap tier's locked picks against the live top ten of the same tier.
 *
 * The headline blend weights being *in* the top ten above everything else, because that is the
 * claim the section makes; rank precision, honest confidence and the size of the edge are each
 * worth less on their own but separate two engines with the same hit rate.
 */
export function scoreCap(
  predicted: readonly PredictionPerformance[],
  actual: readonly PredictionPerformance[],
  expected = PICK_COUNT,
): CapScorecard {
  if (predicted.length === 0) return { ...EMPTY_SCORECARD, avgMarketMovePercent: round1(mean(moves(actual))) };

  const matched = predicted.filter((row) => row.matchedActualRank !== null);
  const hitCount = matched.length;
  const hitRate = asPct((hitCount / predicted.length) * 100);

  // A pick the AI ranked #1 that came in #1 scores 100; one that came in #10 scores less, and a
  // miss contributes nothing rather than dragging the average of the picks that did land.
  const spread = Math.max(1, predicted.length - 1);
  const rankAccuracy = hitCount === 0 ? 0 : asPct(mean(matched.map((row) => 1 - Math.abs(row.rankDifference ?? 0) / spread)) * 100);

  const pickMoves = moves(predicted);
  const marketMoves = moves(actual);
  const avgPickMovePercent = round1(mean(pickMoves));
  const avgMarketMovePercent = round1(mean(marketMoves));
  const edgePercent = round1(avgPickMovePercent - avgMarketMovePercent);
  const beatMarketCount = pickMoves.filter((value) => value >= avgMarketMovePercent).length;

  const confidences = predicted.map((row) => row.confidence).filter((value): value is number => typeof value === "number");
  const avgConfidence = asPct(mean(confidences));
  // Confidence is only worth anything if it is honest: a 90% claim delivering 30% is penalised
  // exactly as hard as a 30% claim delivering 90%.
  const confidenceCalibration = confidences.length === 0 ? 0 : asPct(clamp(100 - Math.abs(avgConfidence - hitRate), 0, 100));

  const lockIntegrity = asPct(clamp((predicted.length / expected) * 100, 0, 100));
  // One percentage point of edge moves the edge component by ten, so a realistic day's edge of a
  // point or two reads as a visible difference rather than a rounding error.
  const edgeScore = clamp(50 + edgePercent * 10, 0, 100);
  const intelligenceScore = asPct(hitRate * 0.5 + rankAccuracy * 0.2 + confidenceCalibration * 0.15 + edgeScore * 0.15);

  return {
    hitCount,
    hitRate,
    rankAccuracy,
    avgPickMovePercent,
    avgMarketMovePercent,
    edgePercent,
    beatMarketCount,
    avgConfidence,
    confidenceCalibration,
    lockIntegrity,
    intelligenceScore,
  };
}

export function buildScorecard(
  predictionsByCap: Record<BseCapTier, PredictionPerformance[]>,
  actualTopByCap: Record<BseCapTier, PredictionPerformance[]>,
): PredictionScorecard {
  const byCap = {
    Large: scoreCap(predictionsByCap.Large, actualTopByCap.Large),
    Mid: scoreCap(predictionsByCap.Mid, actualTopByCap.Mid),
    Small: scoreCap(predictionsByCap.Small, actualTopByCap.Small),
  };

  return {
    byCap,
    overall: scoreCap(
      CAP_TIERS.flatMap((tier) => predictionsByCap[tier]),
      CAP_TIERS.flatMap((tier) => actualTopByCap[tier]),
      PICK_COUNT * CAP_TIERS.length,
    ),
  };
}

function emptyScorecard(actualTopByCap: Record<BseCapTier, PredictionPerformance[]>): PredictionScorecard {
  return buildScorecard(emptyCapRows<PredictionPerformance>(), actualTopByCap);
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

  /**
   * Top the shortlist up per cap tier, not against one global budget.
   *
   * This loop used to stop as soon as the combined list reached `CANDIDATE_COUNT * CAP_TIERS`,
   * drawing from every tier's rows sorted together by change. That reads as "the 90 best movers"
   * and behaves that way right up until a session whose biggest movers all sit in one tier: the
   * budget is spent before the other two are reached, they arrive at `generateLockedPrediction`
   * under the ten picks it needs, and that function discards *every* tier and returns null. The
   * visible result was a landing page still showing the previous day's stocks, all day, behind a
   * message about the snapshot being held until the next lock is generated.
   *
   * Counting per tier removes the interaction entirely: a thin tier can no longer be crowded out
   * by a busy one, because they no longer draw on the same budget. News-derived candidates already
   * in the list count toward their tier, so a tier that news filled needs no topping up.
   *
   * Rows with no cap tier are skipped rather than added: they can never satisfy the per-tier
   * filter downstream, so including them only spends a slot that a usable row needed.
   */
  const perTier = new Map<BseCapTier, number>(CAP_TIERS.map((tier) => [tier, 0]));
  for (const candidate of candidates) {
    if (candidate.capTier) perTier.set(candidate.capTier, (perTier.get(candidate.capTier) ?? 0) + 1);
  }
  const tierFull = (tier: BseCapTier) => (perTier.get(tier) ?? 0) >= CANDIDATE_COUNT;

  for (const row of fallbackRows) {
    if (CAP_TIERS.every(tierFull)) break;

    const symbol = cleanSymbol(row.ticker);
    const capTier = row.capTier;
    if (!symbol || !capTier || grouped.has(symbol) || tierFull(capTier)) continue;

    perTier.set(capTier, (perTier.get(capTier) ?? 0) + 1);
    candidates.push({
      symbol,
      stockName: row.name,
      bseCode: row.code,
      sector: sectorFor(row),
      capTier,
      price: row.price,
      previousClose: row.previousClose,
      changePercent: row.changePercent,
      score: 54 + quoteScore(row),
      headlines: [],
    });
  }

  return candidates;
}

async function buildMarketCandidates(): Promise<Candidate[]> {
  const bseRows = await getBseRows();
  return bseRows.rows
    .filter((row) => row.price !== null && row.changePercent !== null)
    .sort((left, right) => (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity))
    .map((row) => ({
      symbol: cleanSymbol(row.ticker),
      stockName: row.name,
      bseCode: row.code,
      sector: sectorFor(row),
      capTier: row.capTier,
      price: row.price,
      previousClose: row.previousClose,
      changePercent: row.changePercent,
      score: 54 + quoteScore(row),
      headlines: [],
    }));
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

/**
 * The outcome of one generation attempt.
 *
 * A failure names the tier that came up short and how many candidates it had, because the failure
 * is silent from the outside: the caller falls back to the previous day's list, which looks exactly
 * like a day nobody ran the lock on. Reporting the tier is the difference between "it did not
 * generate" and "Small had four candidates".
 */
type LockAttempt =
  | { ok: true; cache: LockedPredictionCache }
  | { ok: false; shortTier: BseCapTier; available: number };

async function generateLockedPrediction(now: Date): Promise<LockAttempt> {
  const generatedAfterCutoff = !isBeforePredictionCutoff(now);
  const candidates = generatedAfterCutoff ? await buildMarketCandidates() : await buildCandidates();
  const picksByCap = emptyCapRows<LockedPredictionPick>();
  let source: PredictionSource = generatedAfterCutoff ? "heuristic" : "ai";

  for (const capTier of CAP_TIERS) {
    const capCandidates = candidates
      .filter((candidate) => candidate.capTier === capTier)
      .slice(0, CANDIDATE_COUNT);
    const generated = generatedAfterCutoff ? null : await aiPicks(capCandidates, capTier);
    if (!generated) source = "heuristic";
    const picks = generated ?? heuristicPicks(capCandidates, capTier);
    if (picks.length < PICK_COUNT) return { ok: false, shortTier: capTier, available: capCandidates.length };
    picksByCap[capTier] = picks;
  }

  const cache: LockedPredictionCache = {
    date: tradingDayKey(now),
    generatedAt: now.toISOString(),
    cutoffAt: predictionCutoffAt(tradingDayKey(now)),
    source,
    model: source === "ai" ? aiModel() : null,
    generatedAfterCutoff,
    picksByCap,
  };

  await writeJsonCache(CACHE_FILE, cache);
  return { ok: true, cache };
}

function canGenerateLock(now: Date): boolean {
  return !isAfterMarketClose(now);
}

/** A stored lock in today's shape, or null when the file is absent, partial or pre-cap-tier. */
function usableCache(cached: LockedPredictionCache | null): LockedPredictionCache | null {
  if (!cached?.date) return null;

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

  if (cached.picks?.length && cached.picks.length >= PICK_COUNT) {
    return {
      ...cached,
      picksByCap: { Large: cached.picks.slice(0, PICK_COUNT), Mid: [], Small: [] },
    };
  }

  return null;
}

function heldOver(cached: LockedPredictionCache | null): ActiveLock | null {
  return cached ? { ...cached, holdover: true } : null;
}

/**
 * The ten picks per cap tier that today's page should show.
 *
 * Reading is never allowed to *replace* a list outside the 8:50 window — that is the whole point
 * of the lock. Before 8:50, and on a day the exchange is shut, the previous list is handed back
 * unchanged and flagged as held; only from 8:50 until the 3:30 close will a missing list be
 * generated, which also covers a deployment whose scheduled run never fired.
 */
async function lockedPrediction(now: Date): Promise<ActiveLock | null> {
  const today = tradingDayKey(now);
  const cached = usableCache(await readJsonCache<LockedPredictionCache>(CACHE_FILE));
  if (cached?.date === today) return { ...cached, holdover: false };

  if (isBeforePredictionLock(now) || !isTradingDay(today) || !canGenerateLock(now)) return heldOver(cached);

  const attempt = await generateLockedPrediction(now);
  return attempt.ok ? { ...attempt.cache, holdover: false } : heldOver(cached);
}

export type PredictionLockAction =
  | "generated"
  | "already-locked"
  | "skipped-holiday"
  | "skipped-early"
  | "skipped-closed"
  | "failed";

export type PredictionLockRun = {
  ok: boolean;
  action: PredictionLockAction;
  date: string;
  lockAt: string;
  nextLockAt: string;
  tradingDay: boolean;
  source: PredictionSource | null;
  model: string | null;
  generatedAt: string | null;
  picks: Record<BseCapTier, number>;
  message: string;
};

function pickCounts(cache: LockedPredictionCache | null): Record<BseCapTier, number> {
  return {
    Large: cache?.picksByCap?.Large?.length ?? 0,
    Mid: cache?.picksByCap?.Mid?.length ?? 0,
    Small: cache?.picksByCap?.Small?.length ?? 0,
  };
}

/**
 * The 8:50 AM IST run: locks today's ten picks per cap tier, replacing yesterday's.
 *
 * Called by the scheduler (`/api/cron/ai-locked-picks`) rather than by a page, so that the list is
 * ready before the first visitor of the day arrives instead of being generated by whoever happens
 * to load the page first. Idempotent — a second call on a day that is already locked reports
 * `already-locked` and leaves the list alone, which is what makes retries and overlapping
 * schedules safe. `force` is the manual override an admin uses to re-lock deliberately.
 */
export async function runDailyPredictionLock(
  now = new Date(),
  options: { force?: boolean } = {},
): Promise<PredictionLockRun> {
  const date = tradingDayKey(now);
  const force = options.force === true;
  const existing = usableCache(await readJsonCache<LockedPredictionCache>(CACHE_FILE));
  const base = {
    date,
    lockAt: predictionLockAt(date),
    nextLockAt: nextPredictionLockAt(now),
    tradingDay: isTradingDay(date),
  };
  const held = {
    ...base,
    source: existing?.source ?? null,
    model: existing?.model ?? null,
    generatedAt: existing?.generatedAt ?? null,
    picks: pickCounts(existing),
  };

  if (existing?.date === date && !force) {
    return { ...held, ok: true, action: "already-locked", message: `Today's ${date} picks are already locked.` };
  }

  if (!base.tradingDay && !force) {
    return {
      ...held,
      ok: true,
      action: "skipped-holiday",
      message: `${date} is not a BSE trading day. Holding the ${existing?.date ?? "previous"} picks.`,
    };
  }

  // A scheduler that fires a minute early should still lock the day rather than skip it and leave
  // the morning without a list, so the run — unlike a page load — is allowed a few minutes of
  // slack. It stays comfortably ahead of the 9:15 open either way.
  const earliest = new Date(base.lockAt).getTime() - SCHEDULE_GRACE_MS;
  if (now.getTime() < earliest && !force) {
    return { ...held, ok: true, action: "skipped-early", message: `The 8:50 AM IST lock for ${date} has not come round yet.` };
  }

  if (isAfterMarketClose(now) && !force) {
    return { ...held, ok: true, action: "skipped-closed", message: `The ${date} session has already closed; no list will be locked for it.` };
  }

  const attempt = await generateLockedPrediction(now);
  if (!attempt.ok) {
    return {
      ...held,
      ok: false,
      action: "failed",
      message:
        `Could not assemble ${PICK_COUNT} picks for the ${attempt.shortTier} cap tier for ${date}: ` +
        `only ${attempt.available} candidates were available. The previous list is still being shown.`,
    };
  }

  const generated = attempt.cache;
  return {
    ...base,
    ok: true,
    action: "generated",
    source: generated.source,
    model: generated.model,
    generatedAt: generated.generatedAt,
    picks: pickCounts(generated),
    message: `Locked ${PICK_COUNT} picks per cap tier for ${date}, replacing the previous list.`,
  };
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

async function readSessionSnapshot(currentDate: string, now: Date): Promise<BseAiPredictionAccuracy | null> {
  const snapshot = await readJsonCache<BseAiPredictionAccuracy>(SESSION_SNAPSHOT_FILE);
  if (!snapshot || snapshot.status !== "locked" || !snapshot.date) return null;

  return {
    ...snapshot,
    message: sessionSnapshotMessage(snapshot.date, currentDate),
    marketCloseAt: snapshot.marketCloseAt ?? marketCloseAt(snapshot.date),
    // Older snapshot files predate these fields, so they are derived rather than trusted.
    lockDate: snapshot.lockDate ?? snapshot.date,
    lockAt: snapshot.lockAt ?? predictionLockAt(snapshot.date),
    nextLockAt: nextPredictionLockAt(now),
    holdover: snapshot.date !== currentDate,
    // The session is where the clock says it is now, not where it was when this was frozen.
    marketSession: marketSessionState(now),
    scorecard: snapshot.scorecard ?? buildScorecard(snapshot.predictionsByCap, snapshot.actualTopByCap),
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
  const nextLockAt = nextPredictionLockAt(now);
  const locked = await lockedPrediction(now);

  // With no list for today — either none was ever locked, or the previous one is being held until
  // 8:50 — the frozen close snapshot is the better answer, because it carries the accuracy that
  // session finished on rather than yesterday's picks scored against a market that has not opened.
  if (!locked || locked.holdover) {
    const snapshot = await readSessionSnapshot(date, now);
    if (snapshot && (!locked || snapshot.date === locked.date)) return snapshot;
  }

  if (!locked) {
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
      lockDate: null,
      lockAt: null,
      nextLockAt,
      holdover: false,
      cutoffAt,
      marketCloseAt: marketClose,
      generatedAt: null,
      source: null,
      model: null,
      message: `No locked AI prediction was generated at 8:50 AM IST for ${date}.`,
      marketSession: marketSessionState(now),
      scorecard: emptyScorecard(actualTopByCap),
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
    lockDate: locked.date,
    lockAt: predictionLockAt(locked.date),
    nextLockAt,
    holdover: locked.holdover,
    cutoffAt: locked.cutoffAt,
    marketCloseAt: marketClose,
    generatedAt: locked.generatedAt,
    source: locked.source,
    model: locked.model,
    message: locked.holdover
      ? `Holding the ${locked.date} locked picks. The AI replaces all 10 per cap tier at the next 8:50 AM IST lock, before the 9:15 AM open.`
      : locked.generatedAfterCutoff
        ? `AI picks were initialized after the 9:15 AM IST open because the 8:50 AM lock did not run. The list will not be recalculated today.`
        : `AI picks were locked at 8:50 AM IST, before the 9:15 AM market open, and will not be recalculated today.`,
    marketSession: marketSessionState(now),
    scorecard: buildScorecard(predictionsByCap, actualTopByCap),
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

  // A held list has no session of its own to freeze — snapshotting it would overwrite the real
  // close snapshot of the day it was locked for with a weekend's worth of unchanged prices.
  if (isAfterMarketClose(now) && !locked.holdover) return persistSessionSnapshot(report, now);
  return report;
}
