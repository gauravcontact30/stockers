import { indianStocks, type CapTier } from "./indian-stocks";
import { indianETFs } from "./indian-etfs";
import { CACHE_TAGS, revalidatingBy } from "./cache";
import { getQuotesFor, mapWithConcurrency } from "./market-data";

export type PerformanceSummary = {
  symbol: string;
  name: string | null;
  assetType: "stock" | "etf" | "unknown";
  capTier: CapTier | null;
  currency: string;
  /** Last traded price — the stock's actual market value right now. */
  price: number | null;
  previousClose: number | null;
  change: number | null;
  oneDay: number | null;
  oneWeek: number | null;
  oneMonth: number | null;
  threeMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
  overall: number | null;
  /** ISO date of the earliest close "overall" is measured from, so the number can be labelled honestly. */
  overallSince: string | null;
  live: boolean;
  asOf: string | null;
  source: string;
};

const SOURCE = "Yahoo Finance";

// The live price comes from the shared 60s quote cache, so returns only need the historical
// anchor closes — which change once per trading session. Caching them for the IST day (with a
// safety TTL) keeps every card's returns fresh against the live price for the cost of one
// history fetch per symbol per day.
const ANCHOR_TTL_MS = 6 * 60 * 60_000;
const HISTORY_CONCURRENCY = 6;

type PeriodKey = "oneWeek" | "oneMonth" | "threeMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear";

type Anchors = {
  name: string | null;
  currency: string;
  closes: Record<PeriodKey, number | null>;
  inceptionClose: number | null;
  inceptionDate: string | null;
};

type AnchorEntry = { date: string; data: Anchors; expiresAt: number };

const anchorCache = new Map<string, AnchorEntry>();

type ResolvedMeta = { yahooSymbol: string; name: string | null; assetType: PerformanceSummary["assetType"]; capTier: CapTier | null };

// The AI report can be opened for any symbol in our curated universe (stock or ETF); fall
// back to the standard NSE suffix — with an unknown asset type and no cap tier — so an
// unrecognized symbol still resolves to something instead of failing outright.
export function resolveMeta(symbol: string): ResolvedMeta {
  const stock = indianStocks.find((s) => s.symbol === symbol);
  if (stock) return { yahooSymbol: stock.yahooSymbol, name: stock.name, assetType: "stock", capTier: stock.capTier };

  const etf = indianETFs.find((e) => e.symbol === symbol);
  if (etf) return { yahooSymbol: etf.yahooSymbol, name: etf.name, assetType: "etf", capTier: null };

  return { yahooSymbol: `${symbol}.NS`, name: null, assetType: "unknown", capTier: null };
}

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function emptyAnchors(): Anchors {
  return {
    name: null,
    currency: "INR",
    closes: { oneWeek: null, oneMonth: null, threeMonth: null, sixMonth: null, oneYear: null, threeYear: null, fiveYear: null },
    inceptionClose: null,
    inceptionDate: null,
  };
}

async function fetchChart(yahooSymbol: string, query: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${query}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(10000),
      // Revalidated rather than `no-store`, and the difference is worth a paragraph because it is
      // not really about this fetch.
      //
      // `no-store` inside a render marks the *whole route* dynamic. The landing page calls this on
      // the server for its hero, so one flag here was what made `/` server-rendered on demand —
      // measured at 665ms to first byte against 18ms for the statically prerendered `/news`, and
      // that whole delay sits in front of the largest contentful paint.
      //
      // Nothing is lost by caching it. What this reads is a chart of *historical anchor closes* —
      // where the price stood a week, a month, a year ago — which do not change during a session,
      // and `getCachedPerformanceSummary` already fronts it with a five-minute application cache.
      // The window here matches that cache rather than undercutting it. Live prices come from
      // `/api/market/live`, which is a different path and still uncached.
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps: unknown = result?.timestamp;
    const closes: unknown = result?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;

    return { meta: result?.meta ?? {}, timestamps: timestamps as number[], closes: closes as (number | null)[] };
  } catch {
    return null;
  }
}

// Yahoo leaves gaps (nulls) on halted sessions, so "the close at date X" means the most recent
// real close at or before X. A trailing scan backwards from the anchor index skips those gaps.
function closeAtOrBefore(timestamps: number[], closes: (number | null)[], targetSec: number): number | null {
  let index = -1;
  let low = 0;
  let high = timestamps.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timestamps[mid] <= targetSec) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Target predates the symbol's listing (or its first bar in this window) — no honest number
  // exists for that period. A few days of slack absorbs the case where the requested lookback
  // lands on a weekend or holiday just before the first available bar.
  const SLACK_SEC = 10 * 24 * 3600;
  if (index === -1) {
    if (timestamps.length > 0 && timestamps[0] - targetSec <= SLACK_SEC) index = 0;
    else return null;
  }

  for (let i = index; i >= 0; i--) {
    const close = closes[i];
    if (typeof close === "number" && close > 0) return close;
  }
  return null;
}

function shiftDays(days: number): number {
  return Math.floor((Date.now() - days * 24 * 3600 * 1000) / 1000);
}

function shiftMonths(months: number): number {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return Math.floor(date.getTime() / 1000);
}

