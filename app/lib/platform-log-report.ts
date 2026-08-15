import type { AnalyticsEvent } from "./analytics";
import { ACTIONS, isActionKey } from "./analytics";
import type { AiCallRecord } from "./ai-usage-report";
import type { PlatformLog, PlatformLogCategory, PlatformLogSeverity } from "./platform-logs";
import type { AdminUserView } from "./store";

export type PlatformLogEntry = PlatformLog & {
  userName: string | null;
  userEmail: string | null;
};

export type PlatformLogGroup = {
  category: PlatformLogCategory;
  label: string;
  description: string;
  tone: string;
  total: number;
  logs: PlatformLogEntry[];
  counts: Record<PlatformLogSeverity, number>;
  p95Ms: number | null;
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
  groups: PlatformLogGroup[];
  recentAlerts: PlatformLogEntry[];
  starPerformers: PlatformLogEntry[];
};

const GROUPS: Record<PlatformLogCategory, Omit<PlatformLogGroup, "total" | "logs" | "counts" | "p95Ms">> = {
  dashboard: {
    category: "dashboard",
    label: "Subscribed User Dashboard Usability",
    description: "Subscriber dashboard visits, feature opens, navigation and portfolio actions.",
    tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10",
  },
  api: {
    category: "api",
    label: "Application API",
    description: "API requests, rate-limit alerts, failures and route-level performance signals.",
    tone: "border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10",
  },
  ai: {
    category: "ai",
    label: "AI Feature Performance",
    description: "Model outcomes, fallback events, latency and usability signals from AI surfaces.",
    tone: "border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10",
  },
  "third-party": {
    category: "third-party",
    label: "Third-party Platforms",
    description: "BSE, NSE, OpenRouter, Razorpay and other upstream platform calls.",
    tone: "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10",
  },
  data: {
    category: "data",
    label: "Data Fetching",
    description: "Market-data fetches, cache refreshes and upstream data availability checks.",
    tone: "border-teal-200 bg-teal-50 dark:border-teal-500/25 dark:bg-teal-500/10",
  },
  billing: {
    category: "billing",
    label: "Billing",
    description: "Checkout, order creation, payment verification and subscription ledger signals.",
    tone: "border-lime-200 bg-lime-50 dark:border-lime-500/25 dark:bg-lime-500/10",
  },
  security: {
    category: "security",
    label: "Security & Access",
    description: "Sign-ins, admin access, lockouts and throttling-related entries.",
    tone: "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10",
  },
  system: {
    category: "system",
    label: "System",
    description: "Health, cache and operational housekeeping logs.",
    tone: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900",
  },
};

const SEVERITIES: PlatformLogSeverity[] = ["star", "info", "warning", "error", "critical"];
const GROUP_LOG_LIMIT = 50;
const SLOW_MS = 5_000;

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

function isSubscribed(user: AdminUserView | undefined, today: string): boolean {
  return Boolean(user?.subscribedUntil && user.subscribedUntil >= today);
}

function entryFromLog(log: PlatformLog, users: Map<string, AdminUserView>): PlatformLogEntry {
  const user = log.userId ? users.get(log.userId) : undefined;
  return {
    ...log,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
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
}): PlatformLogReport {
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

  const groups = Object.values(GROUPS).map((meta) => {
    const allLogs = entries.filter((entry) => entry.category === meta.category);
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
    groups,
    recentAlerts: entries.filter((entry) => ["warning", "error", "critical"].includes(entry.severity)).slice(0, 20),
    starPerformers: entries.filter((entry) => entry.severity === "star").slice(0, 20),
  };
}

export { SEVERITIES };
