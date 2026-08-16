/** @jest-environment node */

import { POST } from "../../app/api/analytics/web-vitals/route";
import { listPlatformLogs, resetPlatformLogs } from "../../app/lib/platform-logs";

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalLegacyServiceKey = process.env.SUPABASE_SERVICE_KEY;

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/analytics/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analytics/web-vitals", () => {
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

  it("records sanitized Core Web Vitals into platform logs", async () => {
    const response = await POST(
      request({
        id: "v3-123456789",
        name: "LCP",
        value: 2672.435,
        delta: 2672.435,
        rating: "poor",
        navigationType: "navigate",
        path: "/overview?portfolio=private",
      }),
    );

    const { logs } = await listPlatformLogs("1970-01-01");

    expect(response.status).toBe(202);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      category: "system",
      severity: "error",
      source: "Browser Web Vitals",
      operation: "web-vitals.lcp",
      path: "/overview",
      method: "WEB_VITAL",
      durationMs: 2672,
    });
    expect(logs[0].metadata).toMatchObject({
      metricId: "v3-123456789",
      metricName: "LCP",
      rating: "poor",
      value: 2672.44,
      delta: 2672.44,
      navigationType: "navigate",
    });
  });

  it("swallows invalid metric payloads without recording them", async () => {
    const response = await POST(request({ id: "nope", name: "PRIVATE_QUERY", value: -1, delta: 0, rating: "poor" }));
    const { logs } = await listPlatformLogs("1970-01-01");

    expect(response.status).toBe(202);
    expect(logs).toEqual([]);
  });

  it("blocks cross-origin metric collection", async () => {
    const response = await POST(
      request(
        { id: "v3-123456789", name: "CLS", value: 0.05, delta: 0.05, rating: "good" },
        { Origin: "https://evil.example" },
      ),
    );

    expect(response.status).toBe(403);
  });
});
