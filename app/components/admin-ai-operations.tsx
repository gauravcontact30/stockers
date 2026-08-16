"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiCallRecord, AiUsageReport, AiUsageSlice } from "../lib/ai-usage-report";
import { DataTable, type Column } from "./data-table";
import { StatTile } from "./stat-tile";
import { authHeaders } from "./subscription-provider";

/**
 * What the model has actually been doing.
 *
 * Every other panel in this dashboard reports on people — who visited, who paid, who is on the site
 * now. This one reports on the thing the product is built out of, and it exists because that was
 * the one dependency nobody could see. The app degrades so gracefully when OpenRouter is refusing
 * requests — every board still renders, composed from its own measured figures — that a total
 * outage looks exactly like a quiet afternoon from every screen in it, including this dashboard,
 * which until now could say only whether a key was set.
 *
 * So the headline here is the fallback rate rather than an error count: the question is not "how
 * many requests 500'd" but "how often did a reader get the composed read instead of the written
 * one", and a model that answers promptly with prose where JSON was asked for fails that test just
 * as completely as one that times out.
 */

/** The report, plus what the deployment is configured to do — see the route. */
export type AiUsageState = AiUsageReport & { configured: boolean; model: string | null };

/** The windows offered, matching `RANGE_OPTIONS` on the route. */
const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

/**
 * How often the panel re-reads.
 *
 * Slower than the overview's health probe: this aggregates every call in the window rather than
 * pinging a table, and an operator watching a model outage is watching something that changes over
 * minutes rather than seconds.
 */
export const REFRESH_MS = 60_000;

/** Above this share of fallbacks, something is wrong rather than merely imperfect. */
const BAD_FALLBACK_RATE = 20;
/** Below this, the odd unusable reply is normal for a language model and not worth alarming over. */
const OK_FALLBACK_RATE = 5;

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";

/** A duration at the resolution it is read at. */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * Money, at a precision that suits the amount.
 *
 * Individual calls here cost small fractions of a cent, so a spend of $0.0042 rendered to two
 * places is "$0.00" — a figure that reads as "nothing was spent" when something was.
 */
