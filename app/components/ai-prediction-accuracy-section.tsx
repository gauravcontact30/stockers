"use client";

import { useCallback, useEffect, useState } from "react";
import type { BseAiPredictionAccuracy, PredictionPerformance } from "../lib/bse-ai-prediction-accuracy";
import { CategoryIcon } from "./category-icon";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatQuantity, formatRupee, formatSignedPercent, sectorTone, toneFor } from "./market-format";
import { MarketSection, SectionError, SectionFootnote, SectionSkeleton } from "./market-section";

const ENDPOINT = "/api/predictions/bse-accuracy";
const REFRESH_MS = 60_000;
const PAGE_SIZE = 5;
const CAP_TIERS = ["Large", "Mid", "Small"] as const;
type CapTier = (typeof CAP_TIERS)[number];

const RANK_PILLS = {
  predicted: [
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  ],
  actual: [
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  ],
};

function rankText(row: PredictionPerformance) {
  if (row.matchedActualRank === null) return "No top-10 match";
  if (row.rankDifference === 0) return `Exact rank #${row.matchedActualRank}`;
  return `Actual rank #${row.matchedActualRank}`;
}

function rowSourceText(row: PredictionPerformance) {
  if (row.live && row.asOf) {
    return `Live ${new Date(row.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return row.priceSource === "BSE Bhavcopy" ? "Official BSE session" : row.priceSource;
}

function sectorName(row: PredictionPerformance) {
  return row.sector || "unclassified";
}

function capName(row: PredictionPerformance) {
  return row.capTier ?? "Unclassified";
}

function rankPillTone(side: "predicted" | "actual", rank: number) {
  const tones = RANK_PILLS[side];
  return tones[(Math.max(rank, 1) - 1) % tones.length];
}

function matchesSearch(row: PredictionPerformance, query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [row.symbol, row.stockName, sectorName(row), capName(row)].some((value) => value.toLowerCase().includes(term));
}

function averageConfidence(rows: PredictionPerformance[]) {
  const values = rows.map((row) => row.confidence).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function averageMove(rows: PredictionPerformance[]) {
  if (rows.length === 0) return 0;
  return rows.reduce((total, row) => total + (row.changePercent ?? 0), 0) / rows.length;
}

function formatTurnover(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${formatRupee(value, value >= 100 ? 0 : 1)} Cr`;
}

function scoreRows(predicted: PredictionPerformance[], actual: PredictionPerformance[]) {
  const actualSymbols = new Set(actual.map((row) => row.symbol));
  const matched = predicted.filter((row) => actualSymbols.has(row.symbol)).length;
  const total = predicted.length || 1;
  return { matched, total: predicted.length, percent: Math.round((matched / total) * 100) };
}

function rowsForCap(rows: PredictionPerformance[], cap: CapTier) {
  return rows.filter((row) => row.capTier === cap);
}

function capRowsFrom(
  groups: BseAiPredictionAccuracy["predictionsByCap"] | BseAiPredictionAccuracy["actualTopByCap"] | undefined,
  fallback: PredictionPerformance[],
  cap: CapTier,
) {
  return groups?.[cap] ?? rowsForCap(fallback, cap);
}

function StockLine({ row, side }: { row: PredictionPerformance; side: "predicted" | "actual" }) {
  const matched = row.matchedActualRank !== null;
  const isPredicted = side === "predicted";
  const sector = sectorName(row);
  const metrics = [
    { label: row.live ? "Live price" : "Last price", value: formatRupee(row.price), tone: "text-slate-900 dark:text-white" },
    { label: "Move", value: formatSignedPercent(row.changePercent), tone: toneFor(row.changePercent) },
    { label: "Low / high", value: `${formatRupee(row.dayLow)} / ${formatRupee(row.dayHigh)}`, tone: "text-slate-700 dark:text-slate-200" },
    { label: "Volume", value: formatQuantity(row.volume), tone: "text-slate-700 dark:text-slate-200" },
    { label: "Turnover", value: formatTurnover(row.turnoverCr), tone: "text-slate-700 dark:text-slate-200" },
  ];

  return (
    <li
      className={`rounded-xl border px-2.5 py-2 ${
        matched
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex w-9 shrink-0 flex-col items-center gap-1">
          <CompanyLogo symbol={row.symbol} size={32} preferReal />
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${rankPillTone(side, row.rank)}`}>
            #{row.rank}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{row.symbol}</p>
            {matched && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Matched
              </span>
            )}
            {isPredicted && typeof row.confidence === "number" && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {row.confidence}%
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                row.live
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                  : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}
              title={rowSourceText(row)}
            >
              {row.live ? "Live" : "BSE"}
            </span>
          </div>
          <p className="truncate text-xs leading-5 text-slate-500 dark:text-slate-400">{row.stockName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${sectorTone(sector)}`}>
              <CategoryIcon category={sector} className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[8rem] truncate">{sector}</span>
            </span>
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              {capName(row)} cap
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {formatRupee(row.price)}
            </span>
            {isPredicted && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chipFor(row.changePercent)}`}>
                {rankText(row)}
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950/70">
                <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{metric.label}</dt>
                <dd className={`mt-0.5 truncate text-[11px] font-black tabular-nums ${metric.tone}`}>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-sm font-black tabular-nums ${toneFor(row.changePercent)}`}>{formatSignedPercent(row.changePercent)}</p>
          <p className={`text-[11px] font-semibold tabular-nums ${toneFor(row.change)}`}>{formatRupee(row.change)}</p>
        </div>
      </div>
    </li>
  );
}

function ListCard({
  title,
  blurb,
  rows,
  empty,
  side,
  cap,
  onCapChange,
}: {
  title: string;
  blurb: string;
  rows: PredictionPerformance[];
  empty: string;
  side: "predicted" | "actual";
  cap: CapTier;
  onCapChange: (cap: CapTier) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filteredRows = rows.filter((row) => matchesSearch(row, query));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = filteredRows.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + PAGE_SIZE, filteredRows.length);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50" aria-label={title}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{blurb}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
          Cap
          <select
            value={cap}
            aria-label={`${title} cap filter`}
            onChange={(event) => {
              setPage(1);
              onCapChange(event.target.value as CapTier);
            }}
            className="bg-transparent text-[10px] font-black outline-none"
          >
            {CAP_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          aria-label={`${title} search filter`}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search stock or sector"
          className="h-8 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPage(1);
          }}
          disabled={!query}
          className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          Clear filter
        </button>
      </div>

      {pageRows.length > 0 ? (
        <ol className="space-y-2">
          {pageRows.map((row) => (
            <StockLine key={`${side}-${row.symbol}-${row.rank}`} row={row} side={side} />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
          {query ? "No stock matches this filter." : empty}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <span>
          Showing {showingFrom}-{showingTo} of {filteredRows.length} real rows
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Prev
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            Page {currentPage}/{pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage === pageCount}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function metaLabel(data: BseAiPredictionAccuracy | null) {
  if (!data) return "Loading AI accuracy";
  if (data.status === "not-generated") return "No locked prediction today";
  if (data.persistedSession) return "Market close snapshot";
  return `${data.accuracy.matched}/${data.accuracy.total} matched`;
}

function SummaryCard({
  label,
  value,
  detail,
  foot,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  foot: string;
  tone: "sky" | "violet" | "emerald";
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300",
    violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
  };

  return (
    <div className={`rounded-2xl border p-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold">{detail}</p>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{foot}</p>
    </div>
  );
}

