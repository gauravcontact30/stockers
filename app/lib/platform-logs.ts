// Durable operational logs for the Super Admin Platform Logs page.
//
// This is intentionally separate from product analytics and AI call telemetry. Analytics answers
// what people did; AI telemetry answers what the model did. Platform logs answer what the platform
// itself observed: API traffic, upstream data feeds, billing gateways, alerts and clean runs.
import "server-only";

import { randomBytes } from "node:crypto";
import { isMissingTable, supabaseConfigured, supabaseRequest } from "./supabase";

export type PlatformLogCategory =
  | "dashboard"
  | "api"
  | "ai"
  | "third-party"
  | "data"
  | "billing"
  | "security"
  | "system";

export type PlatformLogSeverity = "star" | "info" | "warning" | "error" | "critical";

export type PlatformLog = {
  id: string;
  at: string;
  day: string;
  category: PlatformLogCategory;
  severity: PlatformLogSeverity;
  source: string;
  useCase: string;
  operation: string;
  message: string;
  statusCode: number | null;
  durationMs: number | null;
  userId: string | null;
  path: string | null;
  method: string | null;
  metadata: Record<string, unknown>;
};

export type PlatformLogInput = {
  category: PlatformLogCategory;
  severity?: PlatformLogSeverity;
  source: string;
  useCase: string;
  operation: string;
  message: string;
  statusCode?: number | null;
  durationMs?: number | null;
  userId?: string | null;
  path?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown>;
};

type PlatformLogRow = {
  id: string;
  at: string;
  day: string;
  category: string;
  severity: string;
  source: string;
  use_case: string;
  operation: string;
  message: string;
  status_code: number | null;
  duration_ms: number | null;
  user_id: string | null;
  path: string | null;
  method: string | null;
  metadata: Record<string, unknown> | null;
};

const MEMORY_CAPACITY = 2_000;
const MAX_ROWS = 5_000;
const WRITE_BATCH_SIZE = 25;
const WRITE_BATCH_DELAY_MS = 1_000;
export const PLATFORM_LOG_RETENTION_DAYS = 25;
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;

let memory: PlatformLog[] = [];
let tableMissing = false;
let pendingRows: PlatformLogRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let lastPruneAt = 0;

function istDay(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dayBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function retentionCutoff(today = istDay(new Date())): string {
  return dayBefore(today, PLATFORM_LOG_RETENTION_DAYS - 1);
}

function clip(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function cleanPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed.split(/[?#]/)[0].slice(0, 160) : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function compactMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const entries = Object.entries(value).slice(0, 24).map(([key, item]) => {
    if (typeof item === "string") return [key.slice(0, 48), item.slice(0, 240)] as const;
    if (typeof item === "number" || typeof item === "boolean" || item === null) return [key.slice(0, 48), item] as const;
    return [key.slice(0, 48), JSON.stringify(item).slice(0, 240)] as const;
  });
  return Object.fromEntries(entries);
}

export function severityForStatus(status: number | null, durationMs: number | null = null): PlatformLogSeverity {
  if (status !== null && status >= 500) return "error";
  if (status !== null && status >= 400) return status === 429 ? "warning" : "error";
  if (durationMs !== null && durationMs >= 10_000) return "warning";
  return "star";
}

export function buildPlatformLog(input: PlatformLogInput, now = new Date()): PlatformLog {
  const statusCode = finiteOrNull(input.statusCode);
  const durationMs = finiteOrNull(input.durationMs);

  return {
    id: `plog_${now.getTime().toString(36)}_${randomBytes(4).toString("hex")}`,
    at: now.toISOString(),
    day: istDay(now),
    category: input.category,
    severity: input.severity ?? severityForStatus(statusCode, durationMs),
    source: clip(input.source, 80),
    useCase: clip(input.useCase, 120),
    operation: clip(input.operation, 160),
    message: clip(input.message, 320),
    statusCode,
    durationMs,
    userId: input.userId ?? null,
    path: cleanPath(input.path),
    method: input.method ? clip(input.method.toUpperCase(), 12) : null,
    metadata: compactMetadata(input.metadata),
  };
}

function toRow(log: PlatformLog): PlatformLogRow {
  return {
    id: log.id,
    at: log.at,
    day: log.day,
    category: log.category,
    severity: log.severity,
    source: log.source,
    use_case: log.useCase,
    operation: log.operation,
    message: log.message,
    status_code: log.statusCode,
    duration_ms: log.durationMs,
    user_id: log.userId,
    path: log.path,
    method: log.method,
    metadata: log.metadata,
  };
}

function fromRow(row: PlatformLogRow): PlatformLog {
  return {
    id: row.id,
    at: row.at,
    day: row.day,
    category: row.category as PlatformLogCategory,
    severity: row.severity as PlatformLogSeverity,
    source: row.source,
    useCase: row.use_case,
    operation: row.operation,
    message: row.message,
    statusCode: finiteOrNull(row.status_code),
    durationMs: finiteOrNull(row.duration_ms),
    userId: row.user_id,
    path: row.path,
    method: row.method,
    metadata: row.metadata ?? {},
  };
}

function remember(log: PlatformLog): void {
  memory.push(log);
  if (memory.length > MEMORY_CAPACITY) memory.splice(0, memory.length - MEMORY_CAPACITY);
}

export function resetPlatformLogs(): void {
  memory = [];
  pendingRows = [];
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  flushing = false;
  lastPruneAt = 0;
  tableMissing = false;
}

function handlePersistError(error: unknown): void {
  if (isMissingTable(error)) {
    tableMissing = true;
    return;
  }
  if (String(error).includes("Dynamic server usage")) return;
  console.error("platform-logs: could not persist log", error);
}

function scheduleFlush(): void {
  if (!supabaseConfigured() || tableMissing || pendingRows.length === 0 || flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPlatformLogRows();
  }, WRITE_BATCH_DELAY_MS);
}

