"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { tierForPlan } from "../lib/plan-tiers";
import { pageWindow } from "./market-section";
import { PlanPill } from "./plan-pill";
import { authHeaders, useSubscription } from "./subscription-provider";

const SUPER_ADMIN_EMAIL = "garvcontact30@gmail.com";

/** One row as the admin API reports it â€” the password hash never leaves the server. */
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  /** The plan they have bought. Null for an account that has never bought one. */
  plan: "Starter" | "Pro" | "Elite" | null;
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
  elite?: number;
};

type AdminPermissions = {
  canDeleteUsers?: boolean;
};

export type UserFilter = "all" | "unverified" | "subscribed" | "trial" | "admins";
type PlanFilter = "all" | "Starter" | "Pro" | "Elite";
type RoleFilter = "all" | "admin" | "user";
type VerificationFilter = "all" | "verified" | "unverified";
type SubscriptionFilter = "all" | "active" | "trial" | "expired";
type AdminUsersMode = "users" | "subscriptions";

export const USER_FILTERS: readonly { key: UserFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "unverified", label: "Unverified" },
  { key: "subscribed", label: "Subscribed" },
  { key: "trial", label: "On trial" },
  { key: "admins", label: "Admins" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const PAGE_BUTTON = "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition disabled:opacity-40";

const PLAN_FILTERS: readonly { key: PlanFilter; label: string }[] = [
  { key: "all", label: "All plans" },
  { key: "Starter", label: "Starter" },
  { key: "Pro", label: "Pro" },
  { key: "Elite", label: "Elite" },
];

const ROLE_FILTERS: readonly { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All roles" },
  { key: "user", label: "Users" },
  { key: "admin", label: "Admins" },
];

const VERIFICATION_FILTERS: readonly { key: VerificationFilter; label: string }[] = [
  { key: "all", label: "Any verification" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
];

const SUBSCRIPTION_FILTERS: readonly { key: SubscriptionFilter; label: string }[] = [
  { key: "all", label: "Any subscription" },
  { key: "active", label: "Active paid" },
  { key: "trial", label: "Trial / unpaid" },
  { key: "expired", label: "Expired paid" },
];

/**
 * The plan badge for one account, or a plain "no plan" chip when nothing has been bought.
 *
 * `tierForPlan` answers null with "starter" — right for a paywall deciding what to unlock, wrong
 * for a label, where it would print a Starter badge on an account that has never paid for one.
 */
function AccountPlan({ plan }: { plan: AdminUser["plan"] }) {
  if (!plan) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-600 dark:text-slate-400">
        No plan
      </span>
    );
  }

  return <PlanPill tier={tierForPlan(plan)} />;
}

/** Whether one account currently holds a paid period. */
export function isSubscribed(user: AdminUser, today: string): boolean {
  return Boolean(user.subscribedUntil && user.subscribedUntil >= today);
}

/**
 * Whether an account belongs to the Subscription Users page rather than the Application Users one.
 *
 * A subscription user is one who has *bought* something: they hold a plan, or a paid period is or
 * was on the record. A lapsed subscriber stays on this page — they are a renewal conversation, not
 * a sign-up one, and moving them across when their month ran out would hide exactly the people an
 * admin opens this page to find.
 *
 * Everyone else — on trial, or expired having never paid — is an application user. The two are a
 * partition: every account is on exactly one of the two pages, which is what makes "the respective
 * page" a true statement rather than a default filter someone can switch off.
 */
export function isSubscriptionUser(user: AdminUser): boolean {
  return user.plan !== null || Boolean(user.subscribedUntil);
}

/**
 * Search and filter, kept pure so the matching rules can be tested without rendering the table.
 *
 * Search runs over name, email and id: an admin chasing a support request usually has one of the
 * three and should not have to know which field it belongs to.
 */
