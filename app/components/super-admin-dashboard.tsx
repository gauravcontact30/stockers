"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { AI_FEATURES, TIER_LABEL } from "../lib/plan-tiers";
import { AdminClientReviews } from "./admin-client-reviews";
import { AdminUsers, type AdminSummary, type AdminUser } from "./admin-users";
import { authHeaders, syncSessionCookie, useSubscription } from "./subscription-provider";

type IconProps = { className?: string };

export type SuperAdminSectionId = "overview" | "users" | "subscriptions" | "reviews" | "features" | "cache" | "application";

type SuperAdminSection = {
  id: SuperAdminSectionId;
  label: string;
  description: string;
  href: string;
  icon: (props: IconProps) => ReactElement;
};

type RosterPayload = {
  users?: AdminUser[];
  summary?: AdminSummary;
  today?: string;
};

type CacheTag = "bse" | "nse" | "ai" | "news" | "quotes";

const STORAGE_KEY = "stockers-super-admin-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const expandedOnServer = () => false;

function useCollapsedPreference(): [boolean, (next: boolean) => void] {
  const store = useRef({ value: null as boolean | null, listeners: new Set<() => void>() }).current;

  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );

  const collapsed = useSyncExternalStore(subscribe, () => store.value ?? readCollapsed(), expandedOnServer);

  const setCollapsed = useCallback(
    (next: boolean) => {
      store.value = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      store.listeners.forEach((listener) => listener());
    },
    [store],
  );

  return [collapsed, setCollapsed];
}

function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="8" rx="1.6" />
      <rect x="14" y="3" width="7" height="5" rx="1.6" />
      <rect x="14" y="12" width="7" height="9" rx="1.6" />
      <rect x="3" y="15" width="7" height="6" rx="1.6" />
    </svg>
  );
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M16 20a4 4 0 0 0-8 0" />
      <circle cx="12" cy="9" r="4" />
      <path d="M20 19a3.4 3.4 0 0 0-3-3.4M4 19a3.4 3.4 0 0 1 3-3.4" />
      <path d="M18 8.5a2.6 2.6 0 0 1 0 5M6 8.5a2.6 2.6 0 0 0 0 5" />
    </svg>
  );
}

function SubscriptionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M7 15h4M15 15h2" />
    </svg>
  );
}

function FeatureIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m12 3 2.3 5 5.4.7-4 3.7 1.1 5.3L12 15.1l-4.8 2.6 1.1-5.3-4-3.7 5.4-.7Z" />
      <path d="M12 15.1V21" />
    </svg>
  );
}

function ReviewsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-5 4V5.5Z" />
      <path d="m12 6.2 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3Z" />
    </svg>
  );
}

function CacheIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export const SUPER_ADMIN_SECTIONS: SuperAdminSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "System totals, access state and the fastest routes to the controls.",
    href: "/admin",
    icon: DashboardIcon,
  },
  {
    id: "users",
    label: "Application Users",
    description: "Search accounts, verify emails, assign plans and manage admin roles.",
    href: "/admin/users",
    icon: UsersIcon,
  },
  {
    id: "subscriptions",
    label: "Subscription Users",
    description: "Review paid accounts, grant access, revoke subscriptions and change tiers.",
    href: "/admin/subscriptions",
    icon: SubscriptionIcon,
  },
  {
    id: "reviews",
    label: "Client Reviews",
    description: "Upload client review comments, profile images, signatures and star ratings for the landing page.",
    href: "/admin/reviews",
    icon: ReviewsIcon,
  },
  {
    id: "features",
    label: "Feature Locks",
    description: "Turn AI surfaces on or off without changing code.",
    href: "/admin/features",
    icon: FeatureIcon,
  },
  {
    id: "cache",
    label: "Cache Control",
    description: "Purge market, AI and news caches when a feed needs a hard refresh.",
    href: "/admin/cache",
    icon: CacheIcon,
  },
  {
    id: "application",
    label: "Application",
    description: "Operational links and application management checklist.",
    href: "/admin/application",
    icon: SettingsIcon,
  },
];

const SECTION_BY_ID = Object.fromEntries(SUPER_ADMIN_SECTIONS.map((section) => [section.id, section])) as Record<
  SuperAdminSectionId,
  SuperAdminSection
>;

