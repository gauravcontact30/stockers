/** @jest-environment node */

import { NextRequest } from "next/server";

/**
 * The rate limiter in proxy.ts, without an Upstash account.
 *
 * `@upstash/ratelimit` is replaced with a stub that records the key it was asked about and returns
 * whatever verdict the test wants. That keeps these assertions about the two things this file
 * actually decides — which caller a request is attributed to, and what a refusal looks like on the
 * wire — rather than about Upstash's sliding-window arithmetic, which is their code and is tested
 * on their side.
 */

const limit = jest.fn();

jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    class {
      limit = limit;
    },
    { slidingWindow: jest.fn(() => "sliding-window") },
  ),
}));

jest.mock("@upstash/redis", () => ({ Redis: class {} }));

/** A verdict in the shape `Ratelimit.limit` returns. */
function verdict(success: boolean, remaining = 19, resetInMs = 30_000) {
  return { success, limit: 20, remaining, reset: Date.now() + resetInMs, pending: Promise.resolve() };
}

/**
 * proxy.ts memoises the limiter at module scope, so each case needs a fresh module registry — and
 * the env has to be set before the import, since that is when it is read.
 */
async function loadProxy(env: Record<string, string | undefined> = {}) {
  jest.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  delete process.env.TRUSTED_PROXY_HOPS;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return (await import("../../proxy")).proxy;
}

const event = { waitUntil: jest.fn() } as unknown as import("next/server").NextFetchEvent;

function request(headers: Record<string, string>, url = "https://www.stockersai.com/api/research", method = "POST") {
  return new NextRequest(url, { method, headers });
}

beforeEach(() => {
  limit.mockReset();
  limit.mockResolvedValue(verdict(true));
});

describe("which caller a request is counted against", () => {
  it("appends nothing to the header it is given: the forged entry must not win", async () => {
    // The whole point of the hop count. A caller who sets `X-Forwarded-For: 1.2.3.4` on every
    // request would otherwise get a fresh bucket per request and never be limited at all.
    const proxy = await loadProxy({ TRUSTED_PROXY_HOPS: "1" });
    await proxy(request({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }), event);

    expect(limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("counts back two entries when a CDN sits in front of the load balancer", async () => {
    const proxy = await loadProxy({ TRUSTED_PROXY_HOPS: "2" });
    await proxy(request({ "x-forwarded-for": "1.2.3.4, 9.9.9.9, 10.0.0.7" }), event);

    expect(limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("reads a single-entry chain as the client itself", async () => {
    const proxy = await loadProxy();
    await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("falls back to the leftmost entry rather than off the end of a short chain", async () => {
    const proxy = await loadProxy({ TRUSTED_PROXY_HOPS: "5" });
    await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("prefers a platform header, which the client cannot forge", async () => {
    const proxy = await loadProxy();
    await proxy(request({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }), event);

    expect(limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("groups unattributable requests together rather than letting them through unlimited", async () => {
    const proxy = await loadProxy();
    await proxy(request({}), event);

    expect(limit).toHaveBeenCalledWith("unknown");
  });
});

describe("what a caller over the limit is told", () => {
  it("answers 429 with the headers a client needs to back off", async () => {
    limit.mockResolvedValue(verdict(false, 0, 30_000));
    const proxy = await loadProxy();

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("20");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    // A refusal is specific to one caller at one instant and must never be cached and replayed.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: "Too many requests", retryAfter: 30 });
  });

  it("never advertises a Retry-After of zero, which would invite an immediate retry", async () => {
    limit.mockResolvedValue(verdict(false, 0, -5_000));
    const proxy = await loadProxy();

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(response.headers.get("Retry-After")).toBe("1");
  });

  it("reports the remaining budget on requests it allows", async () => {
    limit.mockResolvedValue(verdict(true, 7));
    const proxy = await loadProxy();

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("7");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });
});

describe("request-layer security checks", () => {
  it("adds security headers to non-API requests without applying API rate limits", async () => {
    const proxy = await loadProxy();

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }, "https://www.stockersai.com/console", "GET"), event);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(limit).not.toHaveBeenCalled();
  });

  it("blocks cross-site API mutations before they reach a route handler", async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request({
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        "x-forwarded-for": "9.9.9.9",
      }),
      event,
    );

    expect(response.status).toBe(403);
    expect(limit).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("allows Razorpay webhooks to arrive without browser origin headers", async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request(
        { "x-forwarded-for": "9.9.9.9", "content-length": "256" },
        "https://www.stockersai.com/api/payments/razorpay/webhook",
      ),
      event,
    );

    expect(response.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  it("rejects oversized mutating API requests before body parsing", async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request(
        { origin: "https://www.stockersai.com", "content-length": "1000001" },
        "https://www.stockersai.com/api/contact",
      ),
      event,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "Payload too large" });
  });
});

describe("when the limiter cannot answer", () => {
  it("lets the request through if Redis is unreachable", async () => {
    // Deliberate: an Upstash outage must not take the AI features down with it. `guardFeature`
    // inside each route is the authorisation boundary; this is only a spend ceiling.
    limit.mockRejectedValue(new Error("ECONNREFUSED"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const proxy = await loadProxy();

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("stays out of the way, loudly, when Upstash is not configured", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const proxy = await loadProxy({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });

    const response = await proxy(request({ "x-forwarded-for": "9.9.9.9" }), event);

    expect(response.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("rate limiting is OFF"));
    warn.mockRestore();
  });
});
