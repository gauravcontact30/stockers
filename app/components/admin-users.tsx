"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders, useSubscription } from "./subscription-provider";

/** One row as the admin API reports it — the password hash never leaves the server. */
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: "Starter" | "Pro";
  role?: "admin" | "user";
  createdAt: string;
  trialStartedAt?: string;
  subscribedUntil?: string | null;
  emailVerifiedAt?: string | null;
  verificationSentAt?: string | null;
  emailVerified: boolean;
};

export type AdminSummary = {
  total: number;
  verified: number;
  subscribed: number;
  admins: number;
  pro: number;
};

export type UserFilter = "all" | "unverified" | "subscribed" | "trial" | "admins";

export const USER_FILTERS: readonly { key: UserFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "unverified", label: "Unverified" },
  { key: "subscribed", label: "Subscribed" },
  { key: "trial", label: "On trial" },
  { key: "admins", label: "Admins" },
];

/** Whether one account currently holds a paid period. */
export function isSubscribed(user: AdminUser, today: string): boolean {
  return Boolean(user.subscribedUntil && user.subscribedUntil >= today);
}

/**
 * Search and filter, kept pure so the matching rules can be tested without rendering the table.
 *
 * Search runs over name, email and id: an admin chasing a support request usually has one of the
 * three and should not have to know which field it belongs to.
 */
export function selectUsers(
  users: AdminUser[],
  { query, filter, today }: { query: string; filter: UserFilter; today: string },
): AdminUser[] {
  const needle = query.trim().toLowerCase();

  return users.filter((user) => {
    if (needle) {
      const haystack = `${user.name} ${user.email} ${user.id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    switch (filter) {
      case "unverified":
        return !user.emailVerified;
      case "subscribed":
        return isSubscribed(user, today);
      case "trial":
        return !isSubscribed(user, today) && user.role !== "admin";
      case "admins":
        return user.role === "admin";
      default:
        return true;
    }
  });
}

/** "8 Aug 2026" — the exchange-facing date format used elsewhere in the app. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{children}</span>;
}

export function AdminUsers() {
  const { status, loading: statusLoading } = useSubscription();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [today, setToday] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/users", { headers: authHeaders() });
      if (response.status === 403) {
        setError("This page is for administrators only.");
        setUsers([]);
        return;
      }
      if (!response.ok) throw new Error("failed");

      const data = await response.json();
      setUsers(data.users ?? []);
      setSummary(data.summary ?? null);
      setToday(data.today ?? "");
    } catch {
      setError("Couldn't load the user list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState above runs after the await, not synchronously in this callback.
    load();
  }, [load]);

  /** One change to one account, applied optimistically only after the server confirms it. */
  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That change was refused.");
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => selectUsers(users, { query, filter, today }), [users, query, filter, today]);

  // The API is the real guard; this only decides what to render while it is being asked.
  if (statusLoading || loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading accounts…</p>;
  }

  if (status && !status.isAdmin) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Administrators only</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This page manages every account on the site, so it is limited to admin users. If you should have access, ask an
          existing admin to grant it, or set <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">ADMIN_EMAILS</code> in the
          environment.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Accounts" value={summary.total} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <StatTile label="Verified" value={summary.verified} tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" />
          <StatTile label="Subscribed" value={summary.subscribed} tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
          <StatTile label="Pro plan" value={summary.pro} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
          <StatTile label="Admins" value={summary.admins} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email or id"
          aria-label="Search accounts"
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {USER_FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition ${
                filter === option.key
                  ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No account matches this search.</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <caption className="sr-only">Every account registered on Stockers.AI</caption>
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Account</th>
                <th scope="col" className="px-4 py-3 font-bold">Status</th>
                <th scope="col" className="px-4 py-3 font-bold">Plan</th>
                <th scope="col" className="px-4 py-3 font-bold">Joined</th>
                <th scope="col" className="px-4 py-3 font-bold">Subscribed until</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">Manage</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const subscribed = isSubscribed(user, today);
                const busy = busyId === user.id;

                return (
                  <tr key={user.id} className="border-t border-slate-200 align-middle dark:border-slate-800">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {user.emailVerified ? (
                          <Pill tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">verified</Pill>
                        ) : (
                          <Pill tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">unverified</Pill>
                        )}
                        {user.role === "admin" && (
                          <Pill tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">admin</Pill>
                        )}
                        {subscribed && (
                          <Pill tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">subscribed</Pill>
                        )}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.plan}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDay(user.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDay(user.subscribedUntil)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(user.id, { plan: user.plan === "Pro" ? "Starter" : "Pro" })}
                          className="h-8 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                        >
                          {user.plan === "Pro" ? "→ Starter" : "→ Pro"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(user.id, { subscription: subscribed ? "revoke" : "grant" })}
                          className="h-8 rounded-full border border-sky-200 px-3 text-xs font-semibold text-sky-700 transition hover:border-sky-400 disabled:opacity-40 dark:border-sky-500/30 dark:text-sky-400"
                        >
                          {subscribed ? "Revoke" : "Grant 30d"}
                        </button>
                        {!user.emailVerified && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patch(user.id, { emailVerified: true })}
                            className="h-8 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-40 dark:border-emerald-500/30 dark:text-emerald-400"
                          >
                            Mark verified
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(user.id, { role: user.role === "admin" ? "user" : "admin" })}
                          className="h-8 rounded-full border border-violet-200 px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-400 disabled:opacity-40 dark:border-violet-500/30 dark:text-violet-400"
                        >
                          {user.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Showing {visible.length} of {users.length} accounts. Granting a subscription adds 30 days from today, or extends an
        existing period rather than replacing it.
      </p>
    </div>
  );
}
