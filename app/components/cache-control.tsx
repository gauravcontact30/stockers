"use client";

/**
 * Cache Control.
 *
 * This page used to be five checkboxes and a Purge button, which meant the operator who arrived at
 * it because "the BSE numbers look wrong" had no way to answer the question they came with. The
 * only move available was to drop everything and hope — and dropping everything costs real seconds,
 * because refilling the scrip master is a five-thousand-row parse and refilling the pulse tape is
 * the better part of eight.
 *
 * So the order of the page is the order of the decision: what is held, what the advisor makes of
 * it, then the controls. Purging is still one click for someone who already knows what they want;
 * it is just no longer the only thing on offer.
 *
 * Three things here are worth knowing:
 *
 *   * Every figure describes *the instance that answered*, not the fleet. A serverless deployment
 *     runs several and each holds its own memory. The panel says so rather than implying a
 *     completeness it cannot have.
 *   * Warming is offered beside purging because they are two halves of one action. A purge alone
 *     moves the refill cost onto the next visitor; purge-and-warm pays it here, now, on the
 *     operator's own clock.
 *   * The advisor never decides anything. It phrases a recommendation computed from the figures —
 *     see the header of `../lib/cache-advisor`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CacheEntryReport, CacheState, CacheTag } from "../lib/cache";
import type { CacheAdvice } from "../lib/cache-advisor";
import type { CacheReport } from "../lib/cache-report";
import { DataTable, type Column, type TableFilter } from "./data-table";
import { authHeaders } from "./subscription-provider";

type InventoryRow = CacheEntryReport & { label: string };
type Report = CacheReport & { note?: string };

type PurgeResult = {
  revalidated?: CacheTag[];
  purgedKeys?: string[];
  alsoRevalidated?: CacheTag[];
  warmed?: { key: string; ok: boolean; error?: string }[];
  at?: string;
};

/** How often the inventory re-reads itself. Ages move in real time; a frozen table would mislead. */
const POLL_MS = 20_000;

