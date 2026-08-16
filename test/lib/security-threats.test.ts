/** @jest-environment node */

import { getSecurityThreatReport, SECURITY_THREAT_DEFAULT_DAYS, securityThreatsToCsv } from "../../app/lib/security-threats";
import { PLATFORM_LOG_RETENTION_DAYS, recordPlatformLog, resetPlatformLogs } from "../../app/lib/platform-logs";

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalLegacyServiceKey = process.env.SUPABASE_SERVICE_KEY;

describe("security threat reports", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    resetPlatformLogs();
  });

  afterAll(() => {
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalPublicSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicSupabaseUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    if (originalLegacyServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalLegacyServiceKey;
  });

  it("shows all retained hacking details by default", async () => {
    recordPlatformLog({
      category: "security",
      severity: "critical",
      source: "Next.js proxy",
      useCase: "Security & Access: App Hackers threat monitor",
      operation: "GET /api/stocks/search",
      message: "Injection-shaped query payload detected at the request boundary.",
      statusCode: 403,
      durationMs: 12,
      path: "/api/stocks/search",
      method: "GET",
      metadata: {
        threatType: "injection",
        threatSeverity: "red",
        sourceIp: "203.0.113.24",
        userAgent: "sqlmap/1.8",
        stockSymbol: "RELIANCE",
        payload: "?q=%27%20OR%201%3D1--&debug=true",
        headers: {
          "user-agent": "sqlmap/1.8",
          "sec-fetch-site": "same-origin",
          authorization: "Bearer should-not-render",
        },
      },
    });

    const report = await getSecurityThreatReport();
    const [log] = report.logs;

    expect(report.days).toBe(SECURITY_THREAT_DEFAULT_DAYS);
    expect(report.days).toBe(PLATFORM_LOG_RETENTION_DAYS);
    expect(report.totalLogs).toBe(1);
    expect(log).toMatchObject({
      type: "injection",
      source: "Next.js proxy",
      operation: "GET /api/stocks/search",
      statusCode: 403,
      durationMs: 12,
      method: "GET",
      sourceIp: "203.0.113.24",
      route: "/api/stocks/search",
      stockSymbol: "RELIANCE",
      userAgent: "sqlmap/1.8",
      payload: "?q=%27%20OR%201%3D1--&debug=true",
    });
    expect(log.headers["user-agent"]).toBe("sqlmap/1.8");
    expect(log.headers.authorization).toBe("[redacted]");
    expect(securityThreatsToCsv(report.logs)).toContain("?q=%27%20OR%201%3D1--&debug=true");
  });
});
