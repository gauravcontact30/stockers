"use client";

import { useEffect, useState } from "react";

export type StockPerformance = {
  symbol: string;
  name: string | null;
  assetType: "stock" | "etf" | "unknown";
  capTier: "Large" | "Mid" | "Small" | null;
  currency: string;
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
  overallSince: string | null;
  live: boolean;
  asOf: string | null;
  source: string;
};

// Every stock card on the landing page asks for its own returns independently, which would be
// dozens of parallel requests for the same endpoint. Symbols raised within one flush window are
// collected and sent as a single batched call; results are memoised for the session so a symbol
// appearing in several sections (top picks and dip winners, say) is only ever fetched once.
const FLUSH_DELAY_MS = 60;
const MAX_BATCH = 60;

const cache = new Map<string, StockPerformance>();
const inFlight = new Map<string, Promise<StockPerformance | null>>();

let queue: string[] = [];
let resolvers = new Map<string, (value: StockPerformance | null) => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const symbols = queue;
  const pending = resolvers;
  queue = [];
  resolvers = new Map();

  const settle = (symbol: string, value: StockPerformance | null) => {
    // A null result stays out of the cache so the symbol is retried rather than being stuck
    // showing dashes for the rest of the session after one bad response.
    if (value) cache.set(symbol, value);
    inFlight.delete(symbol);
    pending.get(symbol)?.(value);
  };

  for (let start = 0; start < symbols.length; start += MAX_BATCH) {
    const chunk = symbols.slice(start, start + MAX_BATCH);
    try {
      const query = chunk.map(encodeURIComponent).join(",");
      const response = await fetch(`/api/market/performance?symbols=${query}`);
      if (!response.ok) throw new Error(`Performance request failed with ${response.status}`);

      const payload: { results?: StockPerformance[] } = await response.json();
      const bySymbol = new Map((payload.results ?? []).map((item) => [item.symbol, item]));
      chunk.forEach((symbol) => settle(symbol, bySymbol.get(symbol) ?? null));
    } catch {
      chunk.forEach((symbol) => settle(symbol, null));
    }
  }
}

// The in-flight map guarantees a symbol is queued at most once, so a single resolver per symbol
// is enough — every later caller for the same symbol shares that one pending promise.
function requestPerformance(symbol: string): Promise<StockPerformance | null> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const promise = new Promise<StockPerformance | null>((resolve) => {
    queue.push(symbol);
    resolvers.set(symbol, resolve);
    if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  });

  inFlight.set(symbol, promise);
  return promise;
}

// State is derived during render rather than synchronised through the effect: the cache is an
// external store, so reading it while rendering keeps a cached symbol instant, and the only
// setState left is the async one in the response handler. Tagging the resolved value with the
// symbol it belongs to stops a slow response for the previous symbol from being shown against
// the current one.
export function useStockPerformance(symbol: string | null) {
  const [resolved, setResolved] = useState<{ symbol: string; data: StockPerformance | null } | null>(null);

  useEffect(() => {
    if (!symbol || cache.has(symbol)) return;

    let cancelled = false;
    requestPerformance(symbol).then((data) => {
      if (!cancelled) setResolved({ symbol, data });
    });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (!symbol) return { performance: null, loading: false };

  const cached = cache.get(symbol);
  if (cached) return { performance: cached, loading: false };

  if (resolved?.symbol === symbol) return { performance: resolved.data, loading: false };

  return { performance: null, loading: true };
}
