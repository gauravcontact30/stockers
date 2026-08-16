import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { csrfFailureReason, isMutatingMethod } from "./app/lib/request-security";
import { recordPlatformLog } from "./app/lib/platform-logs";

/**
 * Rate limiting for the endpoints that spend money per request.
 *
 * This file is `proxy.ts`, not `middleware.ts`. Next 16 renamed the convention — the function must
 * be exported as `proxy`, and a file named `middleware.ts` is now deprecated. Behaviour is
 * otherwise identical, and it defaults to the Node.js runtime.
 *
 * ---------------------------------------------------------------------------
 * Why these routes and not the rest
 * ---------------------------------------------------------------------------
 *
 * Everything matched below ends in an OpenRouter call — a real invoice, per request, whether or not
 * anyone reads the answer:
 *
 *   /api/ai/intel       app/lib/market-intel.ts     the AI stock search
 *   /api/ai/board-read  app/lib/board-read.ts
 *   /api/ai/verdicts    app/lib/stock-verdicts.ts
 *   /api/research       app/lib/stock-analysis.ts   the research report
 *   /api/compare        app/lib/stock-compare.ts    (and /compare/custom beneath it)
 *
 * `/api/stocks/search` and `/api/stocks/suggest` are deliberately *not* here despite the names.
 * They search a local catalogue with no model behind them, and they back a typeahead — twenty
 * requests a minute is roughly ten seconds of ordinary typing, so limiting them would break the
 * feature it looks like it protects.
 *
 * ---------------------------------------------------------------------------
 * This sits in front of `guardFeature`, not instead of it
 * ---------------------------------------------------------------------------
 *
 * The subscription check in each route still runs and is still the authority on who may call what.
 * This only bounds how fast a caller may do it, and it is keyed by IP precisely so that it applies
 * before anyone has proved who they are.
 */

const WINDOW = "60 s";
const LIMIT = 20;
const RATE_LIMITED_PREFIXES = ["/api/ai/", "/api/research", "/api/compare"] as const;
const TELEMETRY_PREFIXES = ["/api/analytics/", "/api/admin/presence", "/api/admin/logs", "/api/admin/platform-logs"] as const;
const WEBHOOK_PREFIXES = ["/api/payments/razorpay/webhook"] as const;
const DEFAULT_MUTATION_BODY_LIMIT = 1_000_000;
const BODY_LIMITS = [
  { prefixes: ["/api/admin/client-reviews"], limit: 8_000_000 },
  { prefixes: ["/api/payments/razorpay/webhook"], limit: 1_000_000 },
] as const;

const LOCAL_RATE_WINDOWS = [
  { key: "auth", prefixes: ["/api/auth/signin", "/api/auth/signup"], limit: 10, windowMs: 5 * 60_000 },
  { key: "verify", prefixes: ["/api/auth/verify"], limit: 30, windowMs: 5 * 60_000 },
  { key: "admin-write", prefixes: ["/api/admin/"], limit: 120, windowMs: 60_000 },
  { key: "payment", prefixes: ["/api/payments/razorpay/order", "/api/payments/razorpay/verify"], limit: 30, windowMs: 60_000 },
  { key: "contact", prefixes: ["/api/contact"], limit: 8, windowMs: 10 * 60_000 },
  { key: "portfolio-write", prefixes: ["/api/portfolio"], limit: 90, windowMs: 60_000 },
] as const;

