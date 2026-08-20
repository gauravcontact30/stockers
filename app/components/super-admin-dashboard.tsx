"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { buildAttentionQueue, daysUntil, expiringSoon, type AttentionItem, type Urgency } from "../lib/admin-attention";
import type { HealthReport, CheckState } from "../lib/admin-health";
import type { FeatureUsage } from "../lib/analytics-report";
// From the pure half, never `./payments-ledger` — the reader pulls Supabase and `next/cache` in
// behind it, and this is a client component.
import { formatPaise, type LedgerState } from "../lib/payments-format";
import { AI_FEATURES, TIER_LABEL } from "../lib/plan-tiers";
import type { LivePresenceState } from "../lib/presence-report";
import { AdminAiOperations } from "./admin-ai-operations";
import { AdminAnalytics } from "./admin-analytics";
import { AdminClientReviews } from "./admin-client-reviews";
import { AdminLiveUsers } from "./admin-live-users";
import { AdminPlatformLogs } from "./admin-platform-logs";
import { AdminUsers, type AdminSummary, type AdminUser } from "./admin-users";
import { CacheControl } from "./cache-control";
import { DataTable, type Column } from "./data-table";
import { PieChart } from "./pie-chart";
import { StatTile, deltaOf } from "./stat-tile";
import { authHeaders, syncSessionCookie, useSubscription } from "./subscription-provider";

type IconProps = { className?: string };

export type SuperAdminSectionId =
  | "overview"
  | "analytics"
  | "ai"
  | "hackers"
  | "logs"
  | "live"
  | "users"
  | "subscriptions"
  | "reviews"
  | "features"
  | "cache"
  | "application";

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

/**
 * The part of the analytics report the overview reads.
 *
 * Yesterday rides along with today so every tile can carry a direction: 214 visitors is either very
 * good or very bad and a bare number cannot say which.
 */
type TrafficPayload = {
  today?: { visitors?: number; views?: number; signins?: number; signups?: number; featureOpens?: number };
  yesterday?: { visitors?: number; views?: number; signins?: number; signups?: number; featureOpens?: number };
  trending?: { label?: string } | null;
  features?: FeatureUsage[];
};

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

function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function LiveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" />
    </svg>
  );
}

function AiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9.5 9.5h5v5h-5z" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </svg>
  );
}

function LogsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 4.5h14" />
      <path d="M5 9.5h9" />
      <path d="M5 14.5h14" />
      <path d="M5 19.5h9" />
      <path d="M18 8.5v4" />
      <path d="M16 10.5h4" />
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
    href: "/console",
    icon: DashboardIcon,
  },
  {
    id: "analytics",
    label: "Traffic & Usage",
    description: "Daily visitors, sign-ins, sign-ups and the AI features the audience actually opens.",
    href: "/analytics",
    icon: AnalyticsIcon,
  },
  {
    id: "ai",
    label: "AI Operations",
    description: "Model spend, latency and how often a reader gets the composed read instead of the written one.",
    href: "/ai",
    icon: AiIcon,
  },
  {
    id: "hackers",
    label: "App Hackers",
    description: "Threat monitor for rate-limit abuse, injection probes, privilege escalation and bot scans.",
    href: "/hackers",
    icon: LogsIcon,
  },
  {
    id: "logs",
    label: "Platform Logs",
    description: "Dashboard usability, API, AI, upstream data, billing, security and system logs with sanitized storage.",
    href: "/platform-logs",
    icon: LogsIcon,
  },
  {
    id: "users",
    label: "Application Users",
    description: "Search accounts, verify emails, assign plans and manage admin roles.",
    href: "/users",
    icon: UsersIcon,
  },
  {
    id: "subscriptions",
    label: "Subscription Users",
    description: "Review paid accounts, grant access, revoke subscriptions and change tiers.",
    href: "/subscriptions",
    icon: SubscriptionIcon,
  },
  {
    id: "reviews",
    label: "Client Reviews",
    description: "Upload client review comments, profile images, signatures and star ratings for the landing page.",
    href: "/reviews",
    icon: ReviewsIcon,
  },
  {
    id: "features",
    label: "Feature Locks",
    description: "Turn AI surfaces on or off without changing code.",
    href: "/features",
    icon: FeatureIcon,
  },
  {
    id: "cache",
    label: "Cache Control",
    description: "Purge market, AI and news caches when a feed needs a hard refresh.",
    href: "/cache",
    icon: CacheIcon,
  },
  {
    id: "application",
    label: "Application",
    description: "Operational links and application management checklist.",
    href: "/application",
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rose-600 dark:text-rose-300">StockersAI</p>
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

const URGENCY_STYLE: Record<Urgency, { chip: string; card: string; word: string }> = {
  critical: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    card: "border-rose-200 dark:border-rose-500/30",
    word: "Now",
  },
  warning: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    card: "border-amber-200 dark:border-amber-500/30",
    word: "Soon",
  },
  info: {
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    card: "border-slate-200 dark:border-slate-800",
    word: "Note",
  },
};

