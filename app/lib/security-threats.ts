import "server-only";

import { randomBytes } from "node:crypto";
import { isMissingTable, supabaseConfigured, supabaseRequest } from "./supabase";
import { dayBefore as analyticsDayBefore, istDay } from "./analytics";
import { clearPlatformLogsWhere, listPlatformLogs, PLATFORM_LOG_RETENTION_DAYS, recordPlatformLog, type PlatformLog } from "./platform-logs";

export type ThreatKind = "rate-limit" | "injection" | "privilege" | "exfiltration";
export type ThreatSeverity = "yellow" | "orange" | "red";
export type ThreatLevel = "Low" | "Medium" | "Critical";

export type SecurityThreatLog = {
  id: string;
  at: string;
  type: ThreatKind;
  title: string;
  severity: ThreatSeverity;
  source: string;
  useCase: string;
  operation: string;
  statusCode: number | null;
  durationMs: number | null;
  method: string | null;
  sourceIp: string;
  geo: string;
  route: string;
  stockSymbol: string | null;
  userAgent: string;
  headers: Record<string, string>;
  payload: string;
  message: string;
  metadata: Record<string, unknown>;
};

export type ThreatCard = {
  type: ThreatKind;
  title: string;
  description: string;
  severity: ThreatSeverity;
  count: number;
  lastDetectedAt: string | null;
  sourceIp: string;
  geo: string;
  route: string;
  stockSymbol: string | null;
  latest: SecurityThreatLog | null;
};

export type BlockedIp = {
  id: string;
  ip: string;
  reason: string;
  blockedAt: string;
  blockedBy: string;
};

export type SecurityThreatReport = {
  threatLevel: ThreatLevel;
  generatedAt: string;
  days: number;
  totalLogs: number;
  cards: ThreatCard[];
  logs: SecurityThreatLog[];
  blockedIps: BlockedIp[];
  schemaSql: string;
};

type BlockedIpRow = {
  id: string;
  ip: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
};

const THREATS: Record<ThreatKind, { title: string; description: string; severity: ThreatSeverity }> = {
  "rate-limit": {
    title: "Rate Limit Breaches",
    description: "Rapid automated API scraping of BSE stock endpoints or LLM research queries.",
    severity: "orange",
  },
  injection: {
    title: "SQL / NoSQL Injection Attempts",
    description: "Payloads attempting to alter stock ticker searches, query parameters, or JSON bodies.",
    severity: "red",
  },
  privilege: {
    title: "Unauthorized Privilege Escalation",
    description: "Attempts to reach admin endpoints or tamper with session and authorization tokens.",
    severity: "red",
  },
  exfiltration: {
    title: "Data Exfiltration / Bot Scans",
    description: "Bulk downloads, route discovery, and automated collection of proprietary AI analyses.",
    severity: "yellow",
  },
};

export const SECURITY_SCHEMA_SQL = `
create table if not exists public.blocked_ips (
  id text primary key,
  ip text not null unique,
  reason text not null,
  blocked_at timestamptz not null,
  blocked_by text not null
);

create index if not exists blocked_ips_blocked_at_idx
  on public.blocked_ips (blocked_at desc);

alter table public.blocked_ips enable row level security;
revoke all on public.blocked_ips from anon, authenticated;
`.trim();

let blockedMemory: BlockedIp[] = [];
let blockedTableMissing = false;

function clip(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function metadataText(log: PlatformLog, key: string, fallback = ""): string {
  const value = log.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function metadataObject(log: PlatformLog, key: string): Record<string, string> {
  const value = log.metadata[key];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .slice(0, 24)
            .map(([name, item]) => [clip(name, 64), clip(typeof item === "string" ? item : JSON.stringify(item), 2_000)]),
        );
      }
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 48)
      .map(([name, item]) => [clip(name, 64), clip(typeof item === "string" ? item : JSON.stringify(item), 2_000)]),
  );
}

