import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { buildHealthReport, type HealthReport } from "../../../lib/admin-health";
import { dayBefore, istDay, listEvents } from "../../../lib/analytics";
import { listAiCalls } from "../../../lib/ai-telemetry";
import { logApplicationEvent } from "../../../lib/application-logger";
import { buildPlatformLogReport, PLATFORM_LOG_GROUP_ORDER, type PlatformCoreLogCategory } from "../../../lib/platform-log-report";
import {
  buildPlatformLog,
  listPlatformLogs,
  PLATFORM_LOG_RETENTION_DAYS,
  recordPlatformLog,
  type PlatformLog,
  type PlatformLogSeverity,
} from "../../../lib/platform-logs";
import { listUsers, userFromRequest } from "../../../lib/store";

const DEFAULT_DAYS = 1;
const MAX_DAYS = PLATFORM_LOG_RETENTION_DAYS;
let lastHealthLogDay: string | null = null;

type CollectorBody = {
  level?: unknown;
  source?: unknown;
  message?: unknown;
  operation?: unknown;
  path?: unknown;
  method?: unknown;
  statusCode?: unknown;
  durationMs?: unknown;
  metadata?: unknown;
};

type CollectorEnvelope = CollectorBody & {
  logs?: unknown;
};

const CORE_CATEGORIES = new Set<PlatformCoreLogCategory>(PLATFORM_LOG_GROUP_ORDER);
const SEVERITIES = new Set<PlatformLogSeverity>(["star", "info", "warning", "error", "critical"]);

function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function levelOf(value: unknown): "info" | "warn" | "error" {
  return value === "warn" || value === "error" || value === "info" ? value : "info";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function categoryFilter(value: string | null): PlatformCoreLogCategory | "all" {
  return value && CORE_CATEGORIES.has(value as PlatformCoreLogCategory) ? (value as PlatformCoreLogCategory) : "all";
}

function severityFilter(value: string | null): PlatformLogSeverity | "all" {
  return value && SEVERITIES.has(value as PlatformLogSeverity) ? (value as PlatformLogSeverity) : "all";
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !isSuperAdminEmail(user.email)) {
    return NextResponse.json({ error: "Super admin access required." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const days = rangeFrom(params.get("days"));
  const today = istDay();
  const fromDay = dayBefore(today, days - 1);

  try {
    const [platform, analyticsEvents, ai, users, health] = await Promise.all([
      listPlatformLogs(fromDay),
      listEvents(fromDay),
      listAiCalls(fromDay),
      listUsers(),
      buildHealthReport(),
    ]);
    const healthLogs = healthPlatformLogs(health);
    if (lastHealthLogDay !== today) {
      lastHealthLogDay = today;
      for (const log of healthLogs) {
        recordPlatformLog({
          category: log.category,
          severity: log.severity,
          source: log.source,
          useCase: log.useCase,
          operation: log.operation,
          message: log.message,
          statusCode: log.statusCode,
          durationMs: log.durationMs,
          userId: log.userId,
          path: log.path,
          method: log.method,
          metadata: log.metadata,
        });
      }
    }

    return NextResponse.json(
      buildPlatformLogReport({
        platformLogs: [...platform.logs, ...healthLogs],
        analyticsEvents,
        aiCalls: ai.calls,
        users,
        today,
        fromDay,
        days,
        backend: platform.backend,
        processLocal: platform.processLocal,
        held: platform.held,
        filters: {
          category: categoryFilter(params.get("category")),
          severity: severityFilter(params.get("severity")),
          source: params.get("source") ?? "all",
          query: params.get("q") ?? "",
          page: positiveInt(params.get("page"), 1),
          pageSize: positiveInt(params.get("pageSize"), 25),
        },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("platform logs report failed", error);
    return NextResponse.json({ error: "Couldn't read platform logs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin log collection is not allowed." }, { status: 403 });
  }

  let body: CollectorEnvelope | null;
  try {
    body = (await request.json()) as CollectorEnvelope;
  } catch {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const user = await userFromRequest(request).catch(() => null);
  const events = Array.isArray(body?.logs) ? body.logs.slice(0, 25) : [body];
  for (const event of events) {
    const log = metadataOf(event) as CollectorBody;
    logApplicationEvent({
      level: levelOf(log.level),
      source: log.source === "server" || log.source === "middleware" ? log.source : "client",
      category: "system",
      useCase: "System: centralized client/server log collector",
      operation: text(log.operation, "client.log"),
      message: text(log.message, "Client log event captured."),
      statusCode: numberOrNull(log.statusCode),
      durationMs: numberOrNull(log.durationMs),
      userId: user?.id ?? null,
      path: typeof log.path === "string" ? log.path : new URL(request.url).pathname,
      method: typeof log.method === "string" ? log.method : request.method,
      metadata: metadataOf(log.metadata),
    });
  }

  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

function healthPlatformLogs(health: HealthReport): PlatformLog[] {
  const logs: PlatformLog[] = [
    buildPlatformLog({
      category: "system",
      severity: health.worst === "off" ? "critical" : health.worst === "degraded" ? "warning" : "star",
      source: "System health",
      useCase: "System: CPU/memory, database probes and integration health",
      operation: "health.snapshot",
      message: "Application health snapshot collected for the Platform Logs dashboard.",
      durationMs: health.stats.probeMs,
      metadata: {
        uptimeSeconds: health.stats.uptimeSeconds,
        memoryMb: health.stats.memoryMb,
        heapUsedMb: health.stats.heapUsedMb,
        heapTotalMb: health.stats.heapTotalMb,
        nodeVersion: health.stats.nodeVersion,
        environment: health.stats.environment,
        slowestMs: health.stats.slowestMs,
        ok: health.stats.counts.ok,
        degraded: health.stats.counts.degraded,
        off: health.stats.counts.off,
      },
    }),
  ];

  for (const check of health.checks) {
    logs.push(
      buildPlatformLog({
        category: check.state === "ok" ? "system" : "third-party",
        severity: check.state === "ok" ? "star" : check.state === "degraded" ? "warning" : "critical",
        source: "System health",
        useCase: "Operational visibility and integration troubleshooting",
        operation: `health.${check.key}`,
        message: `${check.label}: ${check.detail}`,
        durationMs: check.latencyMs,
        metadata: { consequence: check.consequence },
      }),
    );
  }

  return logs;
}
