"use client";

import type { AnalysisResponse } from "./ai-analysis-report";

const TTL_MS = 5 * 60 * 1000;

type Entry = {
  value: AnalysisResponse;
  expiresAt: number;
};

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<AnalysisResponse>>();

function keyFor(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Empties both maps. For tests, and named the way `resetCacheWritability` in ../lib/data-cache is.
 *
 * These live at module scope, which is what makes the cache shared across every board on the page —
 * and, under Jest, shared across every test in a file, because a module is instantiated once per
 * suite rather than once per test. A test that opened a company's report left that company cached
 * for whatever ran next, so the next test's report resolved instantly and never passed through its
 * loading state. That is an ordering dependency rather than a behaviour, and this is how a suite
 * opts out of it.
 */
export function resetResearchCache(): void {
  cache.clear();
  inFlight.clear();
}

export async function fetchResearch(symbol: string): Promise<AnalysisResponse> {
  const key = keyFor(symbol);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const running = inFlight.get(key);
  if (running) return running;

  const request = fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stock: key }),
  })
    .then(async (response) => {
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok) throw new Error("Research request failed.");
      cache.set(key, { value: data, expiresAt: Date.now() + TTL_MS });
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