function SuperAdminSidebar({ active }: { active: SuperAdminSectionId }) {
  const [collapsed, setCollapsed] = useCollapsedPreference();
  const pathname = usePathname();

  return (
    <aside
      data-collapsed={String(collapsed)}
      className={`sticky top-0 z-30 hidden h-[100dvh] shrink-0 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex dark:border-slate-800 dark:bg-slate-900/95 ${
        collapsed ? "w-[76px]" : "w-[248px]"
      }`}
    >
      <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-rose-600 via-red-400 to-rose-500" />
      <div className={`flex items-center gap-2 border-b border-slate-200/80 px-3 py-4 dark:border-slate-800 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rose-600 dark:text-rose-300">Stockers.AI</p>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Super Admin</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-300"
        >
          <ChevronIcon className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav aria-label="Super Admin options" className="flex flex-1 flex-col gap-1 px-2.5 py-4">
        {SUPER_ADMIN_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === active || pathname === section.href;

          return (
            <Link
              key={section.id}
              href={section.href}
              aria-label={section.label}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                collapsed ? "justify-center" : ""
              } ${
                isActive
                  ? "bg-slate-900 text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.9)] dark:bg-white dark:text-slate-950"
                  : "text-slate-600 hover:-translate-y-px hover:bg-rose-600 hover:text-white hover:shadow-[0_14px_30px_-16px_rgba(225,29,72,0.95)] dark:text-slate-300 dark:hover:bg-rose-600 dark:hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? "" : "text-slate-400 group-hover:text-white dark:text-slate-500 dark:group-hover:text-white"}`} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{section.label}</span>}
              {!collapsed && isActive && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
              {collapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_12px_30px_-12px_rgba(15,23,42,0.8)] transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 dark:bg-slate-700"
                >
                  {section.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-slate-200/80 p-4 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Administrative changes apply immediately.
        </div>
      )}
    </aside>
  );
}

