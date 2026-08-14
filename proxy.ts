import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

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

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const ratelimit = rateLimiter();
  if (!ratelimit) return NextResponse.next();

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
    return NextResponse.next();
  }

  const { success, limit, remaining, reset, pending } = result;

  // Analytics and bucket cleanup finish after the response goes out, rather than making the caller
  // wait for them.
  event.waitUntil(pending);

  const headers = limitHeaders(limit, remaining, reset);

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    return NextResponse.json(
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
    );
  }

  // Allowed. The budget still travels with the response, so a well-behaved client can slow down
  // before it hits the wall rather than discovering it at 429.
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    "/api/ai/:path*",
    "/api/research/:path*",
    "/api/compare/:path*",
  ],
};
