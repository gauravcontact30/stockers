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
let resolvers = new Map<string, ((value: StockPerformance | null) => void)[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const symbols = queue;
  const pending = resolvers;
  queue = [];
  resolvers = new Map();

  const settle = (symbol: string, value: StockPerformance | null) => {
    if (value) cache.set(symbol, value);
    inFlight.delete(symbol);
    pending.get(symbol)?.forEach((resolve) => resolve(value));
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

function requestPerformance(symbol: string): Promise<StockPerformance | null> {
  const cached = cache.get(symbol);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const promise = new Promise<StockPerformance | null>((resolve) => {
    queue.push(symbol);
    const waiting = resolvers.get(symbol);
    if (waiting) waiting.push(resolve);
    else resolvers.set(symbol, [resolve]);

    if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  });

  inFlight.set(symbol, promise);
  return promise;
}

export function useStockPerformance(symbol: string | null) {
  const [performance, setPerformance] = useState<StockPerformance | null>(() => (symbol ? (cache.get(symbol) ?? null) : null));
  const [loading, setLoading] = useState(() => Boolean(symbol) && !cache.has(symbol ?? ""));

  useEffect(() => {
    if (!symbol) {
      setPerformance(null);
      setLoading(false);
      return;
    }

    const cached = cache.get(symbol);
    if (cached) {
      setPerformance(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    requestPerformance(symbol).then((data) => {
      if (cancelled) return;
      setPerformance(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { performance, loading };
}
