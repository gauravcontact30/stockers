"use client";

import { useCallback, useEffect, useState } from "react";
import { SourceNote, VerdictStrip, type StockVerdict } from "./verdict-view";

/**
 * Where each dashboard section's stocks come from.
 *
 * The panel reads the section's own feed and pulls the symbols out of it, so the calls it shows
 * are always about the names on screen rather than a separate list that could drift from them.
 * `symbols` is a pure function of the payload, which keeps the extraction testable.
 */
export type VerdictSource = {
  /** The section feed to read symbols from; omitted when the set is fixed. */
  feed?: string;
  symbols: (payload: unknown) => string[];
  feature: string;
  heading: string;
  blurb: string;
};

type Payload = Record<string, unknown>;

const list = (value: unknown): Payload[] => (Array.isArray(value) ? (value as Payload[]) : []);

const symbolsOf = (rows: Payload[]): string[] =>
  rows.map((row) => (typeof row.symbol === "string" ? row.symbol : "")).filter(Boolean);

/** The index heavyweights, used by sections that are not themselves a list of stocks. */
const HEAVYWEIGHTS = ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN"];

export const VERDICT_SOURCES: Record<string, VerdictSource> = {
  overview: {
    feature: "research",
    heading: "AI desk: today's heavyweights",
    blurb: "Where the index leaders stand right now, before you research anything else.",
    symbols: () => HEAVYWEIGHTS,
  },
  "market-pulse": {
    feed: "/api/market/pulse",
    feature: "market-pulse",
    heading: "AI desk: today's biggest large-cap moves",
    blurb: "The names driving the tape, and whether the move is worth acting on.",
    symbols: (payload) => {
      const movers = (payload as Payload)?.breadth as Payload | undefined;
      const large = (movers?.movers as Payload | undefined)?.Large as Payload | undefined;
      return [...symbolsOf(list(large?.gainers)).slice(0, 3), ...symbolsOf(list(large?.losers)).slice(0, 3)];
    },
  },
  "top-picks": {
    feed: "/api/predictions/top-picks",
    feature: "top-picks",
    heading: "AI desk: a second opinion on today's picks",
    blurb: "The same names, scored again on measured performance rather than today's signal.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.picks)).slice(0, 6),
  },
  "buy-tomorrow": {
    feed: "/api/predictions/buy-tomorrow",
    feature: "buy-tomorrow",
    heading: "AI desk: do the setups hold up?",
    blurb: "Tomorrow's candidates checked against their week, month and year.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.picks)).slice(0, 6),
  },
  "dip-winners": {
    feed: "/api/market/dip-winners",
    feature: "dip-winners",
    heading: "AI desk: dip or downtrend?",
    blurb: "A pullback is only a bargain if the longer trend is still intact — here is which is which.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.stocks)).slice(0, 6),
  },
  research: {
    feature: "research",
    heading: "AI desk: the stocks most investors start with",
    blurb: "Standing calls on the index heavyweights, as a reference point for anything you research.",
    symbols: () => HEAVYWEIGHTS,
  },
  "etf-research": {
    feed: "/api/market/etfs",
    feature: "etf-research",
    heading: "AI desk: the most-held ETFs",
    blurb: "The same momentum read applied to funds rather than single stocks.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.etfs)).slice(0, 6),
  },

  // The exchange boards. Each reads the symbols out of its own feed, so the calls are always
  // about the companies that section is showing rather than a fixed list beside them.
  directory: {
    feed: "/api/market/bse/stocks?sort=mcap&direction=desc",
    feature: "directory",
    heading: "AI desk: the exchange's largest companies",
    blurb: "Standing calls on the biggest names in the directory, before you search for your own.",
    symbols: (payload) =>
      list((payload as Payload)?.rows)
        .map((row) => (typeof row.ticker === "string" ? row.ticker : ""))
        .filter(Boolean)
        .slice(0, 6),
  },
  sectors: {
    feature: "sectors",
    heading: "AI desk: bellwethers of the moving sectors",
    blurb: "Rotation shows up in the index; these are the stocks doing the moving.",
    symbols: () => HEAVYWEIGHTS,
  },
  "most-traded": {
    feed: "/api/market/most-traded",
    feature: "most-traded",
    heading: "AI desk: heavy turnover, but worth owning?",
    blurb: "A stock can trade hard on its way down — here is which side of that these are on.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.byValue)).slice(0, 6),
  },
  mtf: {
    feed: "/api/market/most-traded",
    feature: "mtf",
    heading: "AI desk: would you borrow to hold these?",
    blurb: "Leverage magnifies the trend you lean into, so the trend is the thing to check first.",
    symbols: (payload) => symbolsOf(list((payload as Payload)?.mtf)).slice(0, 6),
  },
  "stock-news": {
    feed: "/api/market/stock-news",
    feature: "stock-news",
    heading: "AI desk: the companies that filed today",
    blurb: "A filing is news; whether the stock behind it is worth owning is a separate question.",
    symbols: (payload) =>
      list((payload as Payload)?.sectors)
        .flatMap((sector) => symbolsOf(list(sector.items)))
        .slice(0, 6),
  },
  dividends: {
    feed: "/api/market/dividends",
    feature: "dividends",
    heading: "AI desk: is the dividend worth the holding?",
    blurb: "A payout is only worth capturing if the stock behind it is not falling faster.",
    symbols: (payload) =>
      list((payload as Payload)?.sectors)
        .flatMap((sector) => list(sector.dividends).map((row) => (typeof row.symbol === "string" ? row.symbol : "")))
        .filter(Boolean)
        .slice(0, 6),
  },
  ipos: {
    feature: "ipos",
    heading: "AI desk: what the listed market is paying for",
    blurb: "An issue is priced against its listed peers, so start from where those peers stand.",
    symbols: () => HEAVYWEIGHTS,
  },
  "etf-board": {
    feed: "/api/market/etf-board",
    feature: "etf-board",
    heading: "AI desk: the funds carrying the most money",
    blurb: "The busiest funds on the board, scored on the same measured returns as any stock.",
    symbols: (payload) =>
      list((payload as Payload)?.groups)
        .flatMap((group) => symbolsOf(list(group.etfs)))
        .slice(0, 6),
  },
};

