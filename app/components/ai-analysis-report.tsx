"use client";

import { memo, useState } from "react";
import { CompanyLogo } from "./company-logo";
import type { CompetitorsData, Performance } from "./use-stock-insights";

export type AnalysisResponse = {
  stock: string;
  marketPulse: string;
  summary: string;
  positiveSignals: string[];
  negativeSignals: string[];
  score: number;
  risk: string;
  nextSteps: string[];
  prediction?: string;
  newsFocus?: string[];
  outlook?: string;
  source?: string;
  recommendation?: string;
  recommendationReasons?: string[];
  keyInsights?: string[];
  marketTrends?: string[];
  companyActions?: string[];
  positiveNews?: string[];
};

type ReturnPeriodKey = "oneWeek" | "oneMonth" | "threeMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear" | "overall";

const RETURN_PERIODS: { key: ReturnPeriodKey; label: string }[] = [
  { key: "oneWeek", label: "1W" },
  { key: "oneMonth", label: "1M" },
  { key: "threeMonth", label: "3M" },
  { key: "sixMonth", label: "6M" },
  { key: "oneYear", label: "1Y" },
  { key: "threeYear", label: "3Y" },
  { key: "fiveYear", label: "5Y" },
  { key: "overall", label: "Overall" },
];

function capTierBadgeClass(tier: string) {
  if (tier === "Large") return "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400";
  if (tier === "Mid") return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400";
  return "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400";
}

// The AI's "prediction" field isn't schema-constrained (unlike recommendation), so it
// sometimes comes back as a full sentence instead of a single word — normalize it before it
// ever lands in a pill-shaped badge.
function normalizeOutlook(prediction?: string): "Bullish" | "Bearish" | "Neutral" {
  const value = (prediction || "").toLowerCase();
  if (value.includes("bear")) return "Bearish";
  if (value.includes("bull")) return "Bullish";
  return "Neutral";
}

