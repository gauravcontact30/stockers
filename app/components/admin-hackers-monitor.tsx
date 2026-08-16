"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  blockThreatIpAction,
  exportSecurityThreatCsvAction,
  fetchSecurityThreatReportAction,
  flushSecurityThreatLogsAction,
} from "../actions/security-threats";
import type { SecurityThreatLog, SecurityThreatReport, ThreatCard, ThreatSeverity } from "../lib/security-threats";

const severityClass: Record<ThreatSeverity, string> = {
  red: "border-red-300 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100",
  orange: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100",
  yellow: "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-100",
};

function when(value: string | null): string {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function ThreatCardView({ card, onInspect, onBlock }: { card: ThreatCard; onInspect: (log: SecurityThreatLog) => void; onBlock: (card: ThreatCard) => void }) {
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${severityClass[card.severity]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{card.title}</h3>
          <p className="mt-1 text-xs opacity-75">{card.description}</p>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-bold tabular-nums dark:bg-black/20">{card.count}</span>
      </div>
      <dl className="mt-4 grid gap-2 text-xs">
        <div className="flex justify-between gap-3"><dt className="opacity-70">Last detected</dt><dd className="font-semibold">{when(card.lastDetectedAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="opacity-70">Source</dt><dd className="font-semibold">{card.geo} {card.sourceIp}</dd></div>
        <div className="flex justify-between gap-3"><dt className="opacity-70">Target</dt><dd className="font-semibold">{card.stockSymbol ?? card.route}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => card.latest && onInspect(card.latest)} disabled={!card.latest} className="rounded-full border border-current/20 bg-white/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/20">
          Inspect Payload
        </button>
        <button type="button" onClick={() => onBlock(card)} disabled={card.sourceIp === "none"} className="rounded-full border border-current/20 bg-white/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/20">
          Block IP
        </button>
      </div>
    </article>
  );
}

function Drawer({ log, onClose }: { log: SecurityThreatLog | null; onClose: () => void }) {
  if (!log) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">{log.title}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{log.sourceIp}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{when(log.at)} · {log.route}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button>
        </div>
        <div className="mt-6 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <section>
            <h3 className="font-semibold text-slate-950 dark:text-white">Request context</h3>
            <dl className="mt-2 grid gap-2 rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-900 sm:grid-cols-2">
              <div><dt className="text-slate-500 dark:text-slate-400">Source</dt><dd className="mt-1 font-semibold">{log.source}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Operation</dt><dd className="mt-1 font-semibold">{log.operation}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Method</dt><dd className="mt-1 font-semibold">{log.method ?? "-"}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd className="mt-1 font-semibold">{log.statusCode ?? "-"}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Duration</dt><dd className="mt-1 font-semibold">{log.durationMs === null ? "-" : `${log.durationMs}ms`}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">Stock symbol</dt><dd className="mt-1 font-semibold">{log.stockSymbol ?? "-"}</dd></div>
            </dl>
          </section>
          <section><h3 className="font-semibold text-slate-950 dark:text-white">Message</h3><p className="mt-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-900">{log.message}</p></section>
          <section><h3 className="font-semibold text-slate-950 dark:text-white">User agent</h3><p className="mt-2 break-words rounded-xl bg-slate-100 p-3 dark:bg-slate-900">{log.userAgent}</p></section>
          <section><h3 className="font-semibold text-slate-950 dark:text-white">Payload</h3><pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-900">{log.payload || "No payload captured."}</pre></section>
          <section>
            <h3 className="font-semibold text-slate-950 dark:text-white">Headers</h3>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-900">{JSON.stringify(log.headers, null, 2)}</pre>
          </section>
          <section>
            <h3 className="font-semibold text-slate-950 dark:text-white">Full sanitized metadata</h3>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-900">{JSON.stringify(log.metadata, null, 2)}</pre>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function AdminHackersMonitor({ initialReport }: { initialReport: SecurityThreatReport }) {
  const [report, setReport] = useState(initialReport);
  const [selected, setSelected] = useState<SecurityThreatLog | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(async () => setReport(await fetchSecurityThreatReportAction()));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const levelClass = report.threatLevel === "Critical" ? "bg-red-600 text-white" : report.threatLevel === "Medium" ? "bg-orange-500 text-white" : "bg-emerald-600 text-white";
  const threatRows = useMemo(() => report.logs, [report.logs]);

  const exportCsv = () => {
    startTransition(async () => {
      const csv = await exportSecurityThreatCsvAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `stockers-security-threats-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const flush = () => startTransition(async () => setReport(await flushSecurityThreatLogsAction()));
  const block = (card: ThreatCard) => startTransition(async () => {
    await blockThreatIpAction(card.sourceIp, `${card.title}: ${card.route}`);
    setReport(await fetchSecurityThreatReportAction());
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-rose-600 dark:text-rose-300">Super Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">App Hackers & Threat Monitor</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Showing all retained hacking and vulnerability signals across the last {report.days} days, including payload, headers, source IP, route, and status context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-4 py-2 text-sm font-bold ${levelClass}`}>{report.threatLevel}</span>
            <button type="button" onClick={flush} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Flush Logs</button>
            <button type="button" onClick={exportCsv} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Export CSV</button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.cards.map((card) => <ThreatCardView key={card.type} card={card} onInspect={setSelected} onBlock={block} />)}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Live hacker activity feed</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isPending ? "Refreshing..." : `${report.totalLogs} total threat logs - updated ${when(report.generatedAt)}`}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Threat</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Route / stock</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payload</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {threatRows.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{when(log.at)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{log.title}</td>
                  <td className="px-3 py-3">{log.geo} {log.sourceIp}</td>
                  <td className="px-3 py-3">
                    <span className="block font-semibold">{log.stockSymbol ?? "-"}</span>
                    <span className="block max-w-[220px] truncate text-xs text-slate-500 dark:text-slate-400">{log.route}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block font-semibold">{log.method ?? "-"} {log.statusCode ?? "-"}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{log.durationMs === null ? "-" : `${log.durationMs}ms`}</span>
                  </td>
                  <td className="max-w-[320px] px-3 py-3">
                    <code className="block truncate rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-950">{log.payload || log.message}</code>
                  </td>
                  <td className="px-3 py-3"><button type="button" onClick={() => setSelected(log)} className="text-sm font-semibold text-rose-600 dark:text-rose-300">Inspect</button></td>
                </tr>
              ))}
              {threatRows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">No hacking or vulnerability activity is currently retained.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Blocked IPs</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{report.blockedIps.length} blocked sources</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.blockedIps.map((ip) => (
            <article key={ip.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60">
              <p className="font-semibold text-slate-950 dark:text-white">{ip.ip}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ip.reason}</p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Blocked {when(ip.blockedAt)} by {ip.blockedBy}</p>
            </article>
          ))}
          {report.blockedIps.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No IPs blocked from this monitor yet.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">Missing database model</h2>
        <p className="mt-1">If <code>blocked_ips</code> is not present, apply this Supabase SQL. Security events reuse <code>platform_logs</code>.</p>
        <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-950">{report.schemaSql}</pre>
      </section>

      <Drawer log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
