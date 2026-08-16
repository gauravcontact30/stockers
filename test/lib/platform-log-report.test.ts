/** @jest-environment node */

import { buildPlatformLogReport } from "../../app/lib/platform-log-report";
import { buildPlatformLog, type PlatformLog } from "../../app/lib/platform-logs";
import type { AdminUserView } from "../../app/lib/store";

const user: AdminUserView = {
  id: "u1",
  name: "Aarav Mehta",
  email: "aarav@example.com",
  plan: "Pro",
  createdAt: "2026-08-01T00:00:00.000Z",
  role: "user",
  trialStartedAt: "2026-08-01T00:00:00.000Z",
  subscribedUntil: "2026-09-01",
  lastPaymentId: null,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  verificationSentAt: null,
  mobile: "9876543210",
  emailVerified: true,
};

function log(input: Parameters<typeof buildPlatformLog>[0], at: string): PlatformLog {
  return buildPlatformLog(input, new Date(at));
}

describe("platform log reports", () => {
  it("redacts sensitive messages and metadata before report display", () => {
    const entry = log(
      {
        category: "security",
        severity: "warning",
        source: "Auth",
        useCase: "Security & Access",
        operation: "signin.failed",
        message: "Failed login for aarav@example.com from 9876543210",
        userId: "u1",
        metadata: {
          email: "aarav@example.com",
          password: "secret",
          note: "Card 4111 1111 1111 1111 was not stored",
        },
      },
      "2026-08-16T06:00:00.000Z",
    );

    const report = buildPlatformLogReport({
      platformLogs: [entry],
      analyticsEvents: [],
      aiCalls: [],
      users: [user],
      today: "2026-08-16",
      fromDay: "2026-08-16",
      days: 1,
      backend: "memory",
      processLocal: true,
      held: 1,
    });

    expect(report.page.logs[0].message).toContain("[redacted-email]");
    expect(report.page.logs[0].message).toContain("[redacted-phone]");
    expect(report.page.logs[0].metadata.email).toBe("[redacted]");
    expect(report.page.logs[0].metadata.password).toBe("[redacted]");
    expect(report.page.logs[0].metadata.note).toContain("[redacted-card]");
    expect(report.page.logs[0].userEmail).toBe("aa***@example.com");
    expect(report.page.logs[0].userName).toBe("A*** M***");
  });

  it("filters and paginates logs on the server report contract", () => {
    const logs = [
      log(
        {
          category: "security",
          severity: "info",
          source: "Auth",
          useCase: "Security & Access",
          operation: "signin.success",
          message: "User signed in.",
        },
        "2026-08-16T01:00:00.000Z",
      ),
      log(
        {
          category: "system",
          severity: "info",
          source: "Admin API",
          useCase: "Audit Trails",
          operation: "user.delete",
          message: "Super admin deleted a user account.",
        },
        "2026-08-16T02:00:00.000Z",
      ),
      log(
        {
          category: "api",
          source: "Next.js proxy",
          useCase: "Application API",
          operation: "GET /api/market",
          message: "API request accepted.",
          durationMs: 8_000,
        },
        "2026-08-15T03:00:00.000Z",
      ),
      log(
        {
          category: "third-party",
          severity: "error",
          source: "NSE",
          useCase: "Third-party Platforms",
          operation: "nse.fetch",
          message: "NSE returned HTTP 503.",
          statusCode: 503,
        },
        "2026-08-15T04:00:00.000Z",
      ),
    ];

    const report = buildPlatformLogReport({
      platformLogs: logs,
      analyticsEvents: [],
      aiCalls: [],
      users: [],
      today: "2026-08-16",
      fromDay: "2026-08-15",
      days: 2,
      backend: "memory",
      processLocal: true,
      held: logs.length,
      filters: { category: "third-party", severity: "all", source: "all", query: "", page: 1, pageSize: 10 },
    });

    expect(report.page.total).toBe(1);
    expect(report.page.logs[0].operation).toBe("nse.fetch");
    expect(report.groups.find((group) => group.category === "third-party")?.total).toBe(1);
    expect(report.daily).toEqual([
      expect.objectContaining({
        day: "2026-08-15",
        logs: 2,
        byCategory: expect.objectContaining({ api: 1, "third-party": 1 }),
      }),
      expect.objectContaining({
        day: "2026-08-16",
        logs: 2,
        byCategory: expect.objectContaining({ security: 1, audit: 1 }),
      }),
    ]);
  });
});
