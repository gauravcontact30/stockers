// Live IPO calendar straight from NSE's own public endpoints, replacing the hand-curated
// snapshot this section used to run on. Three feeds are combined:
//   all-upcoming-issues  -> issues that are open now ("Active") or announced ("Forthcoming")
//   public-past-issues   -> issues whose subscription window has already shut
//   ipo-detail           -> live category-wise subscription figures for an open issue
//
// NSE publishes these for its own website rather than as a documented API, so every field is
// parsed defensively and a failed fetch degrades to an empty list rather than throwing.

export type IpoStatus = "open" | "upcoming" | "closed";

export type IpoSubscriptionCategory = {
  label: string;
  /** Times subscribed, e.g. 2.51 — null when NSE has not published a figure for the category. */
  times: number | null;
  offered: number | null;
  bid: number | null;
};

export type IpoSubscription = {
  overall: number | null;
  categories: IpoSubscriptionCategory[];
};

export type NseIpo = {
  symbol: string;
  company: string;
  /** "Mainboard" or "SME" — SME issues have far larger lot sizes and a different investor base. */
  board: "Mainboard" | "SME";
  status: IpoStatus;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  priceBand: string | null;
  priceBandMin: number | null;
  priceBandMax: number | null;
  lotSize: number | null;
  issueSizeShares: number | null;
  /** Issue size in ₹ crore, derived from shares on offer × the top of the price band. */
  issueSizeCr: number | null;
  /** Live subscription demand — only fetched for issues that are currently open. */
  subscription: IpoSubscription | null;
};

export type IpoFeed = {
  ipos: NseIpo[];
  counts: Record<IpoStatus, number>;
  today: string;
  fetchedAt: string;
  live: boolean;
};

const NSE_BASE = "https://www.nseindia.com/api";
const CACHE_TTL_MS = 10 * 60_000;
// How far back a shut issue stays on the board. Long enough to cover the gap between closing and
// listing, short enough that the "closed" tab doesn't turn into an archive of the whole year.
const CLOSED_WINDOW_DAYS = 30;
// Subscription detail costs one request per issue, so it is only fetched for issues actually open.
const MAX_DETAIL_FETCHES = 6;

const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

let cache: { data: IpoFeed; expiresAt: number } | null = null;

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * NSE writes dates as "07-Aug-2026" on one endpoint and "03-AUG-2026" on another, and uses "-"
 * for "not announced yet". Normalised to ISO so the two feeds can be compared and sorted.
 */
