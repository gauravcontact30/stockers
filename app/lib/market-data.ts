import { indianStocks } from "./indian-stocks";
import { CACHE_TAGS, revalidatingBy } from "./cache";
import { recordPlatformLog } from "./platform-logs";

export type QuoteSubject = { symbol: string; yahooSymbol: string };

export type LiveQuote = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  live: boolean;
  asOf: string | null;
};

const LIVE_TTL_MS = 60_000;
const RETRY_TTL_MS = 10_000;
const CONCURRENCY = 12;
const YAHOO_SLOW_MS = 5_000;

function emptyQuote(symbol: string): LiveQuote {
  return {
    symbol,
    price: null,
    previousClose: null,
    change: null,
    changePercent: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    live: false,
    asOf: null,
  };
}

async function fetchYahooQuote(subject: QuoteSubject): Promise<LiveQuote> {
  const started = Date.now();
  const operation = `GET ${subject.yahooSymbol}`;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(subject.yahooSymbol)}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!response.ok) {
      recordPlatformLog({
        category: "data",
        source: "Yahoo Finance",
        useCase: "Market quote data fetching",
        operation,
        message: "Yahoo quote endpoint returned a non-success status.",
        statusCode: response.status,
        durationMs: Date.now() - started,
        method: "GET",
        metadata: { symbol: subject.symbol },
      });
      return emptyQuote(subject.symbol);
    }

    const payload = await response.json();
    const meta = payload?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") {
      recordPlatformLog({
        category: "data",
        source: "Yahoo Finance",
        useCase: "Market quote data fetching",
        operation,
        message: "Yahoo quote payload did not include a readable market price.",
        statusCode: response.status,
        durationMs: Date.now() - started,
        method: "GET",
        metadata: { symbol: subject.symbol },
      });
      return emptyQuote(subject.symbol);
    }

    const price = meta.regularMarketPrice;
    const previousClose = typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : price;
    const change = price - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;

    const quote = {
      symbol: subject.symbol,
      price,
      previousClose,
      change,
      changePercent,
      dayHigh: typeof meta.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : null,
      dayLow: typeof meta.regularMarketDayLow === "number" ? meta.regularMarketDayLow : null,
      volume: typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
      live: true,
      asOf: new Date((meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };
    const durationMs = Date.now() - started;
    if (durationMs >= YAHOO_SLOW_MS) {
      recordPlatformLog({
        category: "data",
        source: "Yahoo Finance",
        useCase: "Market quote data fetching",
        operation,
        message: "Yahoo quote endpoint completed slowly.",
        statusCode: response.status,
        durationMs,
        method: "GET",
        metadata: { symbol: subject.symbol },
      });
    }
    return quote;
  } catch {
    recordPlatformLog({
      category: "data",
      source: "Yahoo Finance",
      useCase: "Market quote data fetching",
      operation,
      message: "Yahoo quote endpoint could not be reached.",
      statusCode: 503,
      durationMs: Date.now() - started,
      method: "GET",
      metadata: { symbol: subject.symbol },
    });
    return emptyQuote(subject.symbol);
  }
}

const quoteLoaders = new Map<number, ReturnType<typeof revalidatingBy<QuoteSubject, LiveQuote>>>();

function quoteLoader(maxAgeMs: number) {
  const ttlMs = Math.max(1_000, Math.round(maxAgeMs));
  const existing = quoteLoaders.get(ttlMs);
  if (existing) return existing;

  const loader = revalidatingBy<QuoteSubject, LiveQuote>({
    key: `quotes:${ttlMs}`,
    ttlMs,
    ttlFor: (quote) => (quote.live ? ttlMs : Math.min(ttlMs, RETRY_TTL_MS)),
    maxStaleMs: Math.max(ttlMs * 5, RETRY_TTL_MS * 2),
    tags: [CACHE_TAGS.quotes],
    persist: true,
    capacity: 700,
    keyOf: (subject) => subject.yahooSymbol,
    load: fetchYahooQuote,
  });

  quoteLoaders.set(ttlMs, loader);
  return loader;
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * @param maxAgeMs how stale a cached quote may be. The default suits the 270-name universe, where
 * a minute-old price is fine; the live index ticker passes a couple of seconds instead, which is
 * affordable because it asks for three symbols rather than three hundred.
 */
export async function getQuotesFor(subjects: QuoteSubject[], maxAgeMs = LIVE_TTL_MS): Promise<LiveQuote[]> {
  const cachedQuote = quoteLoader(maxAgeMs);
  return mapWithConcurrency(subjects, CONCURRENCY, cachedQuote);
}

export async function getAllQuotes(): Promise<LiveQuote[]> {
  return getQuotesFor(indianStocks);
}