function shiftYears(years: number): number {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return Math.floor(date.getTime() / 1000);
}

// Two chart calls per symbol cover every period on the card: one daily series spanning just
// over five years (from which each trailing anchor close is read by date), and one monthly
// series over the full listed history for the "overall" figure.
async function fetchAnchors(yahooSymbol: string): Promise<Anchors> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fiveYearsPlusSec = shiftDays(5 * 365 + 30);

  const [daily, full] = await Promise.all([
    fetchChart(yahooSymbol, `interval=1d&period1=${fiveYearsPlusSec}&period2=${nowSec}`),
    fetchChart(yahooSymbol, "interval=1mo&range=max"),
  ]);

  if (!daily) return emptyAnchors();

  const { timestamps, closes, meta } = daily;
  const at = (targetSec: number) => closeAtOrBefore(timestamps, closes, targetSec);

  let inceptionClose: number | null = null;
  let inceptionDate: string | null = null;
  if (full) {
    const firstIndex = full.closes.findIndex((c) => typeof c === "number" && c > 0);
    if (firstIndex !== -1) {
      inceptionClose = full.closes[firstIndex] as number;
      inceptionDate = new Date(full.timestamps[firstIndex] * 1000).toISOString().slice(0, 10);
    }
  }

  return {
    name: typeof meta.longName === "string" ? meta.longName : typeof meta.shortName === "string" ? meta.shortName : null,
    currency: typeof meta.currency === "string" ? meta.currency : "INR",
    closes: {
      oneWeek: at(shiftDays(7)),
      oneMonth: at(shiftMonths(1)),
      threeMonth: at(shiftMonths(3)),
      sixMonth: at(shiftMonths(6)),
      oneYear: at(shiftYears(1)),
      threeYear: at(shiftYears(3)),
      fiveYear: at(shiftYears(5)),
    },
    inceptionClose,
    inceptionDate,
  };
}

async function getAnchors(yahooSymbol: string): Promise<Anchors> {
  const today = todayIST();
  const cached = anchorCache.get(yahooSymbol);
  if (cached && cached.date === today && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchAnchors(yahooSymbol);
  // Only a successful fetch earns the full-day cache; an empty result is retried sooner so a
  // transient upstream failure doesn't blank out a card's returns for the rest of the day.
  const ttl = data.closes.oneWeek === null && data.inceptionClose === null ? 60_000 : ANCHOR_TTL_MS;
  anchorCache.set(yahooSymbol, { date: today, data, expiresAt: Date.now() + ttl });
  return data;
}

function percentChange(from: number | null, to: number | null): number | null {
  if (typeof from !== "number" || from <= 0 || typeof to !== "number") return null;
  return ((to - from) / from) * 100;
}

export async function getPerformanceSummary(symbolInput: string): Promise<PerformanceSummary> {
  const symbol = symbolInput.trim().toUpperCase();
  const { yahooSymbol, name, assetType, capTier } = resolveMeta(symbol);

  const [anchors, [quote]] = await Promise.all([getAnchors(yahooSymbol), getQuotesFor([{ symbol, yahooSymbol }])]);

  const price = quote?.price ?? null;
  const ret = (period: PeriodKey) => percentChange(anchors.closes[period], price);

  return {
    symbol,
    name: name ?? anchors.name,
    assetType,
    capTier,
    currency: anchors.currency,
    price,
    previousClose: quote?.previousClose ?? null,
    change: quote?.change ?? null,
    // Today's move already comes from the live quote (last price vs previous close), which is
    // exactly the 1D return — deriving it again from history would risk the two disagreeing.
    oneDay: quote?.changePercent ?? null,
    oneWeek: ret("oneWeek"),
    oneMonth: ret("oneMonth"),
    threeMonth: ret("threeMonth"),
    sixMonth: ret("sixMonth"),
    oneYear: ret("oneYear"),
    threeYear: ret("threeYear"),
    fiveYear: ret("fiveYear"),
    overall: percentChange(anchors.inceptionClose, price),
    overallSince: anchors.inceptionDate,
    live: quote?.live ?? false,
    asOf: quote?.asOf ?? null,
    source: SOURCE,
  };
}

export const getCachedPerformanceSummary = revalidatingBy<string, PerformanceSummary>({
  key: "market:performance-summary",
  ttlMs: 60_000,
  // A complete row stands for a minute. A blank price usually means the upstream quote feed
  // stumbled, so retry it quickly without making every hero card wait on that retry.
  ttlFor: (summary) => (typeof summary.price === "number" ? 60_000 : 10_000),
  maxStaleMs: 5 * 60_000,
  tags: [CACHE_TAGS.quotes],
  persist: true,
  capacity: 700,
  keyOf: (symbol) => symbol.trim().toUpperCase(),
  load: getPerformanceSummary,
});

export async function getCachedPerformanceSummaries(symbols: string[]): Promise<PerformanceSummary[]> {
  return mapWithConcurrency(symbols, HISTORY_CONCURRENCY, getCachedPerformanceSummary);
}

export async function getPerformanceSummaries(symbols: string[]): Promise<PerformanceSummary[]> {
  return mapWithConcurrency(symbols, HISTORY_CONCURRENCY, getPerformanceSummary);
}
