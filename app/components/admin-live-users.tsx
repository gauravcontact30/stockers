"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LivePresenceReport, LivePresenceState, LiveUserRow } from "../lib/presence-report";
import { DataTable, type Column, type TableFilter } from "./data-table";
import { StatTile } from "./stat-tile";
import { authHeaders } from "./subscription-provider";

/**
 * Who is on the site right now, for the super admin.
 *
 * Every figure comes from `/api/admin/presence`, which refuses anyone who is not an admin — this
 * component renders the answer, it does not decide who may see it.
 *
 * The page answers one question at three depths: how many people are here (the tiles), where they
 * are (the two short lists), and who they are (the table). A reader should be able to stop after
 * any one of them and have a complete, smaller answer.
 *
 * ---------------------------------------------------------------------------
 * On the refresh
 * ---------------------------------------------------------------------------
 *
 * A live count that only updates when somebody reloads is not a live count, so this repolls on a
 * timer. The interval is deliberately shorter than the window a sitting stays "online" for: poll
 * more slowly than that and a person could arrive and be dropped between two reads, which would
 * show as a number that flickers rather than one that moves.
 *
 * Polling stops while the tab is in the background. Nobody is reading the figures then, and an
 * admin dashboard left open overnight should not spend the night querying the database.
 */

/** How often the panel asks again. */
const REFRESH_MS = 20_000;

/** Rows per page. Ten fits the fold on a laptop without the table becoming a scroll of its own. */
const PAGE_SIZE = 10;

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";

/** How long ago, in the words a person would use rather than as a timestamp. */
export function agoText(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}

/** How long they have been here, from whole minutes. */
export function stayText(minutes: number): string {
  if (minutes < 1) return "just arrived";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Desktop" };

/** A green dot for somebody who is here, a grey one for somebody who has just left. */
function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
      />
      {/* The state as a word as well as a colour: colour alone is not a channel. */}
      <span className={online ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}>
        {online ? "On the site" : "Just left"}
      </span>
    </span>
  );
}

