"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { MarketClock, marketSession, useClockTick } from "./market-clock";
import { MarketIndices, type IndexQuote } from "./market-indices";
import { MarketMovers, type CapMovers, type Mover } from "./market-movers";
import { MarketPulseBars } from "./market-pulse-bars";
import { TopMoversStrip } from "./top-movers-strip";
import type { CapTier } from "../lib/indian-stocks";

type Mood = "Risk-On" | "Neutral" | "Risk-Off";

type MarketPulseState = {
  breadth: {
    totalTracked: number;
    advancing: number;
    declining: number;
    unchanged: number;
    averageChangePercent: number;
    topSector: { name: string; averageChangePercent: number } | null;
    bottomSector: { name: string; averageChangePercent: number } | null;
    topGainer: { symbol: string; name: string; changePercent: number } | null;
    topLoser: { symbol: string; name: string; changePercent: number } | null;
    movers: Record<CapTier, CapMovers>;
  };
  indices: IndexQuote[];
  mood: Mood;
  summary: string;
  themes: string[];
  sectorsToWatch: string[];
  generatedAt: string;
  source: "ai" | "heuristic";
  lastTradeAt: string | null;
  breadthAsOf: string;
};

// Breadth is recomputed server-side from the 60s quote cache, so polling at the same cadence
// keeps the bars tracking the live tape without hammering the endpoint for unchanged numbers.
const REFRESH_MS = 60_000;

// The index levels are a separate, far smaller call, so they can be pulled far more often. The
// endpoint itself only goes upstream every couple of seconds, which is what makes this rate safe.
const LIVE_REFRESH_MS = 500;

// Enough ticks for a legible sparkline without the array growing all session.
const MAX_TICKS = 60;

type LiveIndices = { indices: IndexQuote[]; asOf: string };

/**
 * Polls the lightweight index endpoint and remembers what it has seen.
 *
 * Kept separate from the pulse payload above because the two move at different speeds: breadth
 * across 270 stocks is a minute-scale number, while an index level is worth watching tick by tick.
 */
