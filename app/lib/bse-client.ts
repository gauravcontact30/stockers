// Shared plumbing for BSE India's public JSON endpoints.
//
// Like the NSE feeds in ./nse-client, these are published for bseindia.com itself rather than as
// a documented API: no key, no versioning, and a request without browser-ish headers (including
// the Referer) is refused or redirected to an error page. Every call therefore degrades to null
// on any failure so a section renders an empty state instead of taking the page down.

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
  try {
    const response = await fetch(url, {
      headers: { ...BSE_HEADERS, Accept: "text/csv,text/plain,*/*" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchBse<T = unknown>(path: string, timeoutMs = 12_000): Promise<T | null> {
  try {
    const response = await fetch(`${BSE_BASE}${path}`, {
      headers: BSE_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      // A refused request is answered with a 302 to an HTML error page rather than a 4xx, so
      // following it would hand back HTML to JSON.parse.
      redirect: "manual",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