function recommendationStyle(recommendation?: string) {
  const value = (recommendation || "").toLowerCase();
  if (value.includes("avoid") || value.includes("sell") || value.includes("not buy")) {
    return {
      label: "Avoid",
      badge: "bg-rose-600 text-white",
      panel: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10",
      accent: "text-rose-700 dark:text-rose-400",
    };
  }
  if (value.includes("hold")) {
    return {
      label: "Hold",
      badge: "bg-amber-500 text-white",
      panel: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      accent: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    label: "Outperform",
    badge: "bg-emerald-600 text-white",
    panel: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    accent: "text-emerald-700 dark:text-emerald-400",
  };
}

// A diverging-bar "Returns" row — period, signed %, and a magnitude bar scaled against the
// largest move in the set — the pattern real trading terminals (Kite, Groww, Bloomberg) use
// to make relative performance scannable at a glance instead of just six flat numbers.
const ReturnsStrip = memo(function ReturnsStrip({ performance, loading }: { performance: Performance | null; loading: boolean }) {
  const maxAbs = Math.max(1, ...RETURN_PERIODS.map(({ key }) => Math.abs(performance?.[key] ?? 0)));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">📈 Returns</p>
      <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4">
        {RETURN_PERIODS.map(({ key, label }) => {
          const value = performance?.[key];
          const known = typeof value === "number";
          const isUp = known && value >= 0;
          const barPct = known ? Math.max(6, (Math.abs(value) / maxAbs) * 100) : 0;
          const colorClass = !known ? "text-slate-400 dark:text-slate-500" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

          return (
            <div key={key} className="text-center">
              <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">{label}</p>
              {loading ? (
                <div className="mx-auto mt-1 h-5 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <p className={`mt-0.5 text-sm font-bold tabular-nums ${colorClass}`}>
                  {known ? `${isUp ? "+" : ""}${value.toFixed(1)}%` : "—"}
                </p>
              )}
              <div className="mx-auto mt-1.5 h-1 w-full max-w-[52px] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                {!loading && known && (
                  <div className={`h-full rounded-full ${isUp ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${barPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * A peer's own mark, through the one logo path the rest of the app uses.
 *
 * This used to build a `logo.clearbit.com` URL out of the Google favicon URL beside it and try
 * that first. Clearbit's free logo API no longer answers at all, so every peer row opened by
 * waiting on a host that was never going to reply. `CompanyLogo` asks the symbol store the
 * exchange tickers are keyed by, which does answer, and falls back to the company's own favicon
 * behind it — see the note on `logoSources` in ./company-logo.
 */
const CompetitorLogo = memo(function CompetitorLogo({ symbol, name }: { symbol?: string; name: string }) {
  if (!symbol) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return <CompanyLogo symbol={symbol} size={32} preferReal />;
});

const CompetitorsPanel = memo(function CompetitorsPanel({ data, loading }: { data: CompetitorsData | null; loading: boolean }) {
  if (!loading && (!data || data.peers.length === 0)) return null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">🏁 Competitors</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {data
          ? `Ranked by market position in ${data.group} — today's move alongside`
          : "Ranking against sector peers by market position…"}
      </p>

      <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}

        {!loading &&
          data?.peers.map((peer, index) => {
            const known = typeof peer.changePercent === "number";
            const isUp = known && peer.changePercent! >= 0;
            const colorClass = !known ? "text-slate-400 dark:text-slate-500" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

            return (
              <div
                key={peer.symbol}
                className={`flex items-center gap-3 py-2.5 ${peer.isSelf ? "-mx-2 rounded-xl bg-emerald-50 px-2 dark:bg-emerald-500/10" : ""}`}
              >
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">{index + 1}</span>
                <CompetitorLogo symbol={peer.symbol} name={peer.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{peer.symbol}</p>
                    {peer.isSelf && (
                      <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                        This stock
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{peer.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {peer.price !== null ? `₹${peer.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                  </p>
                  <p className={`text-xs font-semibold ${colorClass}`}>
                    {known ? `${isUp ? "▲" : "▼"} ${Math.abs(peer.changePercent!).toFixed(2)}%` : "—"}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
});

const CompactList = memo(function CompactList({ items, icon }: { items: string[]; icon: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Nothing notable flagged.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
          <span aria-hidden className="mt-0.5 shrink-0">{icon}</span>
          <span className="line-clamp-2">{item}</span>
        </li>
      ))}
    </ul>
  );
});

export function AiAnalysisReport({
  analysis,
  performance,
  perfLoading,
  competitors,
  competitorsLoading,
}: {
  analysis: AnalysisResponse;
  logoUrl?: string | null;
  companyName?: string;
  performance: Performance | null;
  perfLoading: boolean;
  competitors: CompetitorsData | null;
  competitorsLoading: boolean;
}) {
  const rec = recommendationStyle(analysis.recommendation);
  const reasons = (analysis.recommendationReasons ?? []).slice(0, 3);
  const highlights = [...(analysis.positiveNews ?? []), ...(analysis.keyInsights ?? [])]
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 3);
  const risks = [analysis.risk, ...(analysis.negativeSignals ?? [])].filter(Boolean).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            {normalizeOutlook(analysis.prediction)} outlook
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            Score {analysis.score}/100
          </span>
          {performance?.capTier && (
            <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${capTierBadgeClass(performance.capTier)}`}>
              {performance.capTier} Cap
            </span>
          )}
          {performance?.assetType === "etf" && (
            <span className="rounded-full bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
              ETF
            </span>
          )}
        </div>
        {analysis.outlook && <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{analysis.outlook}</p>}
      </div>

      <ReturnsStrip performance={performance} loading={perfLoading} />

      <CompetitorsPanel data={competitors} loading={competitorsLoading} />

      <div className={`rounded-3xl border p-5 transition-colors ${rec.panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${rec.accent}`}>🎯 Should it outperform?</p>
          <span className={`rounded-full px-4 py-1.5 text-base font-bold ${rec.badge}`}>{rec.label}</span>
        </div>
        <div className="mt-3">
          <CompactList items={reasons} icon="→" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 transition-colors dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-400">🔑 Highlights</p>
          <div className="mt-3">
            <CompactList items={highlights} icon="✅" />
          </div>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 transition-colors dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-700 dark:text-rose-400">⚠️ Risks to watch</p>
          <div className="mt-3">
            <CompactList items={risks} icon="⚠️" />
          </div>
        </div>
      </div>
    </div>
  );
}
