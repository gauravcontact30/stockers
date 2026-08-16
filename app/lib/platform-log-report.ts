import type { AnalyticsEvent } from "./analytics";
import { ACTIONS, isActionKey } from "./analytics";
import type { AiCallRecord } from "./ai-usage-report";
import type { PlatformLog, PlatformLogCategory, PlatformLogSeverity } from "./platform-logs";
import type { AdminUserView } from "./store";

export type PlatformCoreLogCategory = PlatformLogCategory | "audit";

export type PlatformLogEntry = PlatformLog & {
  userName: string | null;
  userEmail: string | null;
  coreCategory: PlatformCoreLogCategory;
};

export type PlatformLogGroup = {
  category: PlatformCoreLogCategory;
  label: string;
  description: string;
  tone: string;
  total: number;
  logs: PlatformLogEntry[];
  counts: Record<PlatformLogSeverity, number>;
  p95Ms: number | null;
};

export type PlatformDailyLogPoint = {
  day: string;
  logs: number;
  alerts: number;
  byCategory: Record<PlatformCoreLogCategory, number>;
};

export type PlatformLogReportFilters = {
  category: PlatformCoreLogCategory | "all";
  severity: PlatformLogSeverity | "all";
  source: string;
  query: string;
  page: number;
  pageSize: number;
};