const localBuckets = new Map<string, { count: number; resetAt: number }>();
const isDev = process.env.NODE_ENV === "development";
const boundaryCsp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://images.dhan.co https://logo.clearbit.com https://www.google.com https://*.gstatic.com https://assets-netstorage.groww.in https://static.tickertape.in https://*.razorpay.com`,
  `font-src 'self' data: https://checkout.razorpay.com`,
  `connect-src 'self' https://api.razorpay.com https://*.razorpay.com${isDev ? " ws: http://localhost:*" : ""}`,
  `frame-src https://api.razorpay.com https://checkout.razorpay.com`,
  `worker-src 'self' blob:`,
  `media-src 'self'`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https://api.razorpay.com`,
  `frame-ancestors 'none'`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const BOUNDARY_SECURITY_HEADERS = [
  ["Content-Security-Policy", boundaryCsp],
  ...(isDev ? [] : [["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"]]),
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-DNS-Prefetch-Control", "off"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["Origin-Agent-Cluster", "?1"],
  ["Permissions-Policy", 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://api.razorpay.com")'],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
] as const;

function withBoundarySecurityHeaders<T extends NextResponse>(response: T): T {
  for (const [key, value] of BOUNDARY_SECURITY_HEADERS) response.headers.set(key, value);
  return response;
}

/**
 * Which forwarded-IP header to believe.
 *
 * `x-forwarded-for` is a list the client can start writing: a request arriving with
 * `X-Forwarded-For: 1.2.3.4` gets that value prepended to, not replaced by, whatever the proxy
 * adds. Taking the leftmost entry therefore hands every caller a free rate-limit reset — they pick
 * a new fake IP per request and the limiter never fires.
 *
 * The only entries that can be trusted are the ones *your own* infrastructure appended, which are
 * at the right-hand end. `TRUSTED_PROXY_HOPS` says how many proxies in front of this app append to
 * the header, so the client's real address can be counted back from the right:
 *
 *   1 (default)  one reverse proxy / load balancer in front — nginx, ALB, Cloudflare, Vercel
 *   2            a CDN in front of a load balancer, and so on
 *
 * Worked through, for the default of one proxy. A caller sends `X-Forwarded-For: 1.2.3.4`; nginx
 * *appends* rather than replaces, so the app sees `1.2.3.4, 9.9.9.9` where 9.9.9.9 is the address
 * nginx actually accepted the connection from. The real client is the last entry — index
 * `length - 1` — which is `length - hops`. With a CDN as well the chain is `spoof, real, cdnEdge`
 * and the real client sits at `length - 2`. Hence the subtraction below.
 *
 * Get this wrong in the permissive direction and the limiter is bypassable by anyone who can set a
 * header, which is everyone; wrong in the strict direction and every visitor behind your load
 * balancer shares one bucket. It is worth checking against a real request rather than guessing.
 */
const TRUSTED_HOPS = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);

/**
 * Headers a platform sets itself and does not let the client forge. Each is a single IP, not a
 * list, so there is nothing to count back through. Checked before `x-forwarded-for`.
 */
const TRUSTED_HEADERS = ["cf-connecting-ip", "x-vercel-forwarded-for", "x-real-ip"] as const;

function clientIp(request: NextRequest): string {
  for (const header of TRUSTED_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (value) return value;
  }

  const chain = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (chain?.length) {
    // Count back from the right by the number of proxies we know about. Clamped at 0, so a hop
    // count larger than the chain reads the leftmost entry rather than running off the array —
    // which is the strict direction to fail in: it over-groups callers instead of trusting a
    // forged entry.
    const index = Math.max(0, chain.length - TRUSTED_HOPS);
    return chain[index];
  }

  // No forwarded header at all. Everything unattributable shares one bucket, which is strict
  // rather than lax — the alternative is a bucket per unidentified caller, i.e. no limit.
  return "unknown";
}

/**
 * Built once, lazily, and only if Upstash is actually configured.
 *
 * Module scope is safe for this: the only mutable state is in Redis, which is the point of using
 * it — several instances of this proxy share one counter, where an in-memory `Map` would give each
 * instance its own and multiply the effective limit by the instance count.
 */
let limiter: Ratelimit | null = null;
let configured: boolean | null = null;

function rateLimiter(): Ratelimit | null {
  if (configured !== null) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  configured = Boolean(url && token);
  if (!configured) {
    // Once, not per request. A local `npm run dev` without Upstash credentials is the normal case
    // and should say so plainly rather than either crashing or staying silent.
    console.warn(
      "[proxy] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset — AI endpoint rate limiting is OFF.",
    );
    return null;
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    /**
     * Sliding window rather than fixed. A fixed window lets a caller send 20 at 11:59:59 and 20
     * more at 12:00:00 — double the intended rate across the boundary, which is exactly the burst
     * that costs the most in model spend. The sliding variant weights the previous window and
     * refuses the second burst.
     */
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    prefix: "stockers:ai",
    /**
     * A per-instance memo of buckets already known to be exhausted. A caller who is being refused
     * is, by definition, the one sending the most requests; without this, each of those refusals
     * still costs a Redis round trip.
     */
    ephemeralCache: new Map(),
  });

  return limiter;
}

/** The headers a client needs to back off intelligently instead of retrying blind. */
function limitHeaders(limit: number, remaining: number, reset: number): Record<string, string> {
  return {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(Math.max(0, remaining)),
    // Both spellings: `RateLimit-*` is the IETF draft, `X-RateLimit-*` is what nearly every client
    // library in the wild actually reads.
    "RateLimit-Reset": String(Math.max(0, Math.ceil((reset - Date.now()) / 1000))),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
  };
}

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isTelemetryPath(pathname: string): boolean {
  return TELEMETRY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function localRateWindow(pathname: string): (typeof LOCAL_RATE_WINDOWS)[number] | null {
  return LOCAL_RATE_WINDOWS.find((window) => hasPrefix(pathname, window.prefixes)) ?? null;
}

function bodyLimit(pathname: string): number {
  return BODY_LIMITS.find((rule) => hasPrefix(pathname, rule.prefixes))?.limit ?? DEFAULT_MUTATION_BODY_LIMIT;
}

function selectedRequestHeaders(request: NextRequest): Record<string, string> {
  const allowed = ["accept", "content-type", "origin", "referer", "sec-fetch-site", "user-agent", "x-forwarded-for", "cf-connecting-ip"];
  return Object.fromEntries(allowed.map((key) => [key, request.headers.get(key) ?? ""]).filter(([, value]) => value));
}

function stockSymbolFrom(url: URL): string | null {
  for (const key of ["stock", "symbol", "ticker", "securityCode", "scripCode", "q"]) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9&.-]{1,16}$/.test(value)) return value.toUpperCase();
  }
  return null;
}

