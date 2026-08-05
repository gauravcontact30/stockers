"use client";

import { useEffect, useState } from "react";

export type Performance = {
  assetType: "stock" | "etf" | "unknown";
  capTier: "Large" | "Mid" | "Small" | null;
  oneWeek: number | null;
  oneMonth: number | null;
  threeMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
  overall: number | null;
};

export type Competitor = {
  symbol: string;
  name: string;
  logo: string;
  price: number | null;
  changePercent: number | null;
  isSelf: boolean;
};

export type CompetitorsData = {
  symbol: string;
  group: string;
  groupType: "sector" | "category";
  peers: Competitor[];
};

// Keyed by symbol and shared across every report instance in the session (and across both the
// modal footer and the report body, which both consume this same data), so switching back to a
// stock you already opened renders instantly with no duplicate network round-trip.
const performanceCache = new Map<string, Performance>();
const competitorsCache = new Map<string, CompetitorsData | null>();

export function usePerformance(symbol: string | null) {
  const [performance, setPerformance] = useState<Performance | null>(() => (symbol ? (performanceCache.get(symbol) ?? null) : null));
  const [loading, setLoading] = useState(
    () => Boolean(symbol) && !performanceCache.has(/* istanbul ignore next -- Boolean(symbol) above already guarantees symbol is non-empty here, so the "" fallback is unreachable */ symbol ?? "")
  );

  useEffect(() => {
    if (!symbol) {
      setPerformance(null);
      setLoading(false);
      return;
    }

    const cached = performanceCache.get(symbol);
    if (cached) {
      setPerformance(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPerformance(null);

    fetch(`/api/market/performance?symbol=${encodeURIComponent(symbol)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Performance | null) => {
        if (cancelled || !data) return;
        performanceCache.set(symbol, data);
        setPerformance(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { performance, loading };
}

export function useCompetitors(symbol: string | null) {
  const [competitors, setCompetitors] = useState<CompetitorsData | null>(() => (symbol ? (competitorsCache.get(symbol) ?? null) : null));
  const [loading, setLoading] = useState(
    () => Boolean(symbol) && !competitorsCache.has(/* istanbul ignore next -- Boolean(symbol) above already guarantees symbol is non-empty here, so the "" fallback is unreachable */ symbol ?? "")
  );

  useEffect(() => {
    if (!symbol) {
      setCompetitors(null);
      setLoading(false);
      return;
    }

    if (competitorsCache.has(symbol)) {
      setCompetitors(competitorsCache.get(symbol) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setCompetitors(null);

    fetch(`/api/market/competitors?symbol=${encodeURIComponent(symbol)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CompetitorsData | null) => {
        if (cancelled) return;
        competitorsCache.set(symbol, data);
        setCompetitors(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { competitors, loading };
}