export function AiPredictionAccuracySection() {
  const [data, setData] = useState<BseAiPredictionAccuracy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [predictedCap, setPredictedCap] = useState<CapTier>("Large");
  const [actualCap, setActualCap] = useState<CapTier>("Large");

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error("Request failed");
      setData((await response.json()) as BseAiPredictionAccuracy);
      setError(null);
    } catch {
      setError("Couldn't reach the BSE AI prediction accuracy feed right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const predictedRows = data?.predictions ?? [];
  const actualRows = data?.actualTop ?? [];
  const predictedCapRows = capRowsFrom(data?.predictionsByCap, predictedRows, predictedCap);
  const actualCapRows = capRowsFrom(data?.actualTopByCap, actualRows, actualCap);
  const selectedScore = scoreRows(predictedCapRows, actualCapRows);
  const selectedAccuracy = predictedCap === actualCap ? data?.accuracyByCap?.[predictedCap] ?? selectedScore : selectedScore;
  const aiScore = averageConfidence(predictedCapRows);
  const realMarketMove = averageMove(actualCapRows);

  return (
    <MarketSection
      id="ai-prediction-accuracy"
      eyebrow="AI prediction accuracy"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="Locked AI picks versus real BSE top performers"
      blurb="Before the 9:15 AM IST open, the AI locks BSE-listed stocks from positive market coverage. During the session, this section refreshes live market-backed prices and compares those locked picks with the actual top performers."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
          {data?.status === "locked" ? `${data.accuracy.percent}% accurate` : metaLabel(data)}
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-20" />}

      {!loading && data && (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SummaryCard
              label="Lock status"
              value={data.persistedSession ? "Last session saved" : data.status === "locked" ? "Locked for today" : "No locked picks"}
              detail={
                data.status === "locked"
                  ? `${predictedCapRows.length}/10 locked ${predictedCap} cap stocks`
                  : "No real pre-open AI lock exists for this trading date"
              }
              foot={data.persistedSession ? "Persists after 3:30 PM IST" : "Cutoff: 9:15 AM IST"}
              tone="sky"
            />
            <SummaryCard
              label="Prediction engine"
              value={data.source === "ai" ? data.model ?? "AI model" : data.source === "heuristic" ? "Fallback heuristic" : "Waiting for lock"}
              detail={aiScore > 0 ? `AI score: ${aiScore}% confidence` : "AI score appears after real picks are locked"}
              foot={`Real market avg move: ${formatSignedPercent(realMarketMove)}`}
              tone="violet"
            />
            <SummaryCard
              label="Accuracy check"
              value={`${selectedAccuracy.percent}% score`}
              detail={`${selectedAccuracy.matched}/${selectedAccuracy.total} locked AI picks matched real movers`}
              foot={`AI ${predictedCap} cap vs market ${actualCap} cap`}
              tone="emerald"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <ListCard
              title="AI locked picks before open"
              blurb="The stock list is fixed for the day; only live price, move and return fields refresh."
              rows={predictedCapRows}
              empty={data.message}
              side="predicted"
              cap={predictedCap}
              onCapChange={setPredictedCap}
            />
            <ListCard
              title="Actual top performers live today"
              blurb={data.persistedSession ? "Showing the saved market-close performers until the next session begins." : "This list can change during the session as live market performance changes."}
              rows={actualCapRows}
              empty={`No ${actualCap} cap row is present in the current real top performers feed.`}
              side="actual"
              cap={actualCap}
              onCapChange={setActualCap}
            />
          </div>
        </>
      )}

      <SectionFootnote>
        Predictions are experimental and not financial advice. Live prices and returns are never generated by AI; they come from the app&apos;s BSE market feed and are refreshed every minute.
      </SectionFootnote>
    </MarketSection>
  );
}