function suspiciousRequest(request: NextRequest): { threatType: "injection" | "exfiltration"; severity: "warning" | "critical"; message: string } | null {
  const url = request.nextUrl;
  const raw = `${url.pathname} ${url.search}`.slice(0, 1_500);
  if (/(\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b|\$where\b|\$ne\b|\$regex\b|--|\/\*|\b(or|and)\b\s+1\s*=\s*1)/i.test(raw)) {
    return { threatType: "injection", severity: "critical", message: "Injection-shaped query payload detected at the request boundary." };
  }

  const agent = request.headers.get("user-agent") ?? "";
  if ((/curl|python-requests|sqlmap|nikto|masscan|nmap|scrapy|wget/i.test(agent) || url.search.length > 700) && isApiPath(url.pathname)) {
    return { threatType: "exfiltration", severity: "warning", message: "Automated bot scan or bulk collection pattern detected at the request boundary." };
  }

  return null;
}

function recordSecuritySignal(input: {
  request: NextRequest;
  started: number;
  threatType: "rate-limit" | "injection" | "privilege" | "exfiltration";
  severity: "warning" | "critical";
  message: string;
}) {
  const url = input.request.nextUrl;
  recordPlatformLog({
    category: "security",
    severity: input.severity,
    source: "Next.js proxy",
    useCase: "Security & Access: App Hackers threat monitor",
    operation: `${input.request.method} ${url.pathname}`,
    message: input.message,
    durationMs: Date.now() - input.started,
    path: url.pathname,
    method: input.request.method,
    metadata: {
      threatType: input.threatType,
      threatSeverity: input.severity === "critical" ? "red" : "orange",
      sourceIp: clientIp(input.request),
      userAgent: input.request.headers.get("user-agent") ?? "",
      stockSymbol: stockSymbolFrom(url) ?? "",
      payload: url.search ? url.search.slice(0, 600) : "",
      headers: selectedRequestHeaders(input.request),
    },
  });
}

function contentLengthFailure(request: NextRequest): string | null {
  if (!isMutatingMethod(request.method)) return null;
  const value = request.headers.get("content-length");
  if (!value) return null;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Invalid Content-Length header.";
  const limit = bodyLimit(request.nextUrl.pathname);
  return bytes > limit ? `Request body is too large. Limit is ${limit} bytes.` : null;
}

function checkLocalRateLimit(request: NextRequest): { ok: true } | { ok: false; limit: number; retryAfter: number; key: string } {
  if (!isMutatingMethod(request.method)) return { ok: true };
  const window = localRateWindow(request.nextUrl.pathname);
  if (!window) return { ok: true };

  const now = Date.now();
  const key = `${window.key}:${clientIp(request)}`;
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + window.windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count <= window.limit) return { ok: true };
  return { ok: false, limit: window.limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), key: window.key };
}