async function flushPlatformLogRows(): Promise<void> {
  if (flushing || !supabaseConfigured() || tableMissing || pendingRows.length === 0) return;
  flushing = true;
  const rows = pendingRows.splice(0, WRITE_BATCH_SIZE);

  try {
    await supabaseRequest({ method: "POST", path: "platform_logs", body: rows });
  } catch (error) {
    handlePersistError(error);
  } finally {
    flushing = false;
    if (pendingRows.length > 0) scheduleFlush();
  }
}

function pruneMemory(cutoffDay = retentionCutoff()): void {
  memory = memory.filter((log) => log.day >= cutoffDay);
  pendingRows = pendingRows.filter((row) => row.day >= cutoffDay);
}

export async function prunePlatformLogs(now = Date.now()): Promise<void> {
  const cutoffDay = retentionCutoff();
  pruneMemory(cutoffDay);

  if (!supabaseConfigured() || tableMissing || now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;

  try {
    await supabaseRequest({
      method: "DELETE",
      path: `platform_logs?day=lt.${encodeURIComponent(cutoffDay)}`,
    });
  } catch (error) {
    handlePersistError(error);
  }
}

export function recordPlatformLog(input: PlatformLogInput): void {
  let log: PlatformLog;

  try {
    log = buildPlatformLog(input);
  } catch (error) {
    console.error("platform-logs: could not build log", error);
    return;
  }

  remember(log);
  pruneMemory();
  void prunePlatformLogs();

  if (!supabaseConfigured() || tableMissing) return;
  pendingRows.push(toRow(log));
  if (pendingRows.length >= WRITE_BATCH_SIZE) void flushPlatformLogRows();
  else scheduleFlush();
}

export async function listPlatformLogs(fromDay: string): Promise<{
  logs: PlatformLog[];
  backend: "supabase" | "memory";
  processLocal: boolean;
  held: number;
}> {
  await prunePlatformLogs();
  const cutoffDay = retentionCutoff();
  const effectiveFromDay = fromDay > cutoffDay ? fromDay : cutoffDay;
  const local = memory.filter((log) => log.day >= effectiveFromDay).sort((a, b) => (a.at < b.at ? 1 : -1));

  if (supabaseConfigured() && !tableMissing) {
    try {
      const rows = await supabaseRequest<PlatformLogRow>({
        method: "GET",
        path: `platform_logs?day=gte.${encodeURIComponent(effectiveFromDay)}&select=*&order=at.desc&limit=${MAX_ROWS}`,
      });
      return { logs: rows.map(fromRow), backend: "supabase", processLocal: false, held: rows.length };
    } catch (error) {
      if (isMissingTable(error)) tableMissing = true;
      else console.error("platform-logs: could not read logs", error);
    }
  }

  return { logs: local, backend: "memory", processLocal: true, held: memory.length };
}