/** One of the two "where they are" lists. Short by design — it is context, not a second table. */
function GroupList({ title, groups, empty }: { title: string; groups: { key: string; label: string; people: number }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {groups.slice(0, 6).map((group) => (
            <li key={group.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">{group.label}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">{group.people}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminLiveUsers() {
  const [state, setState] = useState<LivePresenceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Seconds since the last successful read, so the header can say how fresh the figures are. */
  const [age, setAge] = useState(0);
  // A ref rather than state: the poller reads it to avoid stacking a second request on top of one
  // that has not come back, and doing that through state would restart the interval each time.
  const inFlight = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);

    try {
      const response = await fetch("/api/admin/presence", { headers: authHeaders(), signal });
      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as LivePresenceState;
      setState(data);
      setAge(0);
      setError(null);
    } catch {
      // An aborted request is the component unmounting, not a failure worth a banner.
      if (!signal?.aborted) setError("Couldn't read who is on the site right now.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Off the effect body rather than in it: `load` raises the "Refreshing…" flag before it awaits
    // anything, and setting state synchronously while an effect runs is a cascading render. One
    // microtask later it is an ordinary callback, which is what every other read here already is.
    queueMicrotask(() => void load(controller.signal));

    const poll = () => {
      if (document.visibilityState === "hidden") return;
      void load(controller.signal);
    };

    const timer = window.setInterval(poll, REFRESH_MS);
    // A tick a second, so "updated 4s ago" counts up between reads rather than jumping.
    const clock = window.setInterval(() => setAge((seconds) => seconds + 1), 1_000);
    document.addEventListener("visibilitychange", poll);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [load]);

  const report: LivePresenceReport | null = state?.available ? state : null;
  const rows = useMemo(() => report?.rows ?? [], [report]);

  const columns: Column<LiveUserRow>[] = [
    {
      key: "who",
      header: "Person",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.email ?? "Not signed in"}</p>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusDot online={row.online} />,
      // Online first when sorted descending, which is the reading the column is for.
      sortValue: (row) => (row.online ? 1 : 0),
      className: "whitespace-nowrap",
    },
    {
      key: "path",
      header: "On page",
      cell: (row) => <span className="font-mono text-xs">{row.path ?? "—"}</span>,
      sortValue: (row) => row.path,
    },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => row.plan ?? "—",
      sortValue: (row) => row.plan,
    },
    {
      key: "device",
      header: "Device",
      cell: (row) => (row.device ? DEVICE_LABEL[row.device] : "—"),
      sortValue: (row) => row.device,
    },
    {
      key: "tabs",
      header: "Tabs",
      align: "right",
      cell: (row) => row.tabs,
      sortValue: (row) => row.tabs,
      className: "tabular-nums",
    },
    {
      key: "stay",
      header: "Here for",
      align: "right",
      cell: (row) => stayText(row.minutes),
      sortValue: (row) => row.minutes,
      className: "whitespace-nowrap tabular-nums",
    },
    {
      key: "seen",
      header: "Last seen",
      align: "right",
      cell: (row) => agoText(row.idleSeconds),
      sortValue: (row) => row.idleSeconds,
      className: "whitespace-nowrap tabular-nums",
    },
  ];

  const filters: TableFilter<LiveUserRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "online", label: "On the site" },
        { value: "left", label: "Just left" },
      ],
      test: (row, value) => (value === "online" ? row.online : !row.online),
    },
    {
      key: "account",
      label: "Account",
      options: [
        { value: "signed-in", label: "Signed in" },
        { value: "guest", label: "Not signed in" },
      ],
      test: (row, value) => (value === "signed-in" ? row.signedIn : !row.signedIn),
    },
    {
      key: "device",
      label: "Device",
      options: [
        { value: "mobile", label: "Phone" },
        { value: "tablet", label: "Tablet" },
        { value: "desktop", label: "Desktop" },
      ],
      test: (row, value) => row.device === value,
    },
  ];

  if (state && !state.available) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {report ? `Live · updated ${agoText(age)}` : "Reading the live session store…"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="h-9 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
        >
          {busy ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="On the site now"
          value={report?.summary.online ?? "…"}
          hint={report ? `Seen in the last ${report.windowSeconds}s` : undefined}
          tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        />
        <StatTile
          label="Signed in"
          value={report?.summary.signedIn ?? "…"}
          hint="Reading with an account"
          tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10"
        />
        <StatTile
          label="Not signed in"
          value={report?.summary.guests ?? "…"}
          hint="Visitors browsing anonymously"
          tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10"
        />
        <StatTile
          label="Open tabs"
          value={report?.summary.tabs ?? "…"}
          hint="Sittings behind those people"
          tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
        <StatTile
          label="Seen recently"
          value={report?.summary.recent ?? "…"}
          hint={report ? `In the last ${report.retentionMinutes} minutes` : undefined}
          tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
        />
      </div>

      <section className={CARD}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Where they are</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          The pages the people on the site are on right now, and what they are reading them on.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <GroupList title="Pages" groups={report?.pages ?? []} empty="Nobody is on the site right now." />
          <GroupList title="Devices" groups={report?.devices ?? []} empty="No device has reported in." />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Everyone here</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Each person once, however many tabs they have open, most recently seen first. People who
          have closed the tab stay on the list for {report?.retentionMinutes ?? 60} minutes, marked
          as having left.
        </p>
        <DataTable
          rows={rows}
          columns={columns}
          filters={filters}
          rowKey={(row) => row.key}
          caption="People using the site right now"
          searchFields={(row) => [row.name, row.email, row.plan, row.path]}
          searchPlaceholder="Search a name, email, plan or page"
          pageSize={PAGE_SIZE}
          minWidth={860}
          empty={report ? "Nobody has been on the site in the last hour." : "Reading the live session store…"}
          rowClassName={(row) => (row.online ? "" : "opacity-60")}
        />
      </section>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Counted from a heartbeat each open tab sends while somebody is looking at it, so a
        backgrounded tab drops off the list. Admin pages are not counted — this is the audience, not
        the people running the site.
      </p>
    </div>
  );
}
