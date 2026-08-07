import { indianStocks } from "./indian-stocks";

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

// Keyed by yahooSymbol (globally unique, unlike display symbol) so stocks and ETFs can
// safely share one cache without risk of collision. The fetch time is kept rather than an expiry
// so one caller can ask for a fresher copy than the shared default without disturbing the rest.
const cache = new Map<string, { data: LiveQuote; fetchedAt: number }>();

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
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(subject.yahooSymbol)}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!response.ok) return emptyQuote(subject.symbol);

    const payload = await response.json();
    const meta = payload?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return emptyQuote(subject.symbol);

    const price = meta.regularMarketPrice;
    const previousClose = typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : price;
    const change = price - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;

    return {
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
  } catch {
    return emptyQuote(subject.symbol);
  }
}

async function getQuoteCached(subject: QuoteSubject, maxAgeMs: number): Promise<LiveQuote> {
  const cached = cache.get(subject.yahooSymbol);
  if (cached) {
    // A failed quote is retried sooner than a good one, but never later than the caller asked for.
    const ttl = cached.data.live ? maxAgeMs : Math.min(maxAgeMs, RETRY_TTL_MS);
    if (Date.now() - cached.fetchedAt < ttl) return cached.data;
  }

  const data = await fetchYahooQuote(subject);
  cache.set(subject.yahooSymbol, { data, fetchedAt: Date.now() });
  return data;
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
  return mapWithConcurrency(subjects, CONCURRENCY, (subject) => getQuoteCached(subject, maxAgeMs));
}

export async function getAllQuotes(): Promise<LiveQuote[]> {
  return getQuotesFor(indianStocks);
}
