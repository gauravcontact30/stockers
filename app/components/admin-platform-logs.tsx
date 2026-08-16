"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformLogSeverity } from "../lib/platform-logs";
import type { PlatformCoreLogCategory, PlatformDailyLogPoint, PlatformLogEntry, PlatformLogGroup, PlatformLogReport } from "../lib/platform-log-report";
import { authHeaders } from "./subscription-provider";

type FilterSeverity = PlatformLogSeverity | "all";
type FilterCategory = PlatformCoreLogCategory | "all";

const CATEGORY_OPTIONS: { key: FilterCategory; label: string }[] = [
  { key: "all", label: "All log types" },
  { key: "dashboard", label: "Subscribed User Dashboard Usability" },
  { key: "api", label: "Application API" },
  { key: "ai", label: "AI Feature Performance" },
  { key: "third-party", label: "Third-party Platforms" },
  { key: "data", label: "Data Fetching" },
  { key: "billing", label: "Billing" },
  { key: "security", label: "Security & Access" },
  { key: "system", label: "System" },
  { key: "audit", label: "Audit Trails" },
];

const DAILY_COLUMNS = CATEGORY_OPTIONS.filter((option): option is { key: PlatformCoreLogCategory; label: string } => option.key !== "all");

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
              {log.coreCategory}
            </span>
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
          <p className="mt-2 break-words text-xs text-slate-400 dark:text-slate-500">
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

function CategoryCard({ group }: { group: PlatformLogGroup }) {
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

      {group.logs.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {group.logs.slice(0, 5).map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
          No logs in this category for the current filters.
        </p>
      )}
    </section>
  );
}

function DailyTable({ rows }: { rows: PlatformDailyLogPoint[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Daily log volume</h2>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Stored by IST day</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1280px] w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              {["Day", "Logs", "Alerts", ...DAILY_COLUMNS.map((column) => column.label)].map((header) => (
                <th key={header} className="border-b border-slate-200 px-3 py-2 font-bold dark:border-slate-800">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{row.day}</td>
                <td className="px-3 py-2 tabular-nums">{row.logs}</td>
                <td className="px-3 py-2 tabular-nums text-amber-700 dark:text-amber-300">{row.alerts}</td>
                {DAILY_COLUMNS.map((column) => (
                  <td key={column.key} className="px-3 py-2 tabular-nums">
                    {row.byCategory[column.key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SnapshotList({
  title,
  description,
  logs,
  empty,
}: {
  title: string;
  description: string;
  logs: PlatformLogEntry[];
  empty: string;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {compactNumber(logs.length)} shown
        </span>
      </div>
      {logs.length > 0 ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {logs.slice(0, 6).map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {empty}
        </p>
      )}
    </section>
  );
}

export function AdminPlatformLogs() {
  const [days, setDays] = useState(1);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [severity, setSeverity] = useState<FilterSeverity>("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refreshTick, setRefreshTick] = useState(0);
  const [report, setReport] = useState<PlatformLogReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setInterval(() => setRefreshTick((value) => value + 1), report?.liveStream.intervalMs ?? 20_000);
    return () => window.clearInterval(handle);
  }, [report?.liveStream.intervalMs]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        days: String(days),
        category,
        severity,
        source,
        q: query,
        page: String(page),
        pageSize: String(pageSize),
      });

      fetch(`/api/admin/logs?${params.toString()}`, { headers: authHeaders(), signal: controller.signal })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error ?? "Couldn't load platform logs.");
          setReport(data as PlatformLogReport);
          setLastUpdated(new Date().toISOString());
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : "Couldn't reach the platform logs service.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? 250 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [category, days, page, pageSize, query, refreshTick, severity, source]);

  const sourceOptions = useMemo(() => {
    const options = new Set(report?.sourceOptions ?? []);
    if (source !== "all") options.add(source);
    return [...options].sort((a, b) => a.localeCompare(b));
  }, [report?.sourceOptions, source]);

  const resetPage = (apply: () => void) => {
    setPage(1);
    apply();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-white">Supabase stockersai_db</span> stores sanitized logs with a 25-day retention window.
        Super-admin RBAC is enforced by the page and API, and live updates use polling every {report ? Math.round(report.liveStream.intervalMs / 1000) : 20}s.
        Coverage includes dashboard usability, APIs, AI features, upstream data, billing, security and system housekeeping.
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Date range</span>
          <select value={days} onChange={(event) => resetPage(() => setDays(Number(event.target.value)))} className={FIELD_CLASS}>
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={25}>Last 25 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Log type</span>
          <select value={category} onChange={(event) => resetPage(() => setCategory(event.target.value as FilterCategory))} className={FIELD_CLASS}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Severity</span>
          <select value={severity} onChange={(event) => resetPage(() => setSeverity(event.target.value as FilterSeverity))} className={FIELD_CLASS}>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Origin</span>
          <select value={source} onChange={(event) => resetPage(() => setSource(event.target.value))} className={`${FIELD_CLASS} max-w-[220px]`}>
            <option value="all">All origins</option>
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => resetPage(() => setQuery(event.target.value))}
            placeholder="Search operation, path or message"
            className={`${FIELD_CLASS} w-full`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rows</span>
          <select value={pageSize} onChange={(event) => resetPage(() => setPageSize(Number(event.target.value)))} className={FIELD_CLASS}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setRefreshTick((value) => value + 1)}
          className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300"
        >
          Refresh
        </button>
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
            filtered rows: <span className="font-mono font-semibold text-slate-900 dark:text-white">{report.page.total}</span>
            {" / "}
            refreshed: <span className="font-semibold text-slate-900 dark:text-white">{lastUpdated ? when(lastUpdated) : "-"}</span>
          </div>

          <DailyTable rows={report.daily} />

          <div className="grid gap-5 xl:grid-cols-2">
            <SnapshotList
              title="Recent alerts"
              description="Warnings, errors and critical events from APIs, AI, upstream data, billing, security and system checks."
              logs={report.recentAlerts}
              empty="No recent warning, error or critical platform logs in this range."
            />
            <SnapshotList
              title="Star performer logs"
              description="Clean runs, successful fetches and healthy platform operations with no alert severity."
              logs={report.starPerformers}
              empty="No star performer logs match the current range."
            />
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Paginated logs</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Page {report.page.page} of {report.page.pageCount} / {compactNumber(report.page.total)} matching rows
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={report.page.page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!report.page.hasMore || loading}
                  onClick={() => setPage((value) => value + 1)}
                  className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>

            {report.page.logs.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {report.page.logs.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No logs match these filters.
              </p>
            )}
          </section>

          <div className="grid gap-5">
            {report.groups.map((group) => (
              <CategoryCard key={group.category} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