function classify(log: PlatformLog): ThreatKind | null {
  const explicit = metadataText(log, "threatType");
  if (explicit in THREATS) return explicit as ThreatKind;
  const haystack = `${log.useCase} ${log.operation} ${log.message} ${log.path ?? ""}`.toLowerCase();
  if (haystack.includes("rate limit") || log.statusCode === 429) return "rate-limit";
  if (haystack.includes("csrf") || haystack.includes("origin") || haystack.includes("session") || haystack.includes("admin access")) return "privilege";
  if (haystack.includes("injection") || /('|--|\$where|union\s+select|drop\s+table)/i.test(haystack)) return "injection";
  if (haystack.includes("bot") || haystack.includes("scrap") || haystack.includes("bulk") || haystack.includes("scan")) return "exfiltration";
  return null;
}

function geoFor(ip: string): string {
  if (!ip || ip === "unknown") return "🏳️ Unknown";
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) return "🏠 Private";
  return "🌐 External";
}

function toThreat(log: PlatformLog): SecurityThreatLog | null {
  const type = classify(log);
  if (!type) return null;
  const sourceIp = metadataText(log, "sourceIp", metadataText(log, "clientIp", "unknown"));
  return {
    id: log.id,
    at: log.at,
    type,
    title: THREATS[type].title,
    severity: metadataText(log, "threatSeverity", THREATS[type].severity) as ThreatSeverity,
    source: log.source,
    useCase: log.useCase,
    operation: log.operation,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    method: log.method,
    sourceIp,
    geo: metadataText(log, "geo", geoFor(sourceIp)),
    route: log.path ?? metadataText(log, "route", "unknown"),
    stockSymbol: metadataText(log, "stockSymbol") || null,
    userAgent: metadataText(log, "userAgent", "unknown"),
    headers: metadataObject(log, "headers"),
    payload: metadataText(log, "payload", metadataText(log, "search", "")),
    message: log.message,
    metadata: log.metadata,
  };
}

function emptyCard(type: ThreatKind): ThreatCard {
  const threat = THREATS[type];
  return {
    type,
    title: threat.title,
    description: threat.description,
    severity: threat.severity,
    count: 0,
    lastDetectedAt: null,
    sourceIp: "none",
    geo: "No activity",
    route: "none",
    stockSymbol: null,
    latest: null,
  };
}

function threatLevel(logs: SecurityThreatLog[]): ThreatLevel {
  if (logs.some((log) => log.severity === "red") || logs.length >= 20) return "Critical";
  if (logs.some((log) => log.severity === "orange") || logs.length >= 5) return "Medium";
  return "Low";
}

function rowToBlocked(row: BlockedIpRow): BlockedIp {
  return { id: row.id, ip: row.ip, reason: row.reason, blockedAt: row.blocked_at, blockedBy: row.blocked_by };
}

async function listBlockedIps(): Promise<BlockedIp[]> {
  if (supabaseConfigured() && !blockedTableMissing) {
    try {
      const rows = await supabaseRequest<BlockedIpRow>({ method: "GET", path: "blocked_ips?select=*&order=blocked_at.desc&limit=500" });
      return rows.map(rowToBlocked);
    } catch (error) {
      if (isMissingTable(error)) blockedTableMissing = true;
      else console.error("blocked_ips: could not read", error);
    }
  }
  return [...blockedMemory].sort((a, b) => (a.blockedAt < b.blockedAt ? 1 : -1));
}

export async function blockIp(ip: string, reason: string, blockedBy: string): Promise<BlockedIp> {
  const safeIp = clip(ip, 80);
  const now = new Date().toISOString();
  const blocked: BlockedIp = {
    id: `blocked_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    ip: safeIp,
    reason: clip(reason || "Blocked from App Hackers monitor", 240),
    blockedAt: now,
    blockedBy,
  };

  blockedMemory = [blocked, ...blockedMemory.filter((row) => row.ip !== safeIp)].slice(0, 500);
  if (supabaseConfigured() && !blockedTableMissing) {
    try {
      await supabaseRequest({
        method: "POST",
        path: "blocked_ips?on_conflict=ip",
        merge: true,
        body: { id: blocked.id, ip: blocked.ip, reason: blocked.reason, blocked_at: blocked.blockedAt, blocked_by: blocked.blockedBy },
      });
    } catch (error) {
      if (isMissingTable(error)) blockedTableMissing = true;
      else console.error("blocked_ips: could not write", error);
    }
  }

  recordPlatformLog({
    category: "security",
    severity: "critical",
    source: "App Hackers monitor",
    useCase: "Security & Access: IP blocking",
    operation: "security.block_ip",
    message: `Blocked suspicious source IP ${safeIp}.`,
    metadata: { threatType: "privilege", sourceIp: safeIp, reason: blocked.reason },
  });

  return blocked;
}

export const SECURITY_THREAT_DEFAULT_DAYS = PLATFORM_LOG_RETENTION_DAYS;

export async function getSecurityThreatReport(days = SECURITY_THREAT_DEFAULT_DAYS): Promise<SecurityThreatReport> {
  const today = istDay();
  const windowDays = Math.min(Math.max(1, days), PLATFORM_LOG_RETENTION_DAYS);
  const fromDay = analyticsDayBefore(today, windowDays - 1);
  const [platform, blocked] = await Promise.all([listPlatformLogs(fromDay), listBlockedIps()]);
  const logs = platform.logs.map(toThreat).filter((log): log is SecurityThreatLog => log !== null);
  const cards = (Object.keys(THREATS) as ThreatKind[]).map((type) => {
    const related = logs.filter((log) => log.type === type);
    const latest = related[0] ?? null;
    return latest
      ? {
          ...emptyCard(type),
          count: related.length,
          lastDetectedAt: latest.at,
          sourceIp: latest.sourceIp,
          geo: latest.geo,
          route: latest.route,
          stockSymbol: latest.stockSymbol,
          severity: latest.severity,
          latest,
        }
      : emptyCard(type);
  });

  return {
    threatLevel: threatLevel(logs),
    generatedAt: new Date().toISOString(),
    days: windowDays,
    totalLogs: logs.length,
    cards,
    logs,
    blockedIps: blocked,
    schemaSql: SECURITY_SCHEMA_SQL,
  };
}

export async function flushSecurityThreatLogs(requestedBy: string): Promise<void> {
  clearPlatformLogsWhere((log) => log.category === "security");
  if (supabaseConfigured()) {
    try {
      await supabaseRequest({ method: "DELETE", path: "platform_logs?category=eq.security" });
    } catch (error) {
      if (!isMissingTable(error)) console.error("security-threats: could not flush logs", error);
    }
  }

  recordPlatformLog({
    category: "security",
    severity: "warning",
    source: "App Hackers monitor",
    useCase: "Security & Access: threat log flush requested",
    operation: "security.flush_logs",
    message: "Super admin requested a security threat log flush marker.",
    userId: requestedBy,
    metadata: { threatType: "privilege" },
  });
}

export function securityThreatsToCsv(logs: SecurityThreatLog[]): string {
  const rows = [
    [
      "at",
      "type",
      "severity",
      "source",
      "operation",
      "status_code",
      "duration_ms",
      "method",
      "source_ip",
      "geo",
      "route",
      "stock_symbol",
      "user_agent",
      "payload",
      "headers",
      "message",
      "metadata",
    ],
  ];
  for (const log of logs) {
    rows.push([
      log.at,
      log.type,
      log.severity,
      log.source,
      log.operation,
      log.statusCode === null ? "" : String(log.statusCode),
      log.durationMs === null ? "" : String(log.durationMs),
      log.method ?? "",
      log.sourceIp,
      log.geo,
      log.route,
      log.stockSymbol ?? "",
      log.userAgent,
      log.payload,
      JSON.stringify(log.headers),
      log.message,
      JSON.stringify(log.metadata),
    ]);
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}