/**
 * The things that need somebody, worst first.
 *
 * This sits at the top of the overview because it is the question an admin actually opens the page
 * with. A wall of totals answers "how are we doing"; nothing in it answers "is anything wrong, and
 * is anything about to be", which is what a lapsing subscription or an integration that stopped
 * answering is. Every row names a number, a reason and the page that fixes it.
 */
function AttentionQueue({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Nothing needs you</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          No subscription is lapsing this week, every integration is answering, and no account is stuck unverified.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Needs attention</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {items.length} item{items.length === 1 ? "" : "s"}, most urgent first
        </p>
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const style = URGENCY_STYLE[item.urgency];

          return (
            <li key={item.id} className={`rounded-2xl border bg-white p-4 dark:bg-slate-900 ${style.card}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.chip}`}>{style.word}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.detail}</p>
              <Link
                href={item.href}
                className="mt-3 inline-block rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-violet-500/10"
              >
                {item.action} →
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CHECK_STYLE: Record<CheckState, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "OK" },
  degraded: { dot: "bg-amber-500", label: "Degraded" },
  off: { dot: "bg-rose-500", label: "Down" },
};

/** How often the health panel re-probes. Slower than the live-users poll: this one runs queries. */
const HEALTH_REFRESH_MS = 30_000;

/** Seconds as the largest unit that still reads as a round number. */
export function uptimeText(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

/**
 * A latency, coloured by whether it is worth doing something about.
 *
 * The thresholds are round numbers rather than measured ones — anything under a fifth of a second
 * is invisible to a reader, and anything over a second is a page that feels broken.
 */
function Latency({ ms }: { ms: number | null }) {
  if (ms === null) return null;

  const tone =
    ms >= 1_000
      ? "text-rose-600 dark:text-rose-400"
      : ms >= 200
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-400 dark:text-slate-500";

  return <span className={`ml-2 font-mono text-[10px] font-bold tabular-nums ${tone}`}>{ms}ms</span>;
}

/**
 * Which parts of this deployment are wired up, and what the app does where they are not.
 *
 * The app degrades quietly by design — no AI key and the reads are composed from figures instead,
 * no Supabase and accounts go to a file. That is right for a visitor and useless for the person
 * running it, who otherwise cannot tell "nobody subscribed today" from "payments were never
 * configured". The consequence line is the point of the panel: `degraded` is often a deliberate
 * state rather than a fault, and saying which is the only way the colour means anything.
 */
function SystemHealth({ report, age }: { report: HealthReport | null; age: number }) {
  // A panel whose whole job is reporting that something is wrong must not be the thing that breaks
  // when something is. An unexpected payload leaves it waiting rather than taking the page down.
  if (!report || !Array.isArray(report.checks) || !CHECK_STYLE[report.worst]) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Checking integrations…</p>;
  }

  // Read defensively for the same reason: `stats` arrives from a route that a proxy could answer
  // for, and a missing block must leave the panel one strip shorter rather than throwing.
  const stats = report.stats;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className={`h-2 w-2 animate-pulse rounded-full ${CHECK_STYLE[report.worst].dot}`} aria-hidden="true" />
        <span className="font-semibold text-slate-900 dark:text-white">
          {report.worst === "ok" ? "Everything is answering" : report.worst === "degraded" ? "Running with some services off" : "Something is down"}
        </span>
        <span>· accounts in {report.backend === "supabase" ? "Supabase" : "a local JSON file"}</span>
        {/* The panel re-probes on a timer, so it has to say how old what it is showing is —
            otherwise a frozen page and a healthy one look exactly alike. */}
        <span>· re-probed {age < 5 ? "just now" : `${age}s ago`}</span>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile
              label="Checks passing"
              value={`${stats.counts.ok}/${stats.counts.total}`}
              hint={stats.counts.off > 0 ? `${stats.counts.off} down` : stats.counts.degraded > 0 ? `${stats.counts.degraded} degraded` : "Nothing degraded"}
              tone={
                stats.counts.off > 0
                  ? "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10"
                  : stats.counts.degraded > 0
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
              }
            />
            <StatTile
              label="Slowest probe"
              value={stats.slowestMs === null ? "—" : `${stats.slowestMs}ms`}
              hint={stats.slowestMs === null ? "Nothing to probe" : `${stats.probeMs}ms for all of them`}
              tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10"
            />
            <StatTile
              label="Instance uptime"
              value={uptimeText(stats.uptimeSeconds)}
              hint={`Node ${stats.nodeVersion} · ${stats.environment}`}
              tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
            <StatTile
              label="Memory in use"
              value={`${stats.memoryMb} MB`}
              hint={`${stats.heapUsedMb} of ${stats.heapTotalMb} MB heap`}
              tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10"
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Uptime and memory belong to the server instance that answered this request, which on a
            serverless host is one of several.
          </p>
        </>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {report.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CHECK_STYLE[check.state]?.dot ?? "bg-slate-300"}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {check.label}
                {/* The state as a word as well as a dot: colour alone is not a channel. */}
                <span className="ml-2 font-semibold text-slate-400 dark:text-slate-500">{CHECK_STYLE[check.state]?.label ?? "Unknown"}</span>
                <Latency ms={check.latencyMs ?? null} />
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{check.detail}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{check.consequence}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the app has been paid — the ledger that was being written and never read. */
function RevenuePanel({ ledger }: { ledger: LedgerState | null }) {
  if (!ledger) return <p className="text-sm text-slate-500 dark:text-slate-400">Reading the ledger…</p>;

  if (!ledger.available) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {ledger.message}
      </p>
    );
  }

  const { summary } = ledger;
  const rolling = deltaOf(summary.last30Paise, summary.previous30Paise);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="This month"
          value={formatPaise(summary.monthPaise)}
          hint={`${summary.monthCount} payment${summary.monthCount === 1 ? "" : "s"}`}
          tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        />
        <StatTile
          label="Last 30 days"
          value={formatPaise(summary.last30Paise)}
          hint={rolling.text}
          tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10"
        />
        <StatTile
          label="All time"
          value={formatPaise(summary.allTimePaise)}
          hint={`${summary.paymentCount} payment${summary.paymentCount === 1 ? "" : "s"}`}
          tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10"
        />
        <StatTile
          label="Average payment"
          value={formatPaise(summary.averagePaise)}
          hint={`${summary.payingAccounts} paying account${summary.payingAccounts === 1 ? "" : "s"}`}
          tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
      </div>

      {summary.byPlan.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by plan</p>
            <PieChart
              slices={summary.byPlan.map((slice) => ({
                key: slice.key,
                label: slice.label,
                // Rupees rather than paise: the centre readout and the legend are money, and a
                // legend reading "4900000" for ₹49,000 is a number nobody can parse at a glance.
                value: Math.round(slice.paise / 100),
                meta: `${slice.count} payment${slice.count === 1 ? "" : "s"}`,
              }))}
              total="Rupees billed"
              unit="rupees"
              empty="No payment has been recorded yet."
            />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by billing cycle</p>
            <PieChart
              slices={summary.byCycle.map((slice) => ({
                key: slice.key,
                label: slice.label,
                value: Math.round(slice.paise / 100),
                meta: `${slice.count} payment${slice.count === 1 ? "" : "s"}`,
              }))}
              total="Rupees billed"
              unit="rupees"
              empty="No payment has been recorded yet."
            />
          </div>
        </div>
      )}

      {summary.discounted > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {summary.discounted} of {summary.paymentCount} payments carried a promo or referral code.
        </p>
      )}

      {summary.recent.length > 0 && (
        <DataTable
          rows={summary.recent}
          columns={[
            {
              key: "paidAt",
              header: "Paid",
              cell: (row) => new Date(row.paidAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
              sortValue: (row) => row.paidAt,
              className: "whitespace-nowrap",
            },
            { key: "plan", header: "Plan", cell: (row) => row.plan, sortValue: (row) => row.plan },
            { key: "cycle", header: "Cycle", cell: (row) => row.cycle, sortValue: (row) => row.cycle },
            {
              key: "amount",
              header: "Amount",
              align: "right",
              cell: (row) => formatPaise(row.amountPaise),
              sortValue: (row) => row.amountPaise,
              className: "tabular-nums font-semibold text-slate-900 dark:text-white",
            },
            { key: "code", header: "Code", cell: (row) => row.promoCode ?? row.referralCode ?? "—" },
            { key: "until", header: "Paid up to", cell: (row) => row.subscribedUntil ?? "—", sortValue: (row) => row.subscribedUntil, className: "whitespace-nowrap" },
          ]}
          rowKey={(row) => row.paymentId}
          caption="The most recent payments"
          searchFields={(row) => [row.plan, row.cycle, row.promoCode, row.referralCode, row.paymentId]}
          searchPlaceholder="Search plan, cycle or code"
          pageSize={5}
          minWidth={640}
          empty="No payment matches these filters."
        />
      )}
    </div>
  );
}

