"use client";

import { useEffect, useState, useCallback } from "react";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal";
import { CapTierPill, LiveIndicator } from "./market-badges";
import { LiveMarketValue, StockReturns } from "./stock-returns";
import type { CapTier } from "../lib/indian-stocks";

type Pick = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  logo: string | null;
  price: number | null;
  changePercent: number | null;
  outlook: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  analysis: AnalysisResponse;
};

type TopPicksState = {
  date: string;
  generatedAt: string;
  source: "ai" | "heuristic";
  picks: Pick[];
};

function PickLogo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon host, not part of the Next/Image domain allowlist
    <img
      src={src}
      alt={`${name} logo`}
      width={40}
      height={40}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1.5 dark:border-slate-700"
    />
  );
}

function outlookClass(outlook: string) {
  if (outlook === "Bullish") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  if (outlook === "Bearish") return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

// Normalizes whatever free-text call the AI returns (e.g. "Strong Buy", "Avoid for now")
// down to one clear word so the card stays scannable instead of showing a run-on phrase.
function normalizeRecommendation(recommendation?: string) {
  const value = (recommendation || "").toLowerCase();
  if (value.includes("avoid") || value.includes("sell") || value.includes("not buy")) {
    return { label: "Avoid", className: "bg-rose-600 text-white" };
  }
  if (value.includes("hold")) {
    return { label: "Hold", className: "bg-amber-500 text-white" };
  }
  return { label: "Buy", className: "bg-emerald-600 text-white" };
}

function relativeTime(iso?: string) {
  if (!iso) return null;
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function TopPicksToday() {
  const [state, setState] = useState<TopPicksState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/predictions/top-picks");
      if (!response.ok) throw new Error("Failed to load top picks");
      const data = await response.json();
      setState(data);
      setError(null);
    } catch {
      setError("Couldn't reach the AI picks engine right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  const picks = state?.picks ?? [];
  /* istanbul ignore next -- selected is only ever set to an index rendered from the current picks array (see onClick below), and picks never shrinks after mount, so picks[selected] is always defined whenever selected !== null; the ?? null fallback is defensive only. */
  const activePick = selected !== null ? (picks[selected] ?? null) : null;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Today&apos;s AI picks</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Suggested stocks to buy today</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            AI screens the market daily for the strongest bullish setups. Each card shows the price, the call, and why — tap one for the full report.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 lg:items-end dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span>{state ? (state.source === "ai" ? "Generated by AI agent" : "Heuristic demo (no AI key configured)") : "Loading…"}</span>
          {state && relativeTime(state.generatedAt) && (
            <span className="text-xs font-normal text-emerald-600/80 dark:text-emerald-400/70">Updated {relativeTime(state.generatedAt)}</span>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40" />
          ))}

        {!loading &&
          picks.map((pick, index) => {
            const isActive = index === selected;
            const rec = normalizeRecommendation(pick.analysis.recommendation);
            const why = pick.analysis.recommendationReasons?.[0] || pick.analysis.keyInsights?.[0];

            return (
              <button
                key={pick.symbol}
                type="button"
                onClick={() => setSelected(index)}
                className={`flex flex-col rounded-2xl border p-4 text-left transition ${
                  isActive
                    ? "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-400 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                    : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-emerald-500/30"
                }`}
              >
                {index === 0 && (
                  <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                    ★ Top pick
                  </span>
                )}

                <div className="flex items-center gap-3">
                  <PickLogo src={pick.logo} name={pick.name} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold text-slate-900 dark:text-white">{pick.symbol}</p>
                      <CapTierPill tier={pick.capTier} />
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{pick.name}</p>
                    <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{pick.sector}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <LiveMarketValue
                    symbol={pick.symbol}
                    fallbackPrice={pick.price}
                    fallbackChangePercent={pick.changePercent}
                    className="min-w-0 flex-1"
                  />
                  <LiveIndicator />
                </div>

                <StockReturns
                  symbol={pick.symbol}
                  label="Returns"
                  className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                />

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${outlookClass(pick.outlook)}`}>
                    {pick.outlook} · {pick.confidence}%
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${rec.className}`}>{rec.label}</span>
                </div>

                {why && (
                  <p className="mt-3 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Why: </span>
                    {why}
                  </p>
                )}

                <p className="mt-auto pt-3 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {isActive ? "Viewing full report ↗" : "Tap for full AI report →"}
                </p>
              </button>
            );
          })}

        {!loading && picks.length === 0 && !error && (
          <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">
            No picks available right now — check back once markets are open.
          </p>
        )}
      </div>

      <AiReportModal
        open={activePick !== null}
        onClose={() => setSelected(null)}
        loading={false}
        analysis={activePick?.analysis ?? null}
        logoUrl={activePick?.logo}
        companyName={activePick?.name}
      />
    </section>
  );
}