export type PlatformLogReport = {
  range: { from: string; to: string; days: number };
  backend: "supabase" | "memory";
  processLocal: boolean;
  held: number;
  totals: {
    logs: number;
    star: number;
    info: number;
    warnings: number;
    errors: number;
    critical: number;
    alerts: number;
    slow: number;
  };
  daily: PlatformDailyLogPoint[];
  groups: PlatformLogGroup[];
  recentAlerts: PlatformLogEntry[];
  sourceOptions: string[];
  filters: PlatformLogReportFilters;
  page: {
    logs: PlatformLogEntry[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    hasMore: boolean;
  };
  liveStream: {
    enabled: boolean;
    mode: "polling";
    intervalMs: number;
    description: string;
  };
  starPerformers: PlatformLogEntry[];
};

export const PLATFORM_LOG_GROUP_ORDER: PlatformCoreLogCategory[] = [
  "dashboard",
  "api",
  "ai",
  "third-party",
  "data",
  "billing",
  "security",
  "system",
  "audit",
];

const GROUPS: Record<PlatformCoreLogCategory, Omit<PlatformLogGroup, "total" | "logs" | "counts" | "p95Ms">> = {
  dashboard: {
    category: "dashboard",
    label: "Subscribed User Dashboard Usability",
    description: "Dashboard visits, feature usage, blocked-feature events and subscribed-user workflow signals.",
    tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10",
  },
  api: {
    category: "api",
    label: "Application API",
    description: "Next.js API ingress, response status, latency, throttling and request-path operations.",
    tone: "border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10",
  },
  ai: {
    category: "ai",
    label: "AI Feature Performance",
    description: "OpenRouter model calls, AI feature latency, fallback use, token spend and model response health.",
    tone: "border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10",
  },
  "third-party": {
    category: "third-party",
    label: "Third-party Platforms",
    description: "BSE, NSE, OpenRouter, Razorpay and other upstream platform availability and failures.",
    tone: "border-indigo-200 bg-indigo-50 dark:border-indigo-500/25 dark:bg-indigo-500/10",
  },
  data: {
    category: "data",
    label: "Data Fetching",
    description: "Market-data fetches, cache refreshes, upstream data availability checks and catalogue hydration.",
    tone: "border-cyan-200 bg-cyan-50 dark:border-cyan-500/25 dark:bg-cyan-500/10",
  },
  billing: {
    category: "billing",
    label: "Billing",
    description: "Checkout, Razorpay order creation, payment verification, webhooks and subscription ledger signals.",
    tone: "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10",
  },
  security: {
    category: "security",
    label: "Security & Access",
    description: "Sign-ins, failed access attempts, admin access, lockouts and throttling-related entries.",
    tone: "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10",
  },
  system: {
    category: "system",
    label: "System",
    description: "Health checks, memory and uptime snapshots, cache operations and operational housekeeping logs.",
    tone: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900",
  },
  audit: {
    category: "audit",
    label: "Audit Trails",
    description: "High-privilege actions, admin configuration updates, permission changes and data export signals.",
    tone: "border-fuchsia-200 bg-fuchsia-50 dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10",
  },
};

const SEVERITIES: PlatformLogSeverity[] = ["star", "info", "warning", "error", "critical"];
const GROUP_LOG_LIMIT = 50;
const SLOW_MS = 5_000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
export const LIVE_LOG_REFRESH_MS = 20_000;

function emptyCounts(): Record<PlatformLogSeverity, number> {
  return { star: 0, info: 0, warning: 0, error: 0, critical: 0 };
}

function percentile(values: number[], fraction: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function userMap(users: AdminUserView[]): Map<string, AdminUserView> {
  return new Map(users.map((user) => [user.id, user]));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "[redacted]";
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${part.length > 1 ? "***" : ""}`)
    .join(" ");
}

function isSubscribed(user: AdminUserView | undefined, today: string): boolean {
  return Boolean(user?.subscribedUntil && user.subscribedUntil >= today);
}

function coreCategoryOf(log: PlatformLog): PlatformCoreLogCategory {
  const text = `${log.category} ${log.source} ${log.useCase} ${log.operation} ${log.message}`.toLowerCase();

  if (/audit|admin|lock|unlock|permission|role|configuration|config|purge|delete|export|grant|revoke|verify/.test(text)) {
    return "audit";
  }
  if (log.category === "security" || /auth|signin|login|password|mfa|access denied|forbidden/.test(text)) return "security";
  return log.category;
}

function entryFromLog(log: PlatformLog, users: Map<string, AdminUserView>): PlatformLogEntry {
  const user = log.userId ? users.get(log.userId) : undefined;
  return {
    ...log,
    userName: user?.name ? maskName(user.name) : null,
    userEmail: user?.email ? maskEmail(user.email) : null,
    coreCategory: coreCategoryOf(log),
  };
}

function analyticsLog(event: AnalyticsEvent, users: Map<string, AdminUserView>): PlatformLog | null {
  const user = event.userId ? users.get(event.userId) : undefined;
  const dashboardEvent =
    event.path?.startsWith("/overview") ||
    event.action === "nav.section" ||
    event.action?.startsWith("portfolio.") ||
    event.type === "feature";

  if (dashboardEvent && !isSubscribed(user, event.day)) return null;

  if (dashboardEvent) {
    const action = event.action && isActionKey(event.action) ? ACTIONS[event.action] : null;
    return {
      id: `analytics:${event.id}`,
      at: event.at,
      day: event.day,
      category: "dashboard",
      severity: event.blocked ? "warning" : "star",
      source: "Product analytics",
      useCase: "Subscribed user dashboard usability",
      operation: action ?? event.feature ?? event.path ?? event.type,
      message: event.blocked
        ? "Subscribed user reached a locked or unavailable feature."
        : `Subscribed user ${action ? action.toLowerCase() : event.type === "visit" ? "visited the dashboard" : "used a dashboard feature"}.`,
      statusCode: null,
      durationMs: null,
      userId: event.userId,
      path: event.path,
      method: null,
      metadata: {
        feature: event.feature,
        action: event.action,
        label: event.label,
        device: event.device,
        blocked: event.blocked,
      },
    };
  }

  if (event.type === "signin" || event.type === "signup") {
    return {
      id: `security:${event.id}`,
      at: event.at,
      day: event.day,
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Account access",
      operation: event.type,
      message: event.type === "signin" ? "User signed in successfully." : "New account created.",
      statusCode: null,
      durationMs: null,
      userId: event.userId,
      path: event.path,
      method: null,
      metadata: { device: event.device },
    };
  }

  return null;
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 40 && cursor <= to; guard++) {
    days.push(cursor);
    const date = new Date(`${cursor}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return days;
}

function dailyFrom(entries: PlatformLogEntry[], fromDay: string, today: string): PlatformDailyLogPoint[] {
  const byDay = new Map<string, PlatformLogEntry[]>();
  for (const entry of entries) {
    const rows = byDay.get(entry.day);
    if (rows) rows.push(entry);
    else byDay.set(entry.day, [entry]);
  }

  return daysBetween(fromDay, today).map((day) => {
    const rows = byDay.get(day) ?? [];
    return {
      day,
      logs: rows.length,
      alerts: rows.filter((entry) => entry.severity === "warning" || entry.severity === "error" || entry.severity === "critical").length,
      byCategory: PLATFORM_LOG_GROUP_ORDER.reduce(
        (counts, category) => {
          counts[category] = rows.filter((entry) => entry.coreCategory === category).length;
          return counts;
        },
        {} as Record<PlatformCoreLogCategory, number>,
      ),
    };
  });
}

function normalizedFilters(filters: Partial<PlatformLogReportFilters> | undefined): PlatformLogReportFilters {
  const page = Number.isFinite(filters?.page) ? Math.max(1, Math.round(filters?.page ?? 1)) : 1;
  const pageSize = Number.isFinite(filters?.pageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(10, Math.round(filters?.pageSize ?? DEFAULT_PAGE_SIZE)))
    : DEFAULT_PAGE_SIZE;

  return {
    category: filters?.category ?? "all",
    severity: filters?.severity ?? "all",
    source: typeof filters?.source === "string" && filters.source.trim() ? filters.source.trim() : "all",
    query: typeof filters?.query === "string" ? filters.query.trim().slice(0, 120) : "",
    page,
    pageSize,
  };
}

function matchesFilters(entry: PlatformLogEntry, filters: PlatformLogReportFilters, includeCategory = true): boolean {
  if (includeCategory && filters.category !== "all" && entry.coreCategory !== filters.category) return false;
  if (filters.severity !== "all" && entry.severity !== filters.severity) return false;
  if (filters.source !== "all" && entry.source !== filters.source) return false;
  if (filters.query) {
    const haystack = `${entry.source} ${entry.useCase} ${entry.operation} ${entry.message} ${entry.path ?? ""} ${entry.method ?? ""}`.toLowerCase();
    if (!haystack.includes(filters.query.toLowerCase())) return false;
  }
  return true;
}

function aiLog(call: AiCallRecord): PlatformLog {
  const ok = call.outcome === "ok";
  return {
    id: `ai-call:${call.id}`,
    at: call.at,
    day: call.day,
    category: "ai",
    severity: ok ? "star" : call.outcome === "unusable" ? "warning" : "error",
    source: "OpenRouter",
    useCase: "AI features performance, usability and latency",
    operation: call.feature,
    message: ok
      ? "AI feature produced a written response without fallback."
      : call.outcome === "unconfigured"
        ? "AI feature used composed fallback because no model key is configured."
        : "AI feature fell back to composed figures instead of a written model response.",
    statusCode: call.status,
    durationMs: call.ms,
    userId: null,
    path: null,
    method: "POST",
    metadata: {
      outcome: call.outcome,
      model: call.model,
      streamed: call.streamed,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      costUsd: call.costUsd,
      error: call.error,
    },
  };
}

export function buildPlatformLogReport({
  platformLogs,
  analyticsEvents,
  aiCalls,
  users,
  today,
  fromDay,
  days,
  backend,
  processLocal,
  held,
  filters,
}: {
  platformLogs: PlatformLog[];
  analyticsEvents: AnalyticsEvent[];
  aiCalls: AiCallRecord[];
  users: AdminUserView[];
  today: string;
  fromDay: string;
  days: number;
  backend: "supabase" | "memory";
  processLocal: boolean;
  held: number;
  filters?: Partial<PlatformLogReportFilters>;
}): PlatformLogReport {
  const activeFilters = normalizedFilters(filters);
  const usersById = userMap(users);
  const derived = [
    ...analyticsEvents.map((event) => analyticsLog(event, usersById)).filter((log): log is PlatformLog => log !== null),
    ...aiCalls.map(aiLog),
  ];

  const seen = new Set<string>();
  const entries = [...platformLogs, ...derived]
    .filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    })
    .map((log) => entryFromLog(log, usersById))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const groupScope = entries.filter((entry) => matchesFilters(entry, activeFilters, false));
  const filteredEntries = entries.filter((entry) => matchesFilters(entry, activeFilters));
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / activeFilters.pageSize));
  const page = Math.min(activeFilters.page, pageCount);
  const offset = (page - 1) * activeFilters.pageSize;

  const groups = PLATFORM_LOG_GROUP_ORDER.map((category) => GROUPS[category]).map((meta) => {
    const allLogs = groupScope.filter((entry) => entry.coreCategory === meta.category);
    const counts = emptyCounts();
    for (const log of allLogs) counts[log.severity] += 1;

    return {
      ...meta,
      total: allLogs.length,
      logs: allLogs.slice(0, GROUP_LOG_LIMIT),
      counts,
      p95Ms: percentile(
        allLogs.map((log) => log.durationMs).filter((value): value is number => typeof value === "number"),
        0.95,
      ),
    };
  });

  const totals = entries.reduce(
    (total, entry) => {
      total.logs += 1;
      total[entry.severity] += 1;
      if (entry.severity === "warning" || entry.severity === "error" || entry.severity === "critical") total.alerts += 1;
      if ((entry.durationMs ?? 0) >= SLOW_MS) total.slow += 1;
      return total;
    },
    { logs: 0, star: 0, info: 0, warning: 0, error: 0, critical: 0, alerts: 0, slow: 0 },
  );

  return {
    range: { from: fromDay, to: today, days },
    backend,
    processLocal,
    held,
    totals: {
      logs: totals.logs,
      star: totals.star,
      info: totals.info,
      warnings: totals.warning,
      errors: totals.error,
      critical: totals.critical,
      alerts: totals.alerts,
      slow: totals.slow,
    },
    daily: dailyFrom(entries, fromDay, today),
    groups,
    recentAlerts: entries.filter((entry) => ["warning", "error", "critical"].includes(entry.severity)).slice(0, 20),
    sourceOptions: [...new Set(entries.map((entry) => entry.source))].sort((a, b) => a.localeCompare(b)),
    filters: { ...activeFilters, page },
    page: {
      logs: filteredEntries.slice(offset, offset + activeFilters.pageSize),
      total: filteredEntries.length,
      page,
      pageSize: activeFilters.pageSize,
      pageCount,
      hasMore: page < pageCount,
    },
    liveStream: {
      enabled: true,
      mode: "polling",
      intervalMs: LIVE_LOG_REFRESH_MS,
      description: "Critical errors and new log rows refresh automatically while this page is open.",
    },
    starPerformers: entries.filter((entry) => entry.severity === "star").slice(0, 20),
  };
}

export { SEVERITIES };
