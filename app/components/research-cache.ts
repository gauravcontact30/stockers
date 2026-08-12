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