/**
 * A stock-level AI call panel, sitting above whichever section is open.
 *
 * Every AI section in the dashboard used to answer its own narrow question; this adds the one
 * question they all left unanswered — for these specific stocks, outperform, hold or underperform, and why.
 */
export function AiVerdictPanel({ section }: { section: string }) {
  const config = VERDICT_SOURCES[section];
  const [verdicts, setVerdicts] = useState<StockVerdict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!config) return;

    try {
      let symbols = config.symbols(null);

      if (config.feed) {
        const feed = await fetch(config.feed);
        if (!feed.ok) throw new Error("Feed failed");
        symbols = config.symbols(await feed.json());
      }

      if (symbols.length === 0) {
        setVerdicts([]);
        return;
      }

      const response = await fetch("/api/ai/verdicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: config.feature, symbols }),
      });
      if (!response.ok) throw new Error("Verdicts failed");

      const data = await response.json();
      setVerdicts(Array.isArray(data.verdicts) ? data.verdicts : []);
      setError(null);
    } catch {
      setError("The AI desk couldn't score these stocks right now.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  if (!config) return null;

  return (
    <section className="rounded-[32px] border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-white p-5 shadow-[0_20px_60px_-40px_rgba(5,150,105,0.6)] transition-colors sm:p-6 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">AI stock desk</p>
          <h3 className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">{config.heading}</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-400">{config.blurb}</p>
        </div>
        {verdicts && verdicts.length > 0 && (
          <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-400">
            {verdicts.length} stocks scored
          </span>
        )}
      </div>

      {loading && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-emerald-100 bg-white/60 dark:border-slate-800 dark:bg-slate-950/40" />
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      {!loading && !error && verdicts && verdicts.length > 0 && (
        <>
          <div className="mt-4">
            <VerdictStrip stocks={verdicts} />
          </div>
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            <SourceNote source={verdicts[0].source} />
          </p>
        </>
      )}

      {!loading && !error && verdicts?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          This section has no stocks to score yet — it fills in once the day&apos;s data lands.
        </p>
      )}
    </section>
  );
}