function useLiveIndices(enabled: boolean) {
  const [live, setLive] = useState<LiveIndices | null>(null);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [refreshing, setRefreshing] = useState(false);

  /**
   * One fetch of the benchmark levels.
   *
   * Shared by the interval and by the manual Refresh button, so a hand-pulled level lands in the
   * same state and the same tick history as an automatic one — the sparkline cannot end up with
   * a gap the poll did not make.
   */
  const pull = useCallback(async (isLive: () => boolean) => {
    try {
      const response = await fetch("/api/market/live");
      if (!response.ok) return;

      const data: LiveIndices | null = await response.json();
      // A 200 with an unusable body is treated as a dropped poll: the panel keeps the levels it
      // already has rather than throwing inside an interval that would then stop running.
      if (!isLive() || !Array.isArray(data?.indices)) return;

      setLive(data);
      setHistory((previous) => {
        const next: Record<string, number[]> = { ...previous };
        for (const index of data.indices) {
          if (typeof index.price !== "number") continue;
          const seen = next[index.symbol] ?? [];
          // Only a changed level is a tick; repeating the same number would draw a flat line
          // that says "nothing is happening" when it means "nothing has changed yet".
          if (seen[seen.length - 1] === index.price) continue;
          next[index.symbol] = [...seen, index.price].slice(-MAX_TICKS);
        }
        return next;
      });
    } catch {
      // A dropped poll is not worth surfacing: the next one is 500ms away and the panel still
      // shows the last good levels.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const isLive = () => !cancelled;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first poll of the session; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    pull(isLive);
    const timer = setInterval(() => pull(isLive), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, pull]);

  /** Pull now, on request. Works whether or not the automatic poll is running. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await pull(() => true);
    setRefreshing(false);
  }, [pull]);

  return { live, history, refresh, refreshing };
}

/** The steepest moves across every cap tier, merged and ranked. */
export function topMovers(movers: Record<CapTier, CapMovers> | undefined, direction: "gainers" | "losers", count: number): Mover[] {
  if (!movers) return [];

  const all = Object.values(movers).flatMap((tier) => tier[direction]);
  return [...all]
    .sort((a, b) => (direction === "gainers" ? b.changePercent - a.changePercent : a.changePercent - b.changePercent))
    .slice(0, count);
}

const MOOD_STYLES: Record<Mood, { badge: string; ring: string }> = {
  "Risk-On": { badge: "bg-emerald-600 text-white", ring: "border-emerald-200 dark:border-emerald-500/30" },
  Neutral: { badge: "bg-amber-500 text-white", ring: "border-amber-200 dark:border-amber-500/30" },
  "Risk-Off": { badge: "bg-rose-600 text-white", ring: "border-rose-200 dark:border-rose-500/30" },
};

export function MarketPulse() {
  const [state, setState] = useState<MarketPulseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Called before the early returns below so the hook order stays stable across render paths.
  const tick = useClockTick();
  /**
   * Polling only makes sense inside the session; overnight the levels are fixed and the panel
   * would be asking a question with a known answer twice a second.
   *
   * The gate is the *clock* alone, deliberately. It used to also require `marketSession` to
   * return "open", which additionally checks that the last trade we know about happened today —
   * and that check is fed by the pulse payload, which is up to a minute stale. Early in a
   * session it still carries yesterday's `lastTradeAt`, so the session read as a holiday, the
   * poll never started, and the benchmark cards sat on a 60-second-old level all day. The poll
   * itself is the cheaper, more current answer to "is the exchange printing".
   */
  const sessionOpen = tick > 0 && marketSession(tick, null).open;
  const { live: liveFeed, history, refresh, refreshing } = useLiveIndices(sessionOpen);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/market/pulse");
      if (!response.ok) throw new Error("Failed to load market pulse");
      const data = await response.json();
      setState(data);
      setError(null);
    } catch {
      setError("Couldn't reach the market data feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </section>
    );
  }

  if (error || !state) {
    return (
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-amber-700 dark:text-amber-400">{error ?? "Market pulse unavailable right now."}</p>
      </section>
    );
  }

  const { breadth } = state;
  const moodStyle = MOOD_STYLES[state.mood];
  // Before the first tick there is no trustworthy clock, so the bars stay off rather than
  // claiming the market is live.
  const live = sessionOpen;
  // While the market is open the fast feed is newer than the pulse payload it arrived with. Only
  // validated payloads are ever stored, so a live feed always carries indices.
  const indices = liveFeed ? liveFeed.indices : state.indices;

  return (
    <section className={`rounded-[32px] border bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:bg-slate-900 ${moodStyle.ring}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">AI market pulse</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Today&apos;s market mood</h3>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${moodStyle.badge}`}>{state.mood}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{state.summary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <MarketClock lastTradeAt={state.lastTradeAt} className="w-full lg:w-auto lg:text-right" />
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
            {state.source === "ai" ? "Generated by AI agent" : "Heuristic (no AI key configured)"} · breadth across {breadth.totalTracked} stocks
          </span>
        </div>
      </div>

      <MarketIndices
        indices={indices}
        live={live}
        history={history}
        onRefresh={refresh}
        refreshing={refreshing}
        className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800"
      />

      <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
        <TopMoversStrip
          gainers={topMovers(breadth.movers, "gainers", 3)}
          losers={topMovers(breadth.movers, "losers", 3)}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MarketPulseBars
          className="sm:col-span-2"
          advancing={breadth.advancing}
          declining={breadth.declining}
          unchanged={breadth.unchanged}
          live={live}
        />

        <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Average move</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${breadth.averageChangePercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {breadth.averageChangePercent >= 0 ? "+" : ""}
            {breadth.averageChangePercent.toFixed(2)}%
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">across {breadth.totalTracked} stocks</p>
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Top gainer</p>
          {breadth.topGainer ? (
            <>
              <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                <CompanyLogo symbol={breadth.topGainer.symbol} size={26} />
                <span className="truncate">{breadth.topGainer.symbol}</span>
              </p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ▲ {breadth.topGainer.changePercent.toFixed(2)}%
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">{breadth.topGainer.name}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">—</p>
          )}
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Top loser</p>
          {breadth.topLoser ? (
            <>
              <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                <CompanyLogo symbol={breadth.topLoser.symbol} size={26} />
                <span className="truncate">{breadth.topLoser.symbol}</span>
              </p>
              <p className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                ▼ {Math.abs(breadth.topLoser.changePercent).toFixed(2)}%
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">{breadth.topLoser.name}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">—</p>
          )}
        </div>
      </div>

      <MarketMovers movers={breadth.movers} className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800" />

      <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
        {state.themes.map((theme) => (
          <span key={theme} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {theme}
          </span>
        ))}
        {state.sectorsToWatch.map((sector) => (
          <span key={sector} className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
            Watch: {sector}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Breadth computed live from Yahoo Finance quotes across our tracked stock universe (not the full exchange) · not investment advice.
      </p>
    </section>
  );
}