export function formatUsd(value: number): string {
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

/** Thousands separated, because token counts run to six digits. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

/** The tone a fallback rate is worth showing in. */
export function rateTone(rate: number): string {
  if (rate >= BAD_FALLBACK_RATE) return "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10";
  if (rate > OK_FALLBACK_RATE) return "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10";
  return "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10";
}

/**
 * The one sentence an operator opens this page for.
 *
 * Separated from the rendering so the wording is testable on its own — this is the line that
 * decides whether somebody goes looking for a problem, and it has to be right in each of the four
 * states rather than approximately right in the common one.
 */
export function verdictOf(report: AiUsageState): { headline: string; detail: string; tone: string } {
  if (!report.configured) {
    return {
      headline: "No model is configured",
      detail:
        "OPENROUTER_API_KEY is not set, so every AI panel on the site is composing its read from its own measured figures and saying so. Nothing is broken and nothing is being spent.",
      tone: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60",
    };
  }

  if (report.counts.total === 0) {
    return {
      headline: "Nothing has been asked of the model",
      detail: `No call was made in the last ${report.days === 1 ? "day" : `${report.days} days`}. Either nobody opened an AI panel, or this instance has only just started.`,
      tone: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60",
    };
  }

  if (report.fallbackRate >= BAD_FALLBACK_RATE) {
    return {
      headline: `${report.fallbackRate}% of reads fell back to composed figures`,
      detail:
        "Readers on those calls saw a panel assembled from the measured numbers rather than one written by the model. The panel looks normal to them, so this is not visible anywhere else. Check the failures below.",
      tone: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10",
    };
  }

  if (report.fallbackRate > OK_FALLBACK_RATE) {
    return {
      headline: `The model is answering, with ${report.fallbackRate}% falling back`,
      detail: "Some share of reads are composed rather than written. Worth watching rather than acting on.",
      tone: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
    };
  }

  return {
    headline: "The model is answering",
    detail: `${formatCount(report.counts.ok)} of ${formatCount(report.counts.total)} calls produced a written read, at a median of ${formatMs(report.latency.p50)}.`,
    tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
  };
}

/**
 * Calls per day, with the share that fell back stacked on top.
 *
 * Inline rather than a charting dependency: this is two stacked rectangles per day, and the shape
 * of the fallback band over a week is the whole point — a steady sliver is a language model being
 * a language model, a block that starts on Tuesday is an outage with a date on it.
 */
function DailyBars({ report }: { report: AiUsageState }) {
  const tallest = Math.max(...report.daily.map((point) => point.counts.total), 1);

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 96 }}>
        {report.daily.map((point) => {
          const fell = point.counts.total - point.counts.ok;
          const height = (point.counts.total / tallest) * 100;

          return (
            <div
              key={point.day}
              className="flex flex-1 flex-col justify-end"
              style={{ height: "100%" }}
              title={`${point.day}: ${point.counts.total} calls, ${fell} fell back`}
            >
              <div className="flex flex-col-reverse rounded-t bg-emerald-500/80" style={{ height: `${height}%` }}>
                <div
                  className="rounded-t bg-rose-500/80"
                  style={{ height: point.counts.total === 0 ? "0%" : `${(fell / point.counts.total) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{report.daily[0]?.day}</span>
        <span>{report.daily[report.daily.length - 1]?.day}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">Green</span> is a written read,{" "}
        <span className="font-bold text-rose-600 dark:text-rose-400">red</span> a composed one.
      </p>
    </div>
  );
}

/** The columns shared by the per-call-site and per-model tables. */
function sliceColumns(header: string): Column<AiUsageSlice>[] {
  return [
    {
      key: "label",
      header,
      cell: (slice) => <span className="font-semibold text-slate-900 dark:text-white">{slice.label}</span>,
      sortValue: (slice) => slice.label,
    },
    { key: "calls", header: "Calls", align: "right", cell: (slice) => slice.counts.total, sortValue: (slice) => slice.counts.total, className: "tabular-nums" },
    {
      key: "fallback",
      header: "Fell back",
      align: "right",
      cell: (slice) => (
        <span className={slice.fallbackRate >= BAD_FALLBACK_RATE ? "font-bold text-rose-600 dark:text-rose-400" : "font-semibold"}>
          {slice.fallbackRate}%
        </span>
      ),
      sortValue: (slice) => slice.fallbackRate,
      className: "tabular-nums",
    },
    { key: "p50", header: "Median", align: "right", cell: (slice) => formatMs(slice.latency.p50), sortValue: (slice) => slice.latency.p50, className: "tabular-nums" },
    { key: "p95", header: "p95", align: "right", cell: (slice) => formatMs(slice.latency.p95), sortValue: (slice) => slice.latency.p95, className: "tabular-nums" },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      cell: (slice) => formatCount(slice.promptTokens + slice.completionTokens),
      sortValue: (slice) => slice.promptTokens + slice.completionTokens,
      className: "tabular-nums",
    },
    { key: "cost", header: "Spend", align: "right", cell: (slice) => formatUsd(slice.costUsd), sortValue: (slice) => slice.costUsd, className: "tabular-nums" },
  ];
}

const FAILURE_COLUMNS: Column<AiCallRecord>[] = [
  {
    key: "at",
    header: "When",
    cell: (call) => new Date(call.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
    sortValue: (call) => call.at,
    className: "whitespace-nowrap",
  },
  { key: "feature", header: "Call site", cell: (call) => call.feature, sortValue: (call) => call.feature },
  {
    key: "outcome",
    header: "Outcome",
    cell: (call) => call.outcome,
    sortValue: (call) => call.outcome,
  },
  { key: "status", header: "Status", align: "right", cell: (call) => call.status ?? "—", sortValue: (call) => call.status, className: "tabular-nums" },
  { key: "ms", header: "Took", align: "right", cell: (call) => formatMs(call.ms), sortValue: (call) => call.ms, className: "tabular-nums" },
  {
    key: "error",
    header: "Reason",
    cell: (call) => <span className="text-slate-500 dark:text-slate-400">{call.error ?? "The reply could not be used."}</span>,
  },
];

export function AdminAiOperations() {
  const [days, setDays] = useState(1);
  const [report, setReport] = useState<AiUsageState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const response = await fetch(`/api/admin/ai-usage?days=${days}`, { headers: authHeaders(), signal });
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as AiUsageState;
        // Checked for shape before it is kept: a route behind a proxy that answers with a login
        // page would otherwise reach the panel as an object with none of the fields it reads.
        if (!data || !Array.isArray(data.daily)) throw new Error("unusable");
        setReport(data);
        setError(null);
      } catch {
        if (!signal.aborted) setError("Couldn't read the AI usage store.");
      }
    },
    [days],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Off the effect body rather than in it, as on the live-users panel: `load` reaches a setState
    // on a path the compiler cannot see past, and setting state synchronously while an effect runs
    // is a cascading render. One microtask later it is an ordinary callback.
    queueMicrotask(() => void load(controller.signal));

    const refresh = () => {
      // Nobody is reading this in a background tab, and a dashboard left open overnight should not
      // spend the night aggregating.
      if (document.visibilityState === "hidden") return;
      void load(controller.signal);
    };

    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const featureColumns = useMemo(() => sliceColumns("Call site"), []);
  const modelColumns = useMemo(() => sliceColumns("Model"), []);

  const ranges = (
    <div className="flex flex-wrap gap-2">
      {RANGES.map((range) => (
        <button
          key={range.days}
          type="button"
          aria-pressed={days === range.days}
          onClick={() => setDays(range.days)}
          className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${
            days === range.days
              ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-950"
              : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {ranges}
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col gap-4">
        {ranges}
        <p className="text-sm text-slate-500 dark:text-slate-400">Reading what the model has been doing…</p>
      </div>
    );
  }

  const verdict = verdictOf(report);
  const tokens = report.promptTokens + report.completionTokens;

  return (
    <div className="flex flex-col gap-5">
      {ranges}

      <section className={`rounded-3xl border p-6 ${verdict.tone}`}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{verdict.headline}</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">{verdict.detail}</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Model calls"
          value={formatCount(report.counts.total)}
          hint={report.model ?? "No model configured"}
          tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
        <StatTile
          label="Fell back"
          value={`${report.fallbackRate}%`}
          hint={`${formatCount(report.counts.total - report.counts.ok)} composed instead of written`}
          tone={rateTone(report.fallbackRate)}
        />
        <StatTile
          label="Median"
          value={formatMs(report.latency.p50)}
          hint={`p95 ${formatMs(report.latency.p95)} · slowest ${formatMs(report.latency.max)}`}
          tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10"
        />
        <StatTile
          label="Spend"
          value={formatUsd(report.costUsd)}
          // The figure has to say what it covers: OpenRouter does not report a cost on every call,
          // and a total that quietly omitted some would read as the whole bill.
          hint={`Reported on ${formatCount(report.costedCalls)} of ${formatCount(report.counts.total)} calls`}
          tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10"
        />
        <StatTile
          label="Tokens"
          value={formatCount(tokens)}
          hint={`${formatCount(report.promptTokens)} in · ${formatCount(report.completionTokens)} out`}
          tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
        />
      </div>

      {report.processLocal && (
        <p className="rounded-2xl border border-dashed border-amber-300 p-4 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:text-amber-300">
          These figures are this server instance&apos;s own records, held in memory. On a serverless host the calls
          other instances made are not in them, and a restart clears what is here. Apply{" "}
          <code className="font-mono">supabase/schema.sql</code> to keep a durable, deployment-wide history.
        </p>
      )}

      <section className={CARD}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Calls per day</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Every day in the window, whether or not anything was asked on it.
        </p>
        <DailyBars report={report} />
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">By research surface</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Which part of the product is asking, what it costs and how often its readers get the composed read instead.
        </p>
        <DataTable
          rows={report.features}
          columns={featureColumns}
          rowKey={(slice) => slice.key}
          caption="Model calls by research surface"
          searchFields={(slice) => [slice.label]}
          searchPlaceholder="Search a call site"
          pageSize={10}
          minWidth={760}
          initialSort={{ column: "calls", direction: "desc" }}
          empty="No call site matches these filters."
        />
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">By model</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          What each model was asked to do, and what it charged for it.
        </p>
        <DataTable
          rows={report.models}
          columns={modelColumns}
          rowKey={(slice) => slice.key}
          caption="Model calls by model"
          pageSize={5}
          minWidth={760}
          initialSort={{ column: "calls", direction: "desc" }}
          empty="No model matches these filters."
        />
      </section>

      {report.recentFailures.length > 0 && (
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent fallbacks</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
            The calls whose readers got a composed read, newest first. A refused request carries its status; a reply
            that arrived but could not be used carries none, because nothing went wrong at the HTTP level.
          </p>
          <DataTable
            rows={report.recentFailures}
            columns={FAILURE_COLUMNS}
            rowKey={(call) => call.id}
            caption="Model calls that fell back to a composed read"
            searchFields={(call) => [call.feature, call.outcome, call.error]}
            searchPlaceholder="Search a call site or reason"
            pageSize={10}
            minWidth={820}
            empty="No fallback matches these filters."
          />
        </section>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Read from {report.backend === "supabase" ? "the ai_calls table" : "this instance's memory"} and refreshed every{" "}
        {Math.round(REFRESH_MS / 1_000)} seconds. Prompts and completions are never recorded — only what each call cost,
        how long it took and whether it could be used.
      </p>
    </div>
  );
}
