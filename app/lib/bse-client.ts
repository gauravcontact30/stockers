// Shared plumbing for BSE India's public JSON endpoints.
//
// Like the NSE feeds in ./nse-client, these are published for bseindia.com itself rather than as
// a documented API: no key, no versioning, and a request without browser-ish headers (including
// the Referer) is refused or redirected to an error page. Every call therefore degrades to null
// on any failure so a section renders an empty state instead of taking the page down.

import { recordPlatformLog } from "./platform-logs";

const BSE_BASE = "https://api.bseindia.com/BseIndiaAPI/api";

const BSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.bseindia.com",
  Referer: "https://www.bseindia.com/",
};

/** A plain-text download from bseindia.com itself (the Bhavcopy lives there, not on api.). */
export async function fetchBseText(url: string, timeoutMs = 25_000): Promise<string | null> {
  const started = Date.now();
  const path = new URL(url).pathname;
  try {
    const response = await fetch(url, {
      headers: { ...BSE_HEADERS, Accept: "text/csv,text/plain,*/*" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      recordPlatformLog({
        category: "data",
        source: "BSE India",
        useCase: "Data fetching from third-party platforms",
        operation: `GET ${path}`,
        message: "BSE text feed returned a non-success status.",
        statusCode: response.status,
        durationMs: Date.now() - started,
        path,
        method: "GET",
      });
      return null;
    }
    const text = await response.text();
    recordPlatformLog({
      category: "data",
      source: "BSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "BSE text feed completed without error.",
      statusCode: response.status,
      durationMs: Date.now() - started,
      path,
      method: "GET",
      metadata: { bytes: text.length },
    });
    return text;
  } catch {
    recordPlatformLog({
      category: "data",
      source: "BSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "BSE text feed could not be reached.",
      statusCode: 503,
      durationMs: Date.now() - started,
      path,
      method: "GET",
    });
    return null;
  }
}

export async function fetchBse<T = unknown>(path: string, timeoutMs = 12_000): Promise<T | null> {
  const started = Date.now();
  try {
    const response = await fetch(`${BSE_BASE}${path}`, {
      headers: BSE_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      // A refused request is answered with a 302 to an HTML error page rather than a 4xx, so
      // following it would hand back HTML to JSON.parse.
      redirect: "manual",
    });
    if (!response.ok) {
      recordPlatformLog({
        category: "third-party",
        source: "BSE India",
        useCase: "Data fetching from third-party platforms",
        operation: `GET ${path}`,
        message: "BSE JSON endpoint returned a non-success status.",
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
      source: "BSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "BSE JSON endpoint completed without error.",
      statusCode: response.status,
      durationMs: Date.now() - started,
      path,
      method: "GET",
    });
    return payload;
  } catch {
    recordPlatformLog({
      category: "third-party",
      source: "BSE India",
      useCase: "Data fetching from third-party platforms",
      operation: `GET ${path}`,
      message: "BSE JSON endpoint could not be reached.",
      statusCode: 503,
      durationMs: Date.now() - started,
      path,
      method: "GET",
    });
    return null;
  }
}