export function parseNseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  // NSE returns share counts in Java scientific notation ("5.8422516E7") and pads prices with
  // stray whitespace; both parse cleanly once separators are stripped.
  const cleaned = value.replace(/[,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pulls the two ends out of a band written as "Rs.50 to Rs.53". */
export function parsePriceBand(value: unknown): { min: number | null; max: number | null } {
  if (typeof value !== "string") return { min: null, max: null };

  const numbers = value.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return { min: null, max: null };

  const min = Number(numbers[0]);
  const max = numbers.length > 1 ? Number(numbers[numbers.length - 1]) : min;
  return { min, max };
}

/**
 * Status is derived from today's IST date against the subscription window rather than trusted
 * from NSE's own "Active"/"Forthcoming" string, which is only refreshed periodically. The string
 * is the fallback for issues whose dates have not been published yet.
 */
export function statusFor(openDate: string | null, closeDate: string | null, nseStatus: string, today: string): IpoStatus {
  if (openDate && closeDate) {
    if (today < openDate) return "upcoming";
    if (today > closeDate) return "closed";
    return "open";
  }

  return nseStatus.toLowerCase() === "active" ? "open" : "upcoming";
}

function boardFor(series: unknown): "Mainboard" | "SME" {
  return typeof series === "string" && series.toUpperCase() === "SME" ? "SME" : "Mainboard";
}

function issueSizeCr(shares: number | null, upperBand: number | null): number | null {
  if (shares === null || upperBand === null) return null;
  return (shares * upperBand) / 1e7;
}

async function fetchNse(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${NSE_BASE}${path}`, {
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

type RawRecord = Record<string, unknown>;

function readString(record: RawRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "-") return value.trim();
  }
  return "";
}

function mapCurrent(record: RawRecord, today: string): NseIpo | null {
  const symbol = readString(record, "symbol");
  const company = readString(record, "companyName", "company");
  if (!symbol || !company) return null;

  const openDate = parseNseDate(record.issueStartDate);
  const closeDate = parseNseDate(record.issueEndDate);
  const band = parsePriceBand(readString(record, "priceBand", "issuePrice"));
  const shares = parseNumber(record.issueSize);

  return {
    symbol,
    company,
    board: boardFor(record.series),
    status: statusFor(openDate, closeDate, readString(record, "status"), today),
    openDate,
    closeDate,
    listingDate: parseNseDate(record.listingDate),
    priceBand: readString(record, "priceBand", "issuePrice") || null,
    priceBandMin: band.min,
    priceBandMax: band.max,
    lotSize: parseNumber(record.lotSize),
    issueSizeShares: shares,
    issueSizeCr: issueSizeCr(shares, band.max),
    subscription: null,
  };
}

function mapPast(record: RawRecord, today: string): NseIpo | null {
  const symbol = readString(record, "symbol");
  const company = readString(record, "company", "companyName");
  if (!symbol || !company) return null;

  const openDate = parseNseDate(record.ipoStartDate);
  const closeDate = parseNseDate(record.ipoEndDate);
  const band = parsePriceBand(readString(record, "priceRange", "issuePrice"));

  return {
    symbol,
    company,
    board: boardFor(record.securityType),
    status: statusFor(openDate, closeDate, "closed", today),
    openDate,
    closeDate,
    listingDate: parseNseDate(record.listingDate),
    priceBand: readString(record, "priceRange") || null,
    priceBandMin: band.min,
    priceBandMax: band.max,
    lotSize: null,
    issueSizeShares: null,
    issueSizeCr: null,
    subscription: null,
  };
}

/** Days between two ISO dates, used to age closed issues off the board. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

export function parseSubscription(payload: unknown): IpoSubscription | null {
  const rows = (payload as { bidDetails?: unknown })?.bidDetails;
  if (!Array.isArray(rows)) return null;

  const categories: IpoSubscriptionCategory[] = [];
  let overall: number | null = null;

  for (const row of rows as RawRecord[]) {
    const label = readString(row, "category");
    if (!label) continue;

    const times = parseNumber(row.noOfTime);

    if (label.toLowerCase() === "total") {
      overall = times;
      continue;
    }

    // NSE emits sub-rows (srNo "2.1", "1(a)") breaking each category down further. Only the
    // top-level categories are kept, so the card shows QIB/NII/Retail rather than 15 rows.
    const srNo = readString(row, "srNo");
    if (!/^\d+$/.test(srNo)) continue;
    if (times === null) continue;

    categories.push({
      label,
      times,
      offered: parseNumber(row.noOfSharesOffered),
      bid: parseNumber(row.noOfsharesBid),
    });
  }

  if (overall === null && categories.length === 0) return null;
  return { overall, categories };
}

async function attachSubscriptions(ipos: NseIpo[]): Promise<void> {
  const open = ipos.filter((ipo) => ipo.status === "open").slice(0, MAX_DETAIL_FETCHES);

  await Promise.all(
    open.map(async (ipo) => {
      const payload = await fetchNse(`/ipo-detail?symbol=${encodeURIComponent(ipo.symbol)}`);
      ipo.subscription = parseSubscription(payload);
    }),
  );
}

const STATUS_ORDER: Record<IpoStatus, number> = { open: 0, upcoming: 1, closed: 2 };

export async function getIpoFeed(): Promise<IpoFeed> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const today = todayIST();
  const [current, past] = await Promise.all([
    fetchNse("/all-upcoming-issues?category=ipo"),
    fetchNse("/public-past-issues"),
  ]);

  const ipos: NseIpo[] = [];
  const seen = new Set<string>();

  const push = (ipo: NseIpo | null) => {
    if (!ipo || seen.has(ipo.symbol)) return;
    seen.add(ipo.symbol);
    ipos.push(ipo);
  };

  if (Array.isArray(current)) {
    for (const record of current as RawRecord[]) push(mapCurrent(record, today));
  }

  if (Array.isArray(past)) {
    for (const record of past as RawRecord[]) {
      const ipo = mapPast(record, today);
      // Past issues run to well over a thousand rows; only recently shut ones are of any use on
      // a "what's happening now" board.
      if (!ipo || !ipo.closeDate || daysBetween(ipo.closeDate, today) > CLOSED_WINDOW_DAYS) continue;
      push(ipo);
    }
  }

  await attachSubscriptions(ipos);

  ipos.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    // Within a status, the most imminent date first: soonest to close, soonest to open, or most
    // recently shut.
    const aDate = a.status === "closed" ? a.closeDate : a.openDate;
    const bDate = b.status === "closed" ? b.closeDate : b.openDate;
    if (!aDate || !bDate) return 0;
    return a.status === "closed" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
  });

  const feed: IpoFeed = {
    ipos,
    counts: {
      open: ipos.filter((ipo) => ipo.status === "open").length,
      upcoming: ipos.filter((ipo) => ipo.status === "upcoming").length,
      closed: ipos.filter((ipo) => ipo.status === "closed").length,
    },
    today,
    fetchedAt: new Date().toISOString(),
    live: ipos.length > 0,
  };

  cache = { data: feed, expiresAt: Date.now() + CACHE_TTL_MS };
  return feed;
}
