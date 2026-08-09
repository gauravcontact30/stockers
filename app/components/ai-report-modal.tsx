"use client";

import { useState } from "react";
import { AppleModal } from "./apple-modal";
import { AiAnalysisReport, type AnalysisResponse } from "./ai-analysis-report";
import { usePerformance, useCompetitors, type Performance } from "./use-stock-insights";

type ReturnPeriodKey = "oneWeek" | "oneMonth" | "threeMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear" | "overall";

const PERIODS: { key: ReturnPeriodKey; label: string }[] = [
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

// Every logo URL in this app is built from a Google favicon URL (`?domain=<company domain>`).
// Clearbit's public logo API usually returns a cleaner, higher-res brand mark for the same
// domain, so it's tried first — the favicon URL we already have is the guaranteed-real fallback.
function clearbitUrlFrom(googleFaviconSrc?: string | null): string | null {
  if (!googleFaviconSrc) return null;
  try {
    const domain = new URL(googleFaviconSrc).searchParams.get("domain");
    return domain ? `https://logo.clearbit.com/${domain}?size=128` : null;
  } catch {
    return null;
  }
}

function bestAndWorstPeriod(performance: Performance | null) {
  if (!performance) return null;
  const known = PERIODS.map(({ key, label }) => ({ label, value: performance[key] })).filter(
    (p): p is { label: string; value: number } => typeof p.value === "number"
  );
  if (known.length === 0) return null;
  return {
    best: known.reduce((a, b) => (b.value > a.value ? b : a)),
    worst: known.reduce((a, b) => (b.value < a.value ? b : a)),
  };
}

function recommendationBadge(recommendation?: string) {
  const value = (recommendation || "").toLowerCase();
  if (value.includes("avoid") || value.includes("sell") || value.includes("not buy")) {
    return { label: "Avoid", className: "bg-rose-600 text-white" };
  }
  if (value.includes("hold")) {
    return { label: "Hold", className: "bg-amber-500 text-white" };
  }
  return { label: "Outperform", className: "bg-emerald-600 text-white" };
}

function ModalLogo({ src, name }: { src?: string | null; name: string }) {
  const clearbitSrc = clearbitUrlFrom(src);
  const [stage, setStage] = useState<"clearbit" | "google" | "failed">(clearbitSrc ? "clearbit" : "google");
  const currentSrc = stage === "clearbit" ? clearbitSrc : src;

  if (!currentSrc || stage === "failed") {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-base font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external logo hosts, not part of the Next/Image domain allowlist
    <img
      src={currentSrc}
      alt=""
      width={44}
      height={44}
      onError={() => setStage((prev) => (prev === "clearbit" ? "google" : "failed"))}
      className="h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white object-contain p-2 dark:border-slate-700 dark:bg-slate-900"
    />
  );
}

function FooterStat({
  icon,
  label,
  value,
  sub,
  loading,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  tone?: "up" | "down";
}) {
  const colorClass = tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
      <p className="text-[9px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500">
        {icon} {label}
      </p>
      {loading ? (
        <div className="mt-1.5 h-4 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <p className={`mt-0.5 truncate text-sm font-bold ${colorClass}`}>{value}</p>
      )}
      {!loading && sub && <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

export function AiReportModal({
  open,
  onClose,
  loading,
  analysis,
  logoUrl,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  analysis: AnalysisResponse | null;
  logoUrl?: string | null;
  companyName?: string;
}) {
  const symbol = analysis?.stock ?? null;
  const { performance, loading: perfLoading } = usePerformance(symbol);
  const { competitors, loading: competitorsLoading } = useCompetitors(symbol);

  const displayName = companyName ?? analysis?.stock;
  const rec = analysis ? recommendationBadge(analysis.recommendation) : null;
  const isAi = analysis?.source === "ai";
  const spread = bestAndWorstPeriod(performance);
  const rank = competitors ? competitors.peers.findIndex((p) => p.isSelf) + 1 : 0;

  // Identity (logo/symbol/name) and the headline call live in the sticky modal chrome, not the
  // scrolling body, so they stay visible the whole time you're reading the report — the same
  // pattern a macOS/iOS sheet uses for its title bar.
  const header = (
    <div className="flex items-center gap-3">
      <ModalLogo src={logoUrl} name={displayName ?? "?"} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase dark:text-slate-500">🤖 AI research report</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="truncate text-base font-bold text-slate-900 dark:text-white">
            {analysis?.stock ?? (loading ? "Researching…" : "Stock report")}
          </h4>
          {rec && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rec.className}`}>{rec.label}</span>}
          {performance?.capTier && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${capTierBadgeClass(performance.capTier)}`}>
              {performance.capTier} Cap
            </span>
          )}
          {performance?.assetType === "etf" && (
            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 uppercase dark:bg-violet-500/15 dark:text-violet-400">
              ETF
            </span>
          )}
        </div>
        {companyName && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{companyName}</p>}
      </div>
    </div>
  );

  // A stats dashboard, not a legal footnote: the four numbers a reader would otherwise have to
  // scroll back up to piece together from the Returns strip and Competitors panel, surfaced
  // right where they're deciding whether to keep reading — plus the provenance line underneath.
  const footer = analysis ? (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <FooterStat
          icon="🏆"
          label="Best period"
          value={spread ? `${spread.best.value >= 0 ? "+" : ""}${spread.best.value.toFixed(1)}%` : "—"}
          sub={spread?.best.label}
          loading={perfLoading}
          tone="up"
        />
        <FooterStat
          icon="📉"
          label="Weakest period"
          value={spread ? `${spread.worst.value >= 0 ? "+" : ""}${spread.worst.value.toFixed(1)}%` : "—"}
          sub={spread?.worst.label}
          loading={perfLoading}
          tone={spread && spread.worst.value < 0 ? "down" : undefined}
        />
        <FooterStat
          icon="📊"
          label="Overall"
          value={typeof performance?.overall === "number" ? `${performance.overall >= 0 ? "+" : ""}${performance.overall.toFixed(1)}%` : "—"}
          sub="Since earliest data"
          loading={perfLoading}
          tone={typeof performance?.overall === "number" ? (performance.overall >= 0 ? "up" : "down") : undefined}
        />
        <FooterStat
          icon="🏅"
          label="Sector rank"
          value={competitors && rank > 0 ? `#${rank} of ${competitors.peers.length}` : "—"}
          sub={competitors?.group}
          loading={competitorsLoading}
        />
        <FooterStat icon="🤖" label="AI score" value={`${analysis.score}/100`} loading={false} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
          <span className={`h-1.5 w-1.5 rounded-full ${isAi ? "bg-emerald-500" : "bg-amber-500"}`} />
          {isAi ? "AI-generated" : "Heuristic demo"} · prices via Yahoo Finance
        </span>
        <span>Educational research only, not investment advice.</span>
      </div>
    </div>
  ) : (
    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      Educational research only, not investment advice — always verify with your broker or a SEBI-registered advisor before trading.
    </p>
  );

  return (
    <AppleModal open={open} onClose={onClose} label={`${displayName ?? "Stock"} AI research report`} header={header} footer={footer}>
      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-emerald-500 dark:border-slate-700 dark:border-t-emerald-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Researching{companyName ? ` ${companyName}` : ""}…</p>
        </div>
      )}

      {!loading && analysis && (
        <AiAnalysisReport
          analysis={analysis}
          logoUrl={logoUrl}
          companyName={companyName}
          performance={performance}
          perfLoading={perfLoading}
          competitors={competitors}
          competitorsLoading={competitorsLoading}
        />
      )}

      {!loading && !analysis && (
        <p className="py-24 text-center text-sm text-slate-500 dark:text-slate-400">No report available for this stock yet.</p>
      )}
    </AppleModal>
  );
}