function AdminAccessGate({ children, requireSuperAdmin = false }: { children: React.ReactNode; requireSuperAdmin?: boolean }) {
  const { status, loading } = useSubscription();

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Checking admin access...</p>;
  }

  if (status && !status.isAdmin) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Administrators only</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This dashboard controls application access, subscriptions and cache state.</p>
        <Link href="/overview" className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (status && requireSuperAdmin && !status.isSuperAdmin) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-500/30 dark:bg-rose-500/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Super admin only</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Platform logs contain security and operational signals restricted to the super admin role.</p>
        <Link href="/console" className="mt-4 inline-block rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950">
          Back to console
        </Link>
      </div>
    );
  }

  return children;
}

const OVERVIEW_CARD = "rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";

function SuperAdminOverview() {
  const { status } = useSubscription();
  const [payload, setPayload] = useState<RosterPayload | null>(null);
  const [traffic, setTraffic] = useState<TrafficPayload | null>(null);
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [presence, setPresence] = useState<LivePresenceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Seconds since the last health probe, so the card can say how old what it shows is. */
  const [healthAge, setHealthAge] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    /**
     * Each panel loads on its own.
     *
     * Five independent reads, and the slowest of them touches the exchange-free but still remote
     * Supabase five times. Awaiting them as one would hold the whole page at "loading" for the
     * slowest, when the roster and the traffic strip are usually ready long before the health
     * probe finishes.
     *
     * Only the roster raises an error banner. It is the page's spine — every other panel below
     * says its own piece when it cannot load, and five stacked banners for one dropped connection
     * would be louder than the problem.
     */
    const pull = async <T,>(url: string, apply: (data: T) => void, onFail?: () => void) => {
      try {
        const response = await fetch(url, { headers: authHeaders(), signal: controller.signal });
        if (!response.ok) throw new Error("failed");
        apply((await response.json()) as T);
      } catch {
        if (!controller.signal.aborted) onFail?.();
      }
    };

    void pull<RosterPayload>("/api/admin/users", setPayload, () => setError("Couldn't load admin totals."));
    void pull<TrafficPayload>("/api/admin/analytics?days=1", setTraffic);

    // These two are checked for shape before they are kept. A route behind a proxy that answers
    // with a login page, or an endpoint that changes, would otherwise reach a panel as an object
    // with none of the fields it reads — and the health panel in particular exists to report that
    // something is wrong, so it must never be the thing that breaks when something is.
    void pull<LedgerState>("/api/admin/revenue", (data) => {
      if (data && typeof data.available === "boolean") setLedger(data);
    });

    /**
     * Health and presence are pulled again on a timer; the three above are not.
     *
     * The difference is what the figure means. How many accounts exist and what was billed last
     * month do not change while somebody reads the page, so re-reading them would be four more
     * queries an hour for the same answer. "Is the database still answering" and "how many people
     * are on the site" are both false the moment they stop being re-measured — a stale number
     * there is not merely old, it is wrong in a way the reader cannot see.
     */
    const probeHealth = () =>
      pull<HealthReport>("/api/admin/health", (data) => {
        if (data && Array.isArray(data.checks)) {
          setHealth(data);
          setHealthAge(0);
        }
      });

    const readPresence = () =>
      pull<LivePresenceState>("/api/admin/presence", (data) => {
        if (data && typeof data.available === "boolean") setPresence(data);
      });

    void probeHealth();
    void readPresence();

    const refresh = () => {
      // Nobody is reading an overview in a background tab, and an admin dashboard left open
      // overnight should not spend the night probing the database.
      if (document.visibilityState === "hidden") return;
      void probeHealth();
      void readPresence();
    };

    const timer = window.setInterval(refresh, HEALTH_REFRESH_MS);
    // A tick a second, so "re-probed 8s ago" counts up between probes rather than jumping.
    const clock = window.setInterval(() => setHealthAge((seconds) => seconds + 1), 1_000);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const lockedCount = Object.values(status?.locks ?? {}).filter(Boolean).length;
  const summary = payload?.summary;
  const accounts = useMemo(() => payload?.users ?? [], [payload]);
  const today = payload?.today ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  /** The presence report when the store answered; a store that is not there is not a figure. */
  const live = presence?.available ? presence : null;
  const subscribed = summary?.subscribed ?? 0;
  const activeRate = summary?.total ? Math.round((subscribed / summary.total) * 100) : 0;
  const starter = (summary?.total ?? 0) - (summary?.pro ?? 0) - (summary?.elite ?? 0);

  const attention = useMemo(
    () =>
      buildAttentionQueue({
        accounts,
        today,
        features: traffic?.features ?? [],
        lockedFeatures: lockedCount,
        unhealthyChecks: (health?.checks ?? []).filter((check) => check.state === "off").length,
        ledgerUnavailable: ledger !== null && !ledger.available && ledger.reason !== "no-backend",
      }),
    [accounts, today, traffic, lockedCount, health, ledger],
  );

  /** Subscriptions running out this week, as a table an admin can work straight down. */
  const expiring = useMemo(() => expiringSoon(accounts, today), [accounts, today]);

  const expiringColumns: Column<AdminUser>[] = [
    {
      key: "who",
      header: "Account",
      cell: (account) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{account.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{account.email}</p>
        </div>
      ),
      sortValue: (account) => account.name,
    },
    { key: "plan", header: "Plan", cell: (account) => account.plan, sortValue: (account) => account.plan },
    {
      key: "until",
      header: "Runs out",
      cell: (account) => account.subscribedUntil ?? "—",
      sortValue: (account) => account.subscribedUntil ?? null,
      className: "whitespace-nowrap",
    },
    {
      key: "left",
      header: "Days left",
      align: "right",
      cell: (account) => {
        const left = daysUntil(account.subscribedUntil, today) ?? 0;
        return (
          <span className={left <= 2 ? "font-bold text-rose-600 dark:text-rose-400" : "font-semibold"}>
            {left === 0 ? "today" : left}
          </span>
        );
      },
      sortValue: (account) => daysUntil(account.subscribedUntil, today),
      className: "tabular-nums",
    },
  ];

  return (
    <AdminAccessGate>
      <div className="flex flex-col gap-6">
        {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

        {/* What needs doing leads the page. The totals below it are context for these. */}
        {payload && <AttentionQueue items={attention} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {/* First, because it is the only figure here that is true of this minute rather than of
              the record — and the one an admin opening the page most wants a glance at. */}
          <StatTile
            label="On the site now"
            value={live ? live.summary.online : "..."}
            hint={live ? `${live.summary.signedIn} signed in · ${live.summary.guests} visitors` : "Reading live sessions"}
            tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
          />
          <StatTile label="Accounts" value={summary?.total ?? "..."} hint={`${summary?.verified ?? 0} verified`} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <StatTile label="Subscribers" value={payload ? subscribed : "..."} hint={`${activeRate}% of accounts`} tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
          <StatTile label="Admins" value={summary?.admins ?? "..."} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
          <StatTile label="Locked features" value={lockedCount} hint={lockedCount > 0 ? "off for everyone" : "all available"} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
        </div>

        <section className={OVERVIEW_CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Today&apos;s traffic</h2>
            <Link href="/analytics" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300">
              Full report
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Visitors" value={traffic?.today?.visitors ?? "..."} delta={traffic ? { now: traffic.today?.visitors ?? 0, before: traffic.yesterday?.visitors ?? 0 } : undefined} tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            <StatTile label="Page views" value={traffic?.today?.views ?? "..."} delta={traffic ? { now: traffic.today?.views ?? 0, before: traffic.yesterday?.views ?? 0 } : undefined} tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" />
            <StatTile label="Sign-ins" value={traffic?.today?.signins ?? "..."} delta={traffic ? { now: traffic.today?.signins ?? 0, before: traffic.yesterday?.signins ?? 0 } : undefined} tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" />
            <StatTile label="Sign-ups" value={traffic?.today?.signups ?? "..."} delta={traffic ? { now: traffic.today?.signups ?? 0, before: traffic.yesterday?.signups ?? 0 } : undefined} tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" />
            <StatTile label="AI opens" value={traffic?.today?.featureOpens ?? "..."} delta={traffic ? { now: traffic.today?.featureOpens ?? 0, before: traffic.yesterday?.featureOpens ?? 0 } : undefined} tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" />
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Trending AI feature today: <span className="font-semibold text-slate-900 dark:text-white">{traffic?.trending?.label ?? "None yet"}</span>
          </p>
        </section>

        <section className={OVERVIEW_CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Revenue</h2>
            <Link href="/subscriptions" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300">
              Subscriptions
            </Link>
          </div>
          <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
            Straight from the payment ledger — what was actually billed, not what the plan column says.
          </p>
          <RevenuePanel ledger={ledger} />
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className={OVERVIEW_CARD}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Who holds what</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
              Every registered account by the plan on it. {activeRate}% currently hold a paid subscription.
            </p>
            {payload ? (
              <PieChart
                slices={[
                  { key: "Starter", label: "Starter", value: Math.max(0, starter) },
                  { key: "Pro", label: "Pro", value: summary?.pro ?? 0 },
                  { key: "Elite", label: "Elite", value: summary?.elite ?? 0 },
                ]}
                total="Accounts"
                unit="accounts"
                empty="No account has been registered yet."
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading accounts…</p>
            )}
          </section>

          <section className={OVERVIEW_CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">System health</h2>
              <Link href="/analytics" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300">
                Live users
              </Link>
            </div>
            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
              Re-probed every {Math.round(HEALTH_REFRESH_MS / 1_000)} seconds: what is wired up, how
              fast each store is answering, and what this instance is running on.
            </p>
            <SystemHealth report={health} age={healthAge} />
          </section>
        </div>

        {expiring.length > 0 && (
          <section className={OVERVIEW_CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Lapsing this week</h2>
              <Link href="/subscriptions" className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300">
                Renew or extend
              </Link>
            </div>
            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
              Paid accounts whose access runs out within seven days, soonest first.
            </p>
            <DataTable
              rows={expiring}
              columns={expiringColumns}
              rowKey={(account) => account.id}
              caption="Subscriptions lapsing within seven days"
              searchFields={(account) => [account.name, account.email, account.plan]}
              searchPlaceholder="Search name, email or plan"
              pageSize={5}
              minWidth={560}
              initialSort={{ column: "left", direction: "asc" }}
              empty="No lapsing subscription matches these filters."
            />
          </section>
        )}

        <section className={OVERVIEW_CARD}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quick actions</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SUPER_ADMIN_SECTIONS.filter((section) => section.id !== "overview").map((section) => (
              <Link key={section.id} href={section.href} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-violet-500/10">
                {section.label}
                <span className="mt-0.5 block text-[11px] font-normal text-slate-400 dark:text-slate-500">{section.description}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminAccessGate>
  );
}

/** How far back the usage figures beside each lock are measured. */
const LOCK_USAGE_DAYS = 30;
/**
 * Above this many opens in the window, locking a feature is disruptive enough to confirm first.
 *
 * A number rather than "any usage at all": a feature somebody opened twice while testing should
 * not put a modal in the way, and one that forty people rely on should.
 */
const DISRUPTIVE_OPENS = 10;

/**
 * The AI feature switchboard.
 *
 * This page turns features off for *everyone*, including subscribers who have paid for the tier
 * that contains them — which makes it the most consequential screen in the admin area and, until
 * now, the one with the least information on it. It was seventeen toggles and a tier heading: no
 * way to tell which of them anybody uses, no way to find one without scrolling, no way to act on
 * more than one at a time, and no warning before taking away something people are mid-way through.
 *
 * So each control now carries the last thirty days of its own usage, read from the same analytics
 * the Traffic & Usage page reports from. Locking something with real traffic asks first and names
 * the number. Nothing here changes what a lock *does* — the enforcement is unchanged and still
 * happens on the server — only what the person pressing it can see before they do.
 */
function FeatureLocksPanel() {
  const { status, loading, setLock, refresh } = useSubscription();
  const [busyFeature, setBusyFeature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<FeatureUsage[] | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "starter" | "pro" | "elite">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "locked" | "open" | "used" | "unused">("all");
  /** The lock awaiting confirmation, when it would disrupt real usage. */
  const [confirming, setConfirming] = useState<{ key: string; label: string; opens: number; users: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // Usage is context, not content: if it cannot be read the switchboard still works and simply
    // shows no figures, which is why this failure is swallowed rather than surfaced.
    fetch(`/api/admin/analytics?days=${LOCK_USAGE_DAYS}`, { headers: authHeaders(), signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: { features?: FeatureUsage[] }) => setUsage(data.features ?? []))
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  const usageByKey = useMemo(() => new Map((usage ?? []).map((feature) => [feature.key as string, feature])), [usage]);
  // Read inside the memo rather than defaulted outside it: a fresh `{}` on every render would be a
  // new dependency every time, so the rows would rebuild on each keystroke in the search box.
  const locks = status?.locks;

  const rows = useMemo(
    () =>
      AI_FEATURES.map((feature) => {
        const stats = usageByKey.get(feature.key);
        return {
          ...feature,
          locked: locks?.[feature.key] === true,
          opens: stats?.opens ?? 0,
          people: stats?.users ?? 0,
          blocked: stats?.blocked ?? 0,
          lastAt: stats?.lastAt ?? null,
        };
      }),
    [locks, usageByKey],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (tierFilter !== "all" && row.tier !== tierFilter) return false;
      if (stateFilter === "locked" && !row.locked) return false;
      if (stateFilter === "open" && row.locked) return false;
      if (stateFilter === "used" && row.opens === 0) return false;
      if (stateFilter === "unused" && row.opens > 0) return false;
      if (needle && !`${row.label} ${row.blurb} ${row.key}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, query, tierFilter, stateFilter]);

  const lockedCount = rows.filter((row) => row.locked).length;
  const withheld = rows.filter((row) => row.locked).reduce((sum, row) => sum + row.opens, 0);
  const dirty = query.trim() !== "" || tierFilter !== "all" || stateFilter !== "all";

  const apply = async (key: string, locked: boolean) => {
    setBusyFeature(key);
    setError(null);
    try {
      await setLock(key, locked);
      await refresh();
    } catch {
      setError("Couldn't update that feature lock.");
    } finally {
      setBusyFeature(null);
    }
  };

  /** Locking something people are using asks first; unlocking never does — it only gives back. */
  const toggle = (row: (typeof rows)[number]) => {
    if (!row.locked && row.opens >= DISRUPTIVE_OPENS) {
      setConfirming({ key: row.key, label: row.label, opens: row.opens, users: row.people });
      return;
    }
    void apply(row.key, !row.locked);
  };

  /**
   * Lock or unlock everything currently listed.
   *
   * Scoped to the filtered view rather than to a tier, so "unlock every Elite feature" and "unlock
   * everything I can see" are the same gesture. Applied in sequence: each write is a round trip
   * and firing seventeen at once would race the refresh that follows them.
   */
  const applyAll = async (locked: boolean) => {
    const targets = visible.filter((row) => row.locked !== locked);
    if (targets.length === 0) return;

    setBusyFeature("__bulk__");
    setError(null);
    try {
      for (const row of targets) await setLock(row.key, locked);
      await refresh();
    } catch {
      setError("Couldn't update every lock. Some may have changed.");
    } finally {
      setBusyFeature(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading feature locks...</p>;

  const FIELD_CLASS =
    "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

  return (
    <AdminAccessGate>
      <div className="flex flex-col gap-5">
        {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="AI features" value={rows.length} hint="Across three tiers" tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <StatTile
            label="Locked"
            value={lockedCount}
            hint={lockedCount > 0 ? "Off for everyone, including subscribers" : "Everything is available"}
            tone={lockedCount > 0 ? "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10" : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"}
          />
          <StatTile
            label="Usage withheld"
            value={withheld}
            hint={`Opens in the last ${LOCK_USAGE_DAYS} days on features now locked`}
            tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
          />
          <StatTile
            label="Never opened"
            value={usage === null ? "..." : rows.filter((row) => row.opens === 0).length}
            hint={`In the last ${LOCK_USAGE_DAYS} days`}
            tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          />
        </div>

        {/* One control row above everything it scopes, as on every other table in the admin area. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="sr-only" htmlFor="feature-lock-search">
              Search features
            </label>
            <input
              id="feature-lock-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a feature by name or description"
              className={`${FIELD_CLASS} w-full`}
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tier</span>
            <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value as typeof tierFilter)} className={FIELD_CLASS}>
              <option value="all">All tiers</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">State</span>
            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} className={FIELD_CLASS}>
              <option value="all">Any</option>
              <option value="locked">Locked</option>
              <option value="open">Open</option>
              <option value="used">Used recently</option>
              <option value="unused">Never opened</option>
            </select>
          </label>

          {dirty && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTierFilter("all");
                setStateFilter("all");
              }}
              className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={busyFeature !== null || visible.every((row) => row.locked)}
              onClick={() => void applyAll(true)}
              className="h-10 rounded-xl border border-rose-200 px-3.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              Lock these {visible.length}
            </button>
            <button
              type="button"
              disabled={busyFeature !== null || visible.every((row) => !row.locked)}
              onClick={() => void applyAll(false)}
              className="h-10 rounded-xl border border-emerald-200 px-3.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
            >
              Unlock these {visible.length}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No feature matches these filters.
          </p>
        ) : (
          (["starter", "pro", "elite"] as const)
            .map((tier) => ({ tier, features: visible.filter((row) => row.tier === tier) }))
            .filter((group) => group.features.length > 0)
            .map(({ tier, features }) => (
              <section key={tier} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{TIER_LABEL[tier]} features</h2>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {features.length} shown · {features.filter((row) => row.locked).length} locked
                  </p>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {features.map((feature) => {
                    const busy = busyFeature === feature.key || busyFeature === "__bulk__";

                    return (
                      <div
                        key={feature.key}
                        className={`rounded-2xl border p-4 transition ${
                          feature.locked
                            ? "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/5"
                            : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white">{feature.label}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{feature.blurb}</p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={feature.locked}
                            onClick={() => toggle(feature)}
                            className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold transition disabled:opacity-50 ${
                              feature.locked
                                ? "bg-rose-600 text-white hover:bg-rose-500"
                                : "border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-400"
                            }`}
                          >
                            {feature.locked ? "Locked" : "Open"}
                          </button>
                        </div>

                        {/* The figures that turn a switch into a decision. */}
                        <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-200 pt-3 text-center dark:border-slate-800">
                          <div>
                            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Opens</dt>
                            <dd className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                              {usage === null ? "…" : feature.opens}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">People</dt>
                            <dd className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                              {usage === null ? "…" : feature.people}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Refused</dt>
                            <dd className={`font-mono text-xs font-bold tabular-nums ${feature.blocked > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                              {usage === null ? "…" : feature.blocked}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Last</dt>
                            <dd className="font-mono text-[10px] font-bold text-slate-900 dark:text-white">
                              {feature.lastAt ? new Date(feature.lastAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                            </dd>
                          </div>
                        </dl>

                        {feature.locked && feature.opens > 0 && (
                          <p className="mt-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            {feature.people} {feature.people === 1 ? "person" : "people"} used this before it was locked.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Usage covers the last {LOCK_USAGE_DAYS} days and is counted on the server. A lock applies to everyone except
          administrators — including subscribers who have paid for the tier the feature belongs to.
        </p>
      </div>

      {/* Confirmation, and only in the direction that takes something away. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="lock-confirm-title">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 id="lock-confirm-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Turn off {confirming.label}?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              It was opened <span className="font-bold text-slate-900 dark:text-white">{confirming.opens} times</span> by{" "}
              <span className="font-bold text-slate-900 dark:text-white">{confirming.users} people</span> in the last{" "}
              {LOCK_USAGE_DAYS} days. Locking it removes it for everyone except administrators — including subscribers who
              have paid for it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="h-10 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep it on
              </button>
              <button
                type="button"
                onClick={() => {
                  const key = confirming.key;
                  setConfirming(null);
                  void apply(key, true);
                }}
                className="h-10 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                Lock it anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminAccessGate>
  );
}

function ApplicationPanel() {
  const { status } = useSubscription();
  const appLinks = [
    { href: "/overview", label: "Investor dashboard", detail: "Verify subscriber-facing AI sections." },
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
    case "analytics":
      return (
        <AdminAccessGate>
          <AdminAnalytics />
        </AdminAccessGate>
      );
    case "ai":
      return (
        <AdminAccessGate>
          <AdminAiOperations />
        </AdminAccessGate>
      );
    case "logs":
      return (
        <AdminAccessGate requireSuperAdmin>
          <AdminPlatformLogs />
        </AdminAccessGate>
      );
    case "hackers":
      return (
        <AdminAccessGate requireSuperAdmin>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">App Hackers & Threat Monitor</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This security monitor runs as a dedicated RSC-backed page.</p>
            <Link href="/hackers" className="mt-4 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
              Open threat monitor
            </Link>
          </div>
        </AdminAccessGate>
      );
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
      return (
        <AdminAccessGate>
          <CacheControl />
        </AdminAccessGate>
      );
    case "application":
      return <ApplicationPanel />;
    default:
      return <SuperAdminOverview />;
  }
}

export function SuperAdminDashboard({ active, children }: { active: SuperAdminSectionId; children?: ReactNode }) {
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
                  <Link href="/overview" className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
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
            {children ?? <SectionContent active={active} />}
          </div>
        </div>
      </div>
    </div>
  );
}