function recordApiIngress(input: {
  request: NextRequest;
  statusCode: number;
  started: number;
  message: string;
  useCase?: string;
}) {
  const url = input.request.nextUrl;
  recordPlatformLog({
    category: "api",
    source: "Next.js proxy",
    useCase: input.useCase ?? "Complete application API request ingress",
    operation: `${input.request.method} ${url.pathname}`,
    message: input.message,
    statusCode: input.statusCode,
    durationMs: Date.now() - input.started,
    path: url.pathname,
    method: input.request.method,
    metadata: {
      search: url.search ? url.search.slice(0, 120) : "",
      userAgent: input.request.headers.get("user-agent") ?? "",
    },
  });
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const started = Date.now();
  const pathname = request.nextUrl.pathname;
  const shouldLimit = isRateLimitedPath(pathname);

  if (!isApiPath(pathname)) return withBoundarySecurityHeaders(NextResponse.next());

  const suspicious = suspiciousRequest(request);
  if (suspicious) {
    recordSecuritySignal({
      request,
      started,
      threatType: suspicious.threatType,
      severity: suspicious.severity,
      message: suspicious.message,
    });
  }

  const lengthReason = contentLengthFailure(request);
  if (lengthReason) {
    recordApiIngress({
      request,
      statusCode: 413,
      started,
      message: lengthReason,
      useCase: "Security & Access: request size limits",
    });
    recordSecuritySignal({
      request,
      started,
      threatType: "exfiltration",
      severity: "warning",
      message: lengthReason,
    });
    return withBoundarySecurityHeaders(
      NextResponse.json({ error: "Payload too large", message: lengthReason }, { status: 413, headers: { "Cache-Control": "no-store" } }),
    );
  }

  const csrfReason = hasPrefix(pathname, WEBHOOK_PREFIXES) ? null : csrfFailureReason(request);
  if (csrfReason) {
    recordApiIngress({
      request,
      statusCode: 403,
      started,
      message: csrfReason,
      useCase: "Security & Access: CSRF and origin protection",
    });
    recordSecuritySignal({
      request,
      started,
      threatType: "privilege",
      severity: "critical",
      message: csrfReason,
    });
    return withBoundarySecurityHeaders(
      NextResponse.json({ error: "Forbidden", message: csrfReason }, { status: 403, headers: { "Cache-Control": "no-store" } }),
    );
  }

  const localLimit = checkLocalRateLimit(request);
  if (!localLimit.ok) {
    recordApiIngress({
      request,
      statusCode: 429,
      started,
      message: `${localLimit.key} rate limit blocked the request before it reached the handler.`,
      useCase: "Security & Access: abuse throttling",
    });
    recordSecuritySignal({
      request,
      started,
      threatType: "rate-limit",
      severity: "warning",
      message: `${localLimit.key} rate limit blocked the request before it reached the handler.`,
    });
    return withBoundarySecurityHeaders(
      NextResponse.json(
        { error: "Too many requests", message: "Too many requests. Try again shortly.", retryAfter: localLimit.retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(localLimit.retryAfter),
            "RateLimit-Limit": String(localLimit.limit),
            "RateLimit-Remaining": "0",
            "Cache-Control": "no-store",
          },
        },
      ),
    );
  }

  if (isTelemetryPath(pathname)) return withBoundarySecurityHeaders(NextResponse.next());

  if (!shouldLimit) {
    recordApiIngress({
      request,
      statusCode: 202,
      started,
      message: "API request accepted by the application proxy.",
    });
    return withBoundarySecurityHeaders(NextResponse.next());
  }

  const ratelimit = rateLimiter();
  if (!ratelimit) {
    recordApiIngress({
      request,
      statusCode: 202,
      started,
      message: "API request accepted; AI rate limiting is not configured.",
      useCase: "Application API rate-limit state",
    });
    return withBoundarySecurityHeaders(NextResponse.next());
  }

  const ip = clientIp(request);

  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await ratelimit.limit(ip);
  } catch (failure) {
    /**
     * Redis is unreachable. This fails *open*.
     *
     * The choice is between refusing paying subscribers during an Upstash outage and briefly
     * losing the spend ceiling. Failing open is the right side of that trade here because the
     * limiter is a cost control rather than an authorisation boundary — `guardFeature` inside each
     * route is what actually decides who may call these endpoints, and it is untouched by this.
     *
     * If the priority ever inverts — abuse costing more than downtime — this is the line to change.
     */
    console.error("[proxy] rate limit check failed, allowing request:", failure);
    recordApiIngress({
      request,
      statusCode: 503,
      started,
      message: "Rate-limit backend failed; request was allowed open.",
      useCase: "Application API alerting",
    });
    return withBoundarySecurityHeaders(NextResponse.next());
  }

  const { success, limit, remaining, reset, pending } = result;

  // Analytics and bucket cleanup finish after the response goes out, rather than making the caller
  // wait for them.
  event.waitUntil(pending);

  const headers = limitHeaders(limit, remaining, reset);

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    recordApiIngress({
      request,
      statusCode: 429,
      started,
      message: "AI API request was rate limited before it reached the handler.",
      useCase: "Application API failing and alerting",
    });
    recordSecuritySignal({
      request,
      started,
      threatType: "rate-limit",
      severity: "warning",
      message: "AI API request was rate limited before it reached the handler.",
    });

    return withBoundarySecurityHeaders(
      NextResponse.json(
        {
          error: "Too many requests",
          message: `You've made more than ${LIMIT} AI requests in a minute. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": String(retryAfter),
            // This response is specific to one caller at one moment; nothing may cache it.
            "Cache-Control": "no-store",
          },
        },
      ),
    );
  }

  // Allowed. The budget still travels with the response, so a well-behaved client can slow down
  // before it hits the wall rather than discovering it at 429.
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  recordApiIngress({
    request,
    statusCode: 202,
    started,
    message: "AI API request accepted with rate-limit budget headers.",
    useCase: "Application API loading performance",
  });
  return withBoundarySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
