import { readJsonCache, writeJsonCache } from "./data-cache";
import { indianStocks } from "./indian-stocks";
import { mapWithConcurrency, type QuoteSubject } from "./market-data";

export type PeriodReturnsCache = {
  date: string;
  generatedAt: string;
  returns: Record<string, number | null>;
};

const CONCURRENCY = 10;

export type ReturnPeriod = "1mo" | "6mo" | "1y" | "3y" | "5y" | "max";

type RangeConfig = { range: string; interval: string; cacheFile: string };
type LookbackConfig = { lookbackDays: number; interval: string; cacheFile: string };
type PeriodConfigEntry = RangeConfig | LookbackConfig;

// Yahoo's chart API only accepts an enumerated set of "range" values (1mo, 6mo, 1y, 5y, max,
// ...) and has no "3y" option, so that one figure alone is fetched with explicit
// period1/period2 unix timestamps instead of a range string.
const PERIOD_CONFIG: Record<ReturnPeriod, PeriodConfigEntry> = {
  "1mo": { range: "1mo", interval: "1d", cacheFile: "one-month-returns.json" },
  "6mo": { range: "6mo", interval: "1d", cacheFile: "six-month-returns.json" },
  "1y": { range: "1y", interval: "1wk", cacheFile: "one-year-returns.json" },
  "3y": { lookbackDays: 3 * 365, interval: "1mo", cacheFile: "three-year-returns.json" },
  "5y": { range: "5y", interval: "1mo", cacheFile: "five-year-returns.json" },
  "max": { range: "max", interval: "1mo", cacheFile: "overall-returns.json" },
};

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function rangeParamsFor(config: PeriodConfigEntry): string {
  if ("range" in config) return `range=${config.range}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const pastSec = nowSec - config.lookbackDays * 24 * 3600;
  return `period1=${pastSec}&period2=${nowSec}`;
}

async function fetchPeriodReturn(subject: QuoteSubject, config: PeriodConfigEntry): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(subject.yahooSymbol)}?interval=${config.interval}&${rangeParamsFor(config)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const currentPrice = result?.meta?.regularMarketPrice;

    if (typeof currentPrice !== "number") return null;

    const firstClose = closes.find((c): c is number => typeof c === "number");
    if (!firstClose || firstClose <= 0) return null;

    return ((currentPrice - firstClose) / firstClose) * 100;
  } catch {
    return null;
  }
}

// Trailing returns shift by at most one trading day's worth of data as time passes, so a
// once-per-IST-day disk cache (mirroring the daily-predictions pattern) avoids re-fetching
// price history for 150 stocks on every request.
async function getPeriodReturns(period: ReturnPeriod): Promise<PeriodReturnsCache> {
  const config = PERIOD_CONFIG[period];
  const today = todayIST();
  const cached = await readJsonCache<PeriodReturnsCache>(config.cacheFile);
  if (cached?.date === today) return cached;

  const values = await mapWithConcurrency(indianStocks, CONCURRENCY, (subject) => fetchPeriodReturn(subject, config));

  const returns: Record<string, number | null> = {};
  indianStocks.forEach((stock, i) => {
    returns[stock.symbol] = values[i];
  });

  // Yesterday's figures beat none at all. A refresh where every single name came back null is not
  // a day with no movement, it is the price feed being unreachable — and answering with a board of
  // blanks would be reporting an outage as a market that did nothing.
  if (cached && Object.values(returns).every((value) => value === null)) return cached;

  const cache: PeriodReturnsCache = {
    date: today,
    generatedAt: new Date().toISOString(),
    returns,
  };

  // Deliberately not awaited into the failure path: see ./data-cache. Whether the refreshed
  // figures could be kept has no bearing on whether they can be returned.
  await writeJsonCache(config.cacheFile, cache);
  return cache;
}

export async function getReturnsForPeriod(period: ReturnPeriod): Promise<PeriodReturnsCache> {
  return getPeriodReturns(period);
}

export async function getOneYearReturns(): Promise<PeriodReturnsCache> {
  return getPeriodReturns("1y");
}

export async function getOneMonthReturns(): Promise<PeriodReturnsCache> {
  return getPeriodReturns("1mo");
}
