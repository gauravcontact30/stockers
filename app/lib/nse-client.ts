// Shared plumbing for NSE India's public JSON endpoints.
//
// NSE publishes these for its own website rather than as a documented API: there is no key, no
// versioning and no stability guarantee, and a request without browser-ish headers is refused.
// Every call therefore degrades to null on any failure so a section renders an empty state
// instead of taking a page down.

import { revalidating, type CacheTag } from "./cache";
import { recordPlatformLog } from "./platform-logs";

const NSE_BASE = "https://www.nseindia.com/api";
const TIMEOUT_MS = 9000;

const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

export async function fetchNse<T = unknown>(path: string): Promise<T | null> {
  const started = Date.now();
  try {
    const response = await fetch(`${NSE_BASE}${path}`, {
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      recordPlatformLog({
        category: "third-party",
        source: "NSE India",
        useCase: "Data fetching from third-party platforms",
        operation: `GET ${path}`,
        message: "NSE endpoint returned a non-success status.",
        statusCode: response.status,
        durationMs: Date.now() - started,
        path,
        method: "GET",
      });
      return null;
    }
    const payload = (await response.json()) as T;
    recordPlatformLog({
      category: "third-party",
      source: "NSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "NSE endpoint completed without error.",
      statusCode: response.status,
      durationMs: Date.now() - started,
      path,
      method: "GET",
    });
    return payload;
  } catch {
    recordPlatformLog({
      category: "third-party",
      source: "NSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "NSE endpoint could not be reached.",
      statusCode: 503,
      durationMs: Date.now() - started,
      path,
      method: "GET",
    });
    return null;
  }
}

/**
 * NSE mixes types freely: the same field arrives as a number on one endpoint and a
 * comma-separated, whitespace-padded string on another, sometimes in Java scientific notation
 * ("5.8422516E7"), sometimes as "-" for "no value".
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!cleaned || cleaned === "-") return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed === "-" ? "" : trimmed;
}

/** Today's date in IST as YYYY-MM-DD — the exchange's day, not the server's. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * A TTL memo so several sections can share one upstream call per window.
 *
 * This used to hold its own entry and block whoever arrived after it expired. It now delegates to
 * `./cache`, which serves the stale value and refreshes behind the reader instead — the seconds an
 * NSE feed takes to answer are paid once rather than by a visitor every window. The signature
 * gained a key and tags because those are what the shared cache needs to persist an entry and to
 * drop it again on demand.
 */
export function cached<T>(
  ttlMs: number,
  load: () => Promise<T>,
  options: { key: string; tags?: CacheTag[]; persist?: boolean },
): () => Promise<T> {
  return revalidating<T>({ key: options.key, ttlMs, tags: options.tags, persist: options.persist, load });
}