export function selectUsers(
  users: AdminUser[],
  {
    query,
    filter,
    today,
    plan = "all",
    role = "all",
    verification = "all",
    subscription = "all",
    mode = "users",
  }: {
    query: string;
    filter: UserFilter;
    today: string;
    plan?: PlanFilter;
    role?: RoleFilter;
    verification?: VerificationFilter;
    subscription?: SubscriptionFilter;
    /** Which of the two user pages is asking. Applied before every other rule and not overridable. */
    mode?: AdminUsersMode;
  },
): AdminUser[] {
  const needle = query.trim().toLowerCase();

  return users.filter((user) => {
    // The page's own scope comes first and no control on screen can widen it: an admin narrowing
    // the Subscription Users page must never be able to filter their way back to a trial account.
    if (isSubscriptionUser(user) !== (mode === "subscriptions")) return false;

    if (needle) {
      const haystack = `${user.name} ${user.email} ${user.id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    switch (filter) {
      case "unverified":
        if (user.emailVerified) return false;
        break;
      case "subscribed":
        if (!isSubscribed(user, today)) return false;
        break;
      case "trial":
        if (isSubscribed(user, today) || user.role === "admin") return false;
        break;
      case "admins":
        if (user.role !== "admin") return false;
        break;
      default:
        break;
    }

    if (plan !== "all" && user.plan !== plan) return false;
    if (role !== "all" && (user.role ?? "user") !== role) return false;
    if (verification === "verified" && !user.emailVerified) return false;
    if (verification === "unverified" && user.emailVerified) return false;

    const subscribed = isSubscribed(user, today);
    if (subscription === "active" && !subscribed) return false;
    if (subscription === "trial" && (subscribed || user.role === "admin")) return false;
    if (subscription === "expired" && (subscribed || !user.subscribedUntil)) return false;

    return true;
  });
}

/** "8 Aug 2026" â€” the exchange-facing date format used elsewhere in the app. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
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

function ConfirmDeleteModal({
  user,
  busy,
  onCancel,
  onConfirm,
}: {
  user: AdminUser | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.85)] dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="border-b border-rose-100 bg-gradient-to-r from-rose-50 via-white to-emerald-50 p-6 dark:border-rose-500/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-emerald-500/10">
          <span className="inline-flex rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            Confirm delete
          </span>
          <h2 id="delete-user-title" className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
            Delete this user account?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            This permanently removes the account from StockersAI. The Super Admin account is protected and cannot be deleted.
          </p>
        </div>

        <div className="p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AccountPlan plan={user.plan} />
              {user.role === "admin" && <Pill tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">admin</Pill>}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {busy ? "Deleting..." : "Delete user"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminUsers({
  initialFilter = "all",
  mode = "users",
}: {
  initialFilter?: UserFilter;
  mode?: AdminUsersMode;
} = {}) {
  const { status, loading: statusLoading } = useSubscription();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions>({});
  const [today, setToday] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>(initialFilter);
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  // "All" on both pages now that `mode` partitions the roster outright. Defaulting the
  // subscriptions page to "active paid" used to be how it was scoped, and it hid the lapsed
  // subscribers — the people that page exists to chase.
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

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
      setPermissions(data.permissions ?? {});
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
      if (data.summary) setSummary(data.summary);
      if (data.permissions) setPermissions(data.permissions);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const requestRemove = (user: AdminUser) => {
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL) return;
    setPendingDelete(user);
  };

  const remove = async (user: AdminUser): Promise<boolean> => {
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL) return false;
    setBusyId(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That deletion was refused.");
        return false;
      }
      setUsers(data.users ?? []);
      if (data.summary) setSummary(data.summary);
      if (data.permissions) setPermissions(data.permissions);
      return true;
    } catch {
      setError("Couldn't reach the server.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    const deleted = await remove(pendingDelete);
    if (deleted) setPendingDelete(null);
  };

  const resetPage = () => setCurrentPage(1);

  const updateQuery = (next: string) => {
    setQuery(next);
    resetPage();
  };

  const clearSearch = () => {
    setQuery("");
    setSearchFocused(false);
    resetPage();
  };

  const visible = useMemo(
    () =>
      selectUsers(users, {
        query,
        filter,
        today,
        plan: planFilter,
        role: roleFilter,
        verification: verificationFilter,
        subscription: subscriptionFilter,
        mode,
      }),
    [users, query, filter, today, planFilter, roleFilter, verificationFilter, subscriptionFilter, mode],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(currentPage, pageCount);
  const startIndex = visible.length === 0 ? 0 : (page - 1) * pageSize;
  const pageUsers = visible.slice(startIndex, startIndex + pageSize);
  const endIndex = visible.length === 0 ? 0 : startIndex + pageUsers.length;
  const searchSuggestions = useMemo(() => {
    // Scoped to the page, like the table is. Offering a trial account as a suggestion on the
    // Subscription Users page would be offering a row that cannot be shown when it is chosen.
    const inScope = users.filter((user) => isSubscriptionUser(user) === (mode === "subscriptions"));
    const needle = query.trim().toLowerCase();
    if (!needle) return inScope.slice(0, 6);

    return inScope
      .filter((user) => `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [users, query, mode]);
  const showSuggestions = searchFocused && searchSuggestions.length > 0;
  const canDeleteUsers = permissions.canDeleteUsers ?? status?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  // The API is the real guard; this only decides what to render while it is being asked.
  if (statusLoading || loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading accounts...</p>;
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
        <Link href="/overview" className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Accounts" value={summary.total} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <StatTile label="Verified" value={summary.verified} tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" />
          <StatTile label="Subscribed" value={summary.subscribed} tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
          <StatTile label="Pro plan" value={summary.pro} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
          <StatTile label="Elite plan" value={summary.elite ?? 0} tone="border-fuchsia-200 bg-fuchsia-50 dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10" />
          <StatTile label="Admins" value={summary.admins} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div className="relative min-w-0 flex-1">
            <input
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder={mode === "subscriptions" ? "Search subscription users by name, email or id" : "Search users by name, email or id"}
              aria-label="Search accounts"
              aria-controls="admin-user-search-suggestions"
              className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 pr-20 text-sm text-slate-900 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 h-7 -translate-y-1/2 rounded-full border border-slate-200 px-2.5 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-300"
              >
                Clear
              </button>
            )}
            {showSuggestions && (
              <div
                id="admin-user-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_-28px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950"
              >
                {searchSuggestions.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    role="option"
                    aria-selected={query.trim().toLowerCase() === user.email.toLowerCase()}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      updateQuery(user.email);
                      setSearchFocused(false);
                    }}
                    className="block w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition last:border-0 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                  >
                    {user.name} - {user.email}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setPlanFilter("all");
              setRoleFilter("all");
              setVerificationFilter("all");
              setSubscriptionFilter(mode === "subscriptions" ? "active" : "all");
              clearSearch();
            }}
            className="h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            Reset filters
          </button>
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {USER_FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setFilter(option.key);
                resetPage();
              }}
              aria-pressed={filter === option.key}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition ${
                filter === option.key
                  ? "border-transparent bg-rose-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Plan
            <select
              value={planFilter}
              onChange={(event) => {
                setPlanFilter(event.target.value as PlanFilter);
                resetPage();
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {PLAN_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Role
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as RoleFilter);
                resetPage();
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {ROLE_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Verification
            <select
              value={verificationFilter}
              onChange={(event) => {
                setVerificationFilter(event.target.value as VerificationFilter);
                resetPage();
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {VERIFICATION_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Subscription
            <select
              value={subscriptionFilter}
              onChange={(event) => {
                setSubscriptionFilter(event.target.value as SubscriptionFilter);
                resetPage();
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {SUBSCRIPTION_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
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
            <caption className="sr-only">Every account registered on StockersAI</caption>
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
              {pageUsers.map((user) => {
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

                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <AccountPlan plan={user.plan} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDay(user.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDay(user.subscribedUntil)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <select
                          // "" is the no-plan state, and it is selectable: an admin correcting a
                          // plan granted by mistake needs a way back to "bought nothing".
                          value={user.plan ?? ""}
                          disabled={busy}
                          aria-label={`Plan for ${user.name}`}
                          onChange={(event) => patch(user.id, { plan: event.target.value })}
                          className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                          <option value="">No plan</option>
                          <option value="Starter">Starter</option>
                          <option value="Pro">Pro</option>
                          <option value="Elite">Elite</option>
                        </select>
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
                        {canDeleteUsers && user.email.toLowerCase() !== SUPER_ADMIN_EMAIL && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => requestRemove(user)}
                            className="h-8 rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-400"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            Showing{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {visible.length === 0 ? 0 : startIndex + 1}-{endIndex}
            </span>{" "}
            of <span className="font-semibold text-slate-900 dark:text-white">{visible.length.toLocaleString("en-IN")}</span>{" "}
            accounts
          </p>
          <label className="flex items-center gap-2 font-semibold">
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                resetPage();
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>

        {pageCount > 1 && (
          <nav aria-label="account pages" className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {users.length.toLocaleString("en-IN")} total accounts. Granting a subscription adds 30 days from today, or extends an existing period.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setCurrentPage(page - 1)}
                className={`${PAGE_BUTTON} border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300`}
              >
                ← Prev
              </button>

              {pageWindow(page, pageCount).map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setCurrentPage(number)}
                  aria-current={number === page ? "page" : undefined}
                  aria-label={`Page ${number}`}
                  className={`${PAGE_BUTTON} ${
                    number === page
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {number}
                </button>
              ))}

              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setCurrentPage(page + 1)}
                className={`${PAGE_BUTTON} border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300`}
              >
                Next →
              </button>
            </div>
          </nav>
        )}

        {pageCount <= 1 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {users.length.toLocaleString("en-IN")} total accounts. Granting a subscription adds 30 days from today, or extends an existing period.
          </p>
        )}
      </div>

      <ConfirmDeleteModal
        user={pendingDelete}
        busy={Boolean(pendingDelete && busyId === pendingDelete.id)}
        onCancel={() => {
          if (!busyId) setPendingDelete(null);
        }}
        onConfirm={() => {
          void confirmRemove();
        }}
      />
    </div>
  );
}