function SuperAdminTabs({ active }: { active: SuperAdminSectionId }) {
  return (
    <nav aria-label="Super Admin options (compact)" className="bleed-gutter gutter flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none]">
      {SUPER_ADMIN_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === active;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
              isActive
                ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const { status, loading } = useSubscription();

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Checking admin access...</p>;
  }

  if (status && !status.isAdmin) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Administrators only</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This dashboard controls application access, subscriptions and cache state.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return children;
}

function SuperAdminOverview() {
  const { status } = useSubscription();
  const [payload, setPayload] = useState<RosterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users", { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as RosterPayload;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load admin totals.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const lockedCount = Object.values(status?.locks ?? {}).filter(Boolean).length;
  const subscribed = payload?.summary?.subscribed ?? 0;
  const activeRate = payload?.summary?.total ? Math.round((subscribed / payload.summary.total) * 100) : 0;

  return (
    <AdminAccessGate>
      <div className="flex flex-col gap-6">
        {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Accounts" value={payload?.summary?.total ?? "..."} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <StatTile label="Subscribers" value={subscribed || payload ? subscribed : "..."} tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
          <StatTile label="Admins" value={payload?.summary?.admins ?? "..."} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
          <StatTile label="Locked Features" value={lockedCount} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Subscription health</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {activeRate}% of registered accounts currently hold a paid subscription. Plan and renewal controls live on the subscription users page.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <StatTile label="Starter" value={(payload?.summary?.total ?? 0) - (payload?.summary?.pro ?? 0) - (payload?.summary?.elite ?? 0)} tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" />
              <StatTile label="Pro" value={payload?.summary?.pro ?? 0} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
              <StatTile label="Elite" value={payload?.summary?.elite ?? 0} tone="border-fuchsia-200 bg-fuchsia-50 dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quick actions</h2>
            <div className="mt-4 flex flex-col gap-2">
              {SUPER_ADMIN_SECTIONS.filter((section) => section.id !== "overview").map((section) => (
                <Link key={section.id} href={section.href} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-violet-500/10">
                  {section.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AdminAccessGate>
  );
}

function FeatureLocksPanel() {
  const { status, loading, setLock, refresh } = useSubscription();
  const [busyFeature, setBusyFeature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byTier = useMemo(
    () => ({
      starter: AI_FEATURES.filter((feature) => feature.tier === "starter"),
      pro: AI_FEATURES.filter((feature) => feature.tier === "pro"),
      elite: AI_FEATURES.filter((feature) => feature.tier === "elite"),
    }),
    [],
  );

  const toggle = async (feature: string, locked: boolean) => {
    setBusyFeature(feature);
    setError(null);
    try {
      await setLock(feature, locked);
      await refresh();
    } catch {
      setError("Couldn't update that feature lock.");
    } finally {
      setBusyFeature(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading feature locks...</p>;

  return (
    <AdminAccessGate>
      <div className="flex flex-col gap-5">
        {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {(["starter", "pro", "elite"] as const).map((tier) => (
          <section key={tier} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{TIER_LABEL[tier]} features</h2>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{byTier[tier].length} controls</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {byTier[tier].map((feature) => {
                const locked = status?.locks?.[feature.key] === true;
                const busy = busyFeature === feature.key;
                return (
                  <div key={feature.key} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{feature.label}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{feature.blurb}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={locked}
                      onClick={() => toggle(feature.key, !locked)}
                      className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold transition disabled:opacity-50 ${
                        locked
                          ? "bg-rose-600 text-white hover:bg-rose-500"
                          : "border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-400"
                      }`}
                    >
                      {locked ? "Locked" : "Open"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AdminAccessGate>
  );
}

const CACHE_OPTIONS: { key: CacheTag; label: string; description: string }[] = [
  { key: "bse", label: "BSE data", description: "Scrip master, Bhavcopy tape and sector classification." },
  { key: "nse", label: "NSE boards", description: "Most traded, sectoral indices, ETFs, dividends, filings and IPOs." },
  { key: "ai", label: "AI reads", description: "Generated board reads, pulse narrative, comparisons and intelligence answers." },
  { key: "news", label: "News", description: "Market headlines and story pages." },
  { key: "quotes", label: "Quote snapshots", description: "Yahoo stock, ETF and benchmark index quote snapshots." },
];

function CacheControlPanel() {
  const [selected, setSelected] = useState<CacheTag[]>(CACHE_OPTIONS.map((option) => option.key));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (tag: CacheTag) => {
    setSelected((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const purge = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tags: selected }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Cache purge was refused.");
        return;
      }
      setMessage(`Cleared ${data.revalidated?.join(", ") || "all"} at ${new Date(data.at).toLocaleString("en-IN")}.`);
    } catch {
      setError("Couldn't reach the cache endpoint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminAccessGate>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-2">
          {CACHE_OPTIONS.map((option) => (
            <label key={option.key} className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <input
                type="checkbox"
                checked={selected.includes(option.key)}
                onChange={() => toggle(option.key)}
                className="mt-1 h-4 w-4 accent-violet-600"
              />
              <span>
                <span className="block font-semibold text-slate-900 dark:text-white">{option.label}</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">Choose one or more cache families. An empty selection sends the server default and clears all known families.</p>
          <button
            type="button"
            disabled={busy}
            onClick={purge}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {busy ? "Purging..." : "Purge cache"}
          </button>
        </div>
        {message && <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
        {error && <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      </div>
    </AdminAccessGate>
  );
}

function ApplicationPanel() {
  const { status } = useSubscription();
  const appLinks = [
    { href: "/dashboard", label: "Investor dashboard", detail: "Verify subscriber-facing AI sections." },
    { href: "/news", label: "News page", detail: "Review public market news." },
    { href: "/contact", label: "Contact page", detail: "Check support intake." },
    { href: "/privacy-policy", label: "Privacy policy", detail: "Review legal copy." },
    { href: "/refund-policy", label: "Refund policy", detail: "Review refund terms." },
    { href: "/return-policy", label: "Return policy", detail: "Review return terms." },
  ];

  return (
    <AdminAccessGate>
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current admin session</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Name</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">{status?.name ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="text-right font-semibold text-slate-900 dark:text-white">{status?.email ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="font-semibold text-violet-700 dark:text-violet-300">{status?.isAdmin ? "Administrator" : "User"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Application areas</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {appLinks.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:bg-violet-500/10">
                <span className="block font-semibold text-slate-900 dark:text-white">{item.label}</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{item.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminAccessGate>
  );
}

function SectionContent({ active }: { active: SuperAdminSectionId }) {
  switch (active) {
    case "users":
      return (
        <AdminAccessGate>
          <AdminUsers />
        </AdminAccessGate>
      );
    case "subscriptions":
      return (
        <AdminAccessGate>
          <AdminUsers mode="subscriptions" />
        </AdminAccessGate>
      );
    case "reviews":
      return (
        <AdminAccessGate>
          <AdminClientReviews />
        </AdminAccessGate>
      );
    case "features":
      return <FeatureLocksPanel />;
    case "cache":
      return <CacheControlPanel />;
    case "application":
      return <ApplicationPanel />;
    default:
      return <SuperAdminOverview />;
  }
}

export function SuperAdminDashboard({ active }: { active: SuperAdminSectionId }) {
  const router = useRouter();
  const { status, refresh } = useSubscription();
  const section = SECTION_BY_ID[active];

  const logout = () => {
    window.localStorage.removeItem("stockers-auth");
    syncSessionCookie();
    void refresh();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#f8fafc_0%,_#f3f4f6_100%)] text-slate-700 transition-colors dark:bg-slate-950 dark:bg-none dark:text-slate-300">
      <div className="flex">
        <SuperAdminSidebar active={active} />
        <div className="gutter min-w-0 flex-1 py-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6">
            <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] transition-colors dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-rose-600 dark:text-rose-300">Super Admin</p>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{section.label}</h1>
                  <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">{section.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {status?.email && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      {status.email}
                    </span>
                  )}
                  <Link href="/dashboard" className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </header>

            <SuperAdminTabs active={active} />
            <SectionContent active={active} />
          </div>
        </div>
      </div>
    </div>
  );
}