const STATE_TONE: Record<CacheState, string> = {
  fresh: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  stale: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  expired: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  empty: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATE_LABEL: Record<CacheState, string> = {
  fresh: "Fresh",
  stale: "Stale",
  expired: "Expired",
  empty: "Empty",
};

/** What each state means, said once here rather than guessed at by whoever reads the table. */
const STATE_MEANING: Record<CacheState, string> = {
  fresh: "Within its window. Served straight from memory.",
  stale: "Past its window, still served, refreshing behind the reader.",
  expired: "Too old to stand behind. The next reader waits for the upstream.",
  empty: "Nothing held — never loaded in this instance, or purged since.",
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * How far through its life a value is, as a fraction, capped at 1.
 *
 * Shown as a bar because "9m old" means nothing without "out of a 10m window" beside it — the same
 * age is unremarkable for the scrip master and alarming for the tape.
 */
export function lifeFraction(entry: Pick<CacheEntryReport, "ageMs" | "ttlMs">): number {
  if (entry.ageMs === null || entry.ttlMs <= 0) return 0;
  return Math.min(1, entry.ageMs / entry.ttlMs);
}

const BUTTON =
  "rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BUTTON =
  "rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

function StateChip({ state }: { state: CacheState }) {
  return (
    <span title={STATE_MEANING[state]} className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_TONE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

export function CacheControl() {
  const [report, setReport] = useState<Report | null>(null);
  const [selected, setSelected] = useState<CacheTag[]>([]);
  const [advice, setAdvice] = useState<CacheAdvice | null>(null);
  const [advising, setAdvising] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/cache", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't read the cache inventory.");
        return;
      }
      setReport(data as Report);
      setError(null);
    } catch {
      setError("Couldn't reach the cache endpoint.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount plus a poll; every setState runs after the request resolves, not synchronously here.
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const families = useMemo(() => report?.families ?? [], [report]);
  const rows = useMemo(() => (report?.entries ?? []) as InventoryRow[], [report]);

  const toggle = (tag: CacheTag) => {
    setSelected((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  /**
   * One request for every shape of purge.
   *
   * Naming keys and naming families are mutually exclusive on the server — a key purge that fell
   * through to the family default would drop everything — so the caller passes one or the other.
   */
  const send = useCallback(
    async (body: { tags?: CacheTag[]; keys?: string[]; warm?: string[] }, describe: (result: PurgeResult) => string, token: string) => {
      setBusy(token);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch("/api/admin/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data?.error ?? "Cache purge was refused.");
          return;
        }
        setMessage(describe(data as PurgeResult));
        // The inventory the operator is looking at is now wrong in exactly the way they just made
        // it wrong, so it is re-read rather than left until the next poll.
        await load();
      } catch {
        setError("Couldn't reach the cache endpoint.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  /** The expensive feeds inside the selected families — the ones worth refilling by hand. */
  const warmableFor = useCallback(
    (tags: CacheTag[]) =>
      rows
        .filter((row) => row.tags.some((tag) => tags.includes(tag)) && row.ttlMs >= 5 * 60_000)
        .map((row) => row.key),
    [rows],
  );

  const purgeFamilies = (warm: boolean) => {
    const tags = selected.length > 0 ? selected : families.map((family) => family.tag);
    void send(
      { tags, ...(warm ? { warm: warmableFor(tags) } : {}) },
      (result) => {
        const cleared = result.revalidated?.join(", ") || "all families";
        const warmed = result.warmed?.filter((entry) => entry.ok).length ?? 0;
        const failed = result.warmed?.filter((entry) => !entry.ok) ?? [];
        return [
          `Cleared ${cleared}.`,
          warm ? `Warmed ${warmed} feed${warmed === 1 ? "" : "s"}.` : "",
          failed.length > 0 ? `${failed.length} failed to reload: ${failed.map((entry) => entry.key).join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
      },
      warm ? "purge-warm" : "purge",
    );
  };

  const purgeKey = (key: string) =>
    void send({ keys: [key] }, (result) => (result.purgedKeys?.length ? `Dropped ${key}.` : `${key} was already empty.`), `key:${key}`);

  const warmKey = (key: string) =>
    void send({ keys: [key], warm: [key] }, (result) => {
      const entry = result.warmed?.find((item) => item.key === key);
      return entry?.ok ? `Reloaded ${key}.` : `${key} failed to reload: ${entry?.error ?? "no loader answered"}.`;
    }, `key:${key}`);

  const askAdvisor = async () => {
    setAdvising(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/cache/advice", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "The advisor couldn't be reached.");
        return;
      }
      setAdvice(data as CacheAdvice);
    } catch {
      setError("The advisor couldn't be reached.");
    } finally {
      setAdvising(false);
    }
  };

  const columns = useMemo<Column<InventoryRow>[]>(
    () => [
      {
        key: "feed",
        header: "Feed",
        sortValue: (row) => row.label,
        cell: (row) => (
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{row.label}</p>
            <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{row.key}</p>
          </div>
        ),
      },
      {
        key: "family",
        header: "Family",
        sortValue: (row) => row.tags.join(","),
        cell: (row) => (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {row.tags.length > 0 ? row.tags.join(" · ") : "—"}
          </span>
        ),
      },
      {
        key: "state",
        header: "State",
        sortValue: (row) => row.state,
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <StateChip state={row.state} />
            {row.refreshing && (
              <span title="A background refresh is running" className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
            )}
          </span>
        ),
      },
      {
        key: "age",
        header: "Age / TTL",
        align: "right",
        // Null ages sort last either way, which is right: an empty feed has no age to compare.
        sortValue: (row) => row.ageMs,
        cell: (row) => (
          <div className="min-w-23">
            <p className="tabular-nums text-slate-700 dark:text-slate-300">
              {formatAge(row.ageMs)} <span className="text-slate-400 dark:text-slate-500">/ {formatAge(row.ttlMs)}</span>
            </p>
            <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <span
                className={`block h-full rounded-full ${row.state === "expired" ? "bg-rose-500" : row.state === "stale" ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.round(lifeFraction(row) * 100)}%` }}
              />
            </span>
          </div>
        ),
      },
      {
        key: "bytes",
        header: "Size",
        align: "right",
        sortValue: (row) => row.bytes,
        cell: (row) => <span className="tabular-nums">{formatBytes(row.bytes)}</span>,
      },
      {
        key: "persist",
        header: "Data Cache",
        sortValue: (row) => (row.persist ? 1 : 0),
        cell: (row) =>
          row.persist ? (
            <span title="Also persisted through Next's Data Cache, so it survives a restart" className="text-[11px] font-semibold text-violet-600 dark:text-violet-300">
              Persisted
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Memory only</span>
          ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (row) => (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              disabled={busy !== null || row.state === "empty"}
              onClick={() => purgeKey(row.key)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Drop
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => warmKey(row.key)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Reload
            </button>
          </div>
        ),
      },
    ],
    // `purgeKey` and `warmKey` close over `send`, which is stable; `busy` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  );

  const filters = useMemo<TableFilter<InventoryRow>[]>(
    () => [
      {
        key: "state",
        label: "State",
        options: (["expired", "stale", "fresh", "empty"] as CacheState[]).map((state) => ({
          value: state,
          label: STATE_LABEL[state],
        })),
        test: (row, value) => row.state === value,
      },
      {
        key: "family",
        label: "Family",
        options: families.map((family) => ({ value: family.tag, label: family.label })),
        test: (row, value) => row.tags.includes(value as CacheTag),
      },
    ],
    [families],
  );

  const searchFields = useCallback((row: InventoryRow) => [row.label, row.key, ...row.tags], []);

  const totals = report?.totals;
  const worst = families.reduce<CacheState>(
    (accumulated, family) =>
      family.worst === "expired" || (family.worst === "stale" && accumulated !== "expired") ? family.worst : accumulated,
    "fresh",
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">What this instance is holding</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {report?.note ??
                "These figures describe the instance that answered this request. Other running instances hold their own."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATE_TONE[worst]}`}>
              {worst === "fresh" ? "All within window" : `Worst: ${STATE_LABEL[worst]}`}
            </span>
            <button type="button" onClick={() => void load()} className={GHOST_BUTTON}>
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Feeds registered" value={String(totals?.feeds ?? 0)} hint={`${totals?.held ?? 0} holding a value`} />
          <Stat label="Held in memory" value={formatBytes(totals?.bytes ?? 0)} hint="Serialised size" />
          <Stat
            label="Past their window"
            value={String((totals?.counts.stale ?? 0) + (totals?.counts.expired ?? 0))}
            hint={`${totals?.counts.expired ?? 0} beyond serving`}
          />
          <Stat label="Instance uptime" value={formatAge(report?.uptimeMs ?? 0)} hint="Since this process started" />
        </div>
      </section>

      <AdvicePanel advice={advice} advising={advising} onAsk={askAdvisor} onApply={(tags) => setSelected(tags)} />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Purge by family</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose one or more families. An empty selection clears all of them.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {families.map((family) => (
            <label
              key={family.tag}
              className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                selected.includes(family.tag)
                  ? "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                  : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(family.tag)}
                onChange={() => toggle(family.tag)}
                className="mt-1 h-4 w-4 accent-violet-600"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{family.label}</span>
                  <StateChip state={family.worst} />
                </span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{family.description}</span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    {family.held}/{family.feeds} held
                  </span>
                  <span>{formatBytes(family.bytes)}</span>
                  <span>oldest {formatAge(family.oldestAgeMs)}</span>
                  {family.counts.expired > 0 && (
                    <span className="font-bold text-rose-600 dark:text-rose-400">{family.counts.expired} expired</span>
                  )}
                  {family.counts.stale > 0 && (
                    <span className="font-bold text-amber-600 dark:text-amber-400">{family.counts.stale} stale</span>
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => purgeFamilies(false)}
            className={`${BUTTON} bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
          >
            {busy === "purge" ? "Purging…" : "Purge"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => purgeFamilies(true)}
            className={`${BUTTON} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            {busy === "purge-warm" ? "Purging and warming…" : "Purge and warm"}
          </button>
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className={GHOST_BUTTON}>
              Clear selection
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Warming refills the slow feeds here and now, so the next visitor does not pay for the purge.
          </p>
        </div>

        {message && (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Feed inventory</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Every feed this process can serve. Drop one on its own when a single board is wrong, rather than emptying its
          whole family.
        </p>

        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.key}
            filters={filters}
            searchFields={searchFields}
            searchPlaceholder="Search feeds"
            searchLabel="Search cached feeds"
            caption="Cached feeds held by this instance"
            pageSize={12}
            minWidth={860}
            empty="No feed matches these filters."
          />
        )}
      </section>
    </div>
  );
}

/**
 * The advisor's read on the inventory.
 *
 * Asked for rather than fetched on load: it may wait on a model, and an operator who came here to
 * drop one feed should not be made to sit through that first. The recommendation arrives with the
 * families attached, so acting on it is one click and not a re-reading of the table.
 */
function AdvicePanel({
  advice,
  advising,
  onAsk,
  onApply,
}: {
  advice: CacheAdvice | null;
  advising: boolean;
  onAsk: () => void;
  onApply: (tags: CacheTag[]) => void;
}) {
  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50/60 p-6 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-700 dark:text-violet-300">Cache advisor</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
            {advice ? advice.headline : "Should anything be purged right now?"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {advice && (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              {advice.source === "ai" ? "Written by the model" : "Composed from the figures"}
            </span>
          )}
          <button
            type="button"
            disabled={advising}
            onClick={onAsk}
            className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}
          >
            {advising ? "Reading the cache…" : advice ? "Ask again" : "Ask the advisor"}
          </button>
        </div>
      </div>

      {advice && (
        <>
          <ul className="mt-4 space-y-2">
            {advice.points.map((point) => (
              <li key={point} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          {advice.purge.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onApply(advice.purge)}
                className={`${BUTTON} border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-slate-900 dark:text-violet-300`}
              >
                Select {advice.purge.join(", ")}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Ticks the boxes below. Nothing is dropped until you press Purge.
              </span>
            </div>
          ) : (
            <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Nothing needs purging. Every held value is either within its window or already refreshing behind the reader.
            </p>
          )}

          {advice.spare.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Why the rest were left alone
              </summary>
              <ul className="mt-2 space-y-1.5">
                {advice.spare.map((entry) => (
                  <li key={entry.tag} className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold uppercase text-slate-500 dark:text-slate-300">{entry.tag}</span> — {entry.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
