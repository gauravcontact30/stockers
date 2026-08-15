"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformLogCategory, PlatformLogSeverity } from "../lib/platform-logs";
import type { PlatformLogEntry, PlatformLogGroup, PlatformLogReport } from "../lib/platform-log-report";
import { authHeaders } from "./subscription-provider";

type FilterSeverity = PlatformLogSeverity | "all";
type FilterCategory = PlatformLogCategory | "all";

const CATEGORY_OPTIONS: { key: FilterCategory; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "dashboard", label: "Dashboard usability" },
  { key: "api", label: "Application API" },
  { key: "ai", label: "AI features" },
  { key: "third-party", label: "Third-party platforms" },
  { key: "data", label: "Data fetching" },
  { key: "billing", label: "Billing" },
  { key: "security", label: "Security" },
  { key: "system", label: "System" },
];

const SEVERITY_OPTIONS: { key: FilterSeverity; label: string }[] = [
  { key: "all", label: "All severities" },
  { key: "star", label: "Star performer" },
  { key: "info", label: "Info" },
  { key: "warning", label: "Warning" },
  { key: "error", label: "Error" },
  { key: "critical", label: "Critical" },
];

const SEVERITY_TONE: Record<PlatformLogSeverity, string> = {
  star: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  error: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  critical: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
};

const FIELD_CLASS =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatMs(value: number | null): string {
  if (typeof value !== "number") return "-";
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}s`;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function severityLabel(value: PlatformLogSeverity): string {
  return value === "star" ? "Star" : value[0].toUpperCase() + value.slice(1);
}

function SeverityPill({ severity }: { severity: PlatformLogSeverity }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_TONE[severity]}`}>
      {severityLabel(severity)}
    </span>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function LogRow({ log }: { log: PlatformLogEntry }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={log.severity} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {log.source}
            </span>
            {log.statusCode !== null && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                HTTP {log.statusCode}
              </span>
            )}
            {log.durationMs !== null && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                {formatMs(log.durationMs)}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{log.operation}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{log.message}</p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {log.useCase}
            {log.path ? ` / ${log.method ?? "GET"} ${log.path}` : ""}
            {log.userEmail ? ` / ${log.userEmail}` : ""}
          </p>
        </div>
        <time className="shrink-0 text-xs font-semibold text-slate-400 dark:text-slate-500">{when(log.at)}</time>
      </div>
    </li>
  );
}

function CategoryCard({ group, severity }: { group: PlatformLogGroup; severity: FilterSeverity }) {
  const logs = severity === "all" ? group.logs : group.logs.filter((log) => log.severity === severity);
  const alertCount = group.counts.warning + group.counts.error + group.counts.critical;

  return (
    <section className={`rounded-3xl border p-5 ${group.tone}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{group.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{group.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm dark:bg-slate-950/70 dark:text-slate-300">
            {compactNumber(group.total)} logs
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm dark:bg-slate-950/70 dark:text-slate-300">
            p95 {formatMs(group.p95Ms)}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
              alertCount === 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}
          >
            {alertCount === 0 ? "No alerts" : `${alertCount} alerts`}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {(["star", "info", "warning", "error", "critical"] as const).map((key) => (
          <div key={key} className="rounded-2xl bg-white/75 p-3 text-center shadow-sm dark:bg-slate-950/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{severityLabel(key)}</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">{group.counts[key]}</p>
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {logs.slice(0, 5).map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </ul>

      {logs.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
          No logs in this category for the current filters.
        </p>
      )}
    </section>
  );
}

function CompactLogList({ title, logs, empty }: { title: string; logs: PlatformLogEntry[]; empty: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      {logs.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {logs.slice(0, 8).map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminPlatformLogs() {
  const [days, setDays] = useState(7);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [severity, setSeverity] = useState<FilterSeverity>("all");
  const [report, setReport] = useState<PlatformLogReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/admin/platform-logs?days=${days}`, { headers: authHeaders(), signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Couldn't load platform logs.");
        setReport(data as PlatformLogReport);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Couldn't reach the platform logs service.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [days]);

  const groups = useMemo(() => {
    const base = report?.groups ?? [];
    return category === "all" ? base : base.filter((group) => group.category === category);
  }, [category, report]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Window</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={FIELD_CLASS}>
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={25}>Last 25 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as FilterCategory)} className={FIELD_CLASS}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Severity</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as FilterSeverity)} className={FIELD_CLASS}>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      {loading && !report && <p className="text-sm text-slate-500 dark:text-slate-400">Loading platform logs...</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total logs" value={compactNumber(report.totals.logs)} hint={`${report.range.from} to ${report.range.to}`} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            <StatCard label="Star performers" value={compactNumber(report.totals.star)} hint="Clean runs without errors or alerts" tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" />
            <StatCard label="Alerts" value={compactNumber(report.totals.alerts)} hint={`${report.totals.errors + report.totals.critical} errors or critical`} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
            <StatCard label="Slow logs" value={compactNumber(report.totals.slow)} hint="Entries at or above 5 seconds" tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Backend: <span className="font-semibold text-slate-900 dark:text-white">{report.backend}</span>
            {report.processLocal ? " / current process memory only" : " / stockersai_db Supabase durable store"}
            {" / "}
            held rows: <span className="font-mono font-semibold text-slate-900 dark:text-white">{report.held}</span>
            {" / "}
            retention: <span className="font-semibold text-slate-900 dark:text-white">25 days</span>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <CompactLogList title="Recent alerts" logs={report.recentAlerts} empty="No warning, error or critical logs in this window." />
            <CompactLogList title="Star performer logs" logs={report.starPerformers} empty="No clean star performer logs in this window." />
          </div>

          <div className="grid gap-5">
            {groups.map((group) => (
              <CategoryCard key={group.category} group={group} severity={severity} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
