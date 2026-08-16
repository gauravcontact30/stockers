import "server-only";

import { recordPlatformLog, type PlatformLogCategory, type PlatformLogInput, type PlatformLogSeverity } from "./platform-logs";

type ApplicationLogLevel = "info" | "warn" | "error";

type ApplicationLogInput = {
  level: ApplicationLogLevel;
  source: "client" | "server" | "middleware";
  category?: PlatformLogCategory;
  useCase: string;
  operation: string;
  message: string;
  userId?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  path?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown>;
};

const LEVEL_TO_SEVERITY: Record<ApplicationLogLevel, PlatformLogSeverity> = {
  info: "info",
  warn: "warning",
  error: "error",
};

export function logApplicationEvent(input: ApplicationLogInput): void {
  const payload: PlatformLogInput = {
    category: input.category ?? (input.level === "error" ? "system" : "api"),
    severity: LEVEL_TO_SEVERITY[input.level],
    source: input.source === "client" ? "Client browser" : input.source === "middleware" ? "Next.js proxy" : "Next.js server",
    useCase: input.useCase,
    operation: input.operation,
    message: input.message,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    userId: input.userId,
    path: input.path,
    method: input.method,
    metadata: { logSource: input.source, ...input.metadata },
  };

  recordPlatformLog(payload);
}

export function logAuditEvent(input: Omit<ApplicationLogInput, "level" | "source" | "category">): void {
  logApplicationEvent({
    ...input,
    level: "info",
    source: "server",
    category: "system",
    useCase: `Audit Trails: ${input.useCase}`,
  });
}

export function logSecurityEvent(input: Omit<ApplicationLogInput, "source" | "category">): void {
  logApplicationEvent({
    ...input,
    source: "server",
    category: "security",
    useCase: `Security & Access: ${input.useCase}`,
  });
}
