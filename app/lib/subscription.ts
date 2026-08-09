import { CACHE_TAGS } from "./cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cached, fetchNse, todayIST } from "./nse-client";
import type { AppUser } from "./store";

/** Length of the free trial, counted in open market days rather than calendar days. */
export const TRIAL_MARKET_DAYS = 5;
/** How long a renewal buys, in calendar days. */
export const SUBSCRIPTION_DAYS = 30;

/**
 * Whether an expired trial actually blocks AI features.
 *
 * Off by default: every AI feature stays open and lapsed users are only reminded, not locked out.
 * The trial is still tracked and reported so the reminder can say how many days are left, and
 * setting ENFORCE_AI_PAYWALL=true turns the hard paywall on without any code change. Admin
 * feature locks apply either way.
 */
export const PAYWALL_ENABLED = process.env.ENFORCE_AI_PAYWALL === "true";

export type AccessState = "admin" | "trial" | "active" | "expired";

export type AccessStatus = {
  state: AccessState;
  /** True when AI features should be usable. Always true while the paywall is not enforced. */
  allowed: boolean;
  /** Whether an expired trial actually locks features, or merely prompts a reminder. */
  enforced: boolean;
  isAdmin: boolean;
  /** Open market days consumed out of the trial allowance. */
  marketDaysUsed: number;
  marketDaysLeft: number;
  trialStartedAt: string | null;
  subscribedUntil: string | null;
  today: string;
};

const HOLIDAY_TTL_MS = 12 * 60 * 60_000;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** NSE writes holiday dates as "26-Jan-2026". */
export function parseHolidayDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

/**
 * NSE's published trading-holiday calendar. Fetched rather than hardcoded because Indian market
 * holidays move with the lunar calendar and with state elections, so a baked-in list would drift
 * and quietly hand users extra or fewer trial days.
 */
export const getTradingHolidays = cached(HOLIDAY_TTL_MS, async (): Promise<Set<string>> => {
  const payload = await fetchNse<Record<string, unknown>>("/holiday-master?type=trading");
  const holidays = new Set<string>();
  if (!payload || typeof payload !== "object") return holidays;

  // The response is keyed by market segment ("CBM" for the cash market, and others); the equity
  // calendar is what matters, but every segment is folded in so a new key can't silently drop it.
  for (const rows of Object.values(payload)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Record<string, unknown>[]) {
      const date = parseHolidayDate(row.tradingDate);
      if (date) holidays.add(date);
    }
  }

  return holidays;
  // Not persisted: this resolves to a Set, which does not survive the Data Cache's JSON round trip.
}, { key: "nse:trading-holidays", tags: [CACHE_TAGS.nse] });

function isWeekend(iso: string): boolean {
  // Parsed as UTC midnight so the weekday can't shift with the server's timezone.
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function nextDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Open market days from `fromIso` to `toIso` inclusive: weekdays that are not NSE holidays.
 *
 * Counting is capped so a long-dormant account can't walk the calendar a day at a time — the
 * caller only ever needs to know whether the allowance is used up.
 */
export function countMarketDays(fromIso: string, toIso: string, holidays: Set<string>, cap = 400): number {
  if (fromIso > toIso) return 0;

  let count = 0;
  let cursor = fromIso;

  for (let guard = 0; guard < cap && cursor <= toIso; guard++) {
    if (!isWeekend(cursor) && !holidays.has(cursor)) count++;
    cursor = nextDay(cursor);
  }

  return count;
}

/** The IST calendar date embedded in an ISO timestamp. */
export function istDateOf(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Works out what a user may currently access.
 *
 * Order matters: admins are unconditional, then a live paid subscription, then the trial. A user
 * whose subscription lapsed falls back to the trial test rather than being locked outright, which
 * keeps the two independent.
 */
export function accessStatusFor(user: AppUser | null, today: string, holidays: Set<string>): AccessStatus {
  const base = {
    isAdmin: false,
    enforced: PAYWALL_ENABLED,
    marketDaysUsed: 0,
    marketDaysLeft: 0,
    trialStartedAt: null as string | null,
    subscribedUntil: null as string | null,
    today,
  };

  // `state` always reports the true trial position so the reminder can be specific, while
  // `allowed` only turns false when the paywall is actually being enforced.
  const permitted = (allowed: boolean) => allowed || !PAYWALL_ENABLED;

  // Signed-out visitors are treated as lapsed: they see everything, and are invited to sign up.
  if (!user) return { ...base, state: "expired", allowed: permitted(false) };

  if (user.role === "admin") {
    return { ...base, state: "admin", allowed: true, isAdmin: true, marketDaysLeft: TRIAL_MARKET_DAYS };
  }

  const subscribedUntil = user.subscribedUntil ?? null;
  if (subscribedUntil && today <= subscribedUntil) {
    return { ...base, state: "active", allowed: true, subscribedUntil, marketDaysLeft: TRIAL_MARKET_DAYS };
  }

  // Accounts created before trials existed fall back to their creation date, so nobody is denied
  // a trial they never had the chance to use.
  const trialStartedAt = user.trialStartedAt ?? user.createdAt;
  const startDate = istDateOf(trialStartedAt);

  if (!startDate) {
    return { ...base, state: "expired", allowed: permitted(false), subscribedUntil, trialStartedAt };
  }

  const marketDaysUsed = countMarketDays(startDate, today, holidays);
  const marketDaysLeft = Math.max(0, TRIAL_MARKET_DAYS - marketDaysUsed);

  return {
    ...base,
    state: marketDaysLeft > 0 ? "trial" : "expired",
    allowed: permitted(marketDaysLeft > 0),
    marketDaysUsed,
    marketDaysLeft,
    trialStartedAt,
    subscribedUntil,
  };
}

export async function getAccessStatus(user: AppUser | null): Promise<AccessStatus> {
  const holidays = await getTradingHolidays();
  return accessStatusFor(user, todayIST(), holidays);
}

/**
 * Adds a period to whichever is later: today, or an existing unexpired subscription.
 *
 * `days` defaults to the standard month so every existing caller is unchanged; a paid annual cycle
 * passes 365. Extending from the current expiry rather than from today is what stops a subscriber
 * losing the days they have already paid for by renewing early.
 */
export function renewedUntil(current: string | null | undefined, today: string, days = SUBSCRIPTION_DAYS): string {
  const from = current && current > today ? current : today;
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Admin-controlled feature locks
// ---------------------------------------------------------------------------

/** Every AI-backed surface an admin can lock independently. */
export const AI_FEATURES = [
  { key: "intel", label: "AI intelligence search" },
  { key: "market-pulse", label: "AI market pulse" },
  { key: "top-picks", label: "Today's AI picks" },
  { key: "buy-tomorrow", label: "Buy tomorrow screener" },
  { key: "dip-winners", label: "Today's dip screener" },
  { key: "research", label: "AI stock research" },
  { key: "compare", label: "AI stock compare" },
  { key: "news", label: "AI market news" },
  { key: "etf-research", label: "AI ETF research" },
  // The exchange boards that moved out of the landing page. The data underneath each is public
  // and stays visible; what these keys gate is the AI layer now sitting on top of it.
  { key: "directory", label: "AI company directory" },
  { key: "sectors", label: "AI sector rotation" },
  { key: "most-traded", label: "AI most-traded read" },
  { key: "mtf", label: "AI MTF watch" },
  { key: "stock-news", label: "AI filings digest" },
  { key: "dividends", label: "AI dividend planner" },
  { key: "ipos", label: "AI IPO watch" },
  { key: "etf-board", label: "AI ETF board" },
] as const;

export type FeatureKey = (typeof AI_FEATURES)[number]["key"];

export type FeatureLocks = Record<string, boolean>;

const locksPath = path.join(process.cwd(), "app", "data", "feature-locks.json");

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && AI_FEATURES.some((feature) => feature.key === value);
}

export async function readFeatureLocks(): Promise<FeatureLocks> {
  try {
    const raw = await fs.readFile(locksPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const locks: FeatureLocks = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isFeatureKey(key)) locks[key] = value === true;
    }
    return locks;
  } catch {
    // No file yet, or unreadable — nothing is locked.
    return {};
  }
}

export async function writeFeatureLocks(locks: FeatureLocks): Promise<void> {
  await fs.mkdir(path.dirname(locksPath), { recursive: true });
  await fs.writeFile(locksPath, JSON.stringify(locks, null, 2), "utf8");
}

export async function setFeatureLock(feature: FeatureKey, locked: boolean): Promise<FeatureLocks> {
  const locks = await readFeatureLocks();
  locks[feature] = locked;
  await writeFeatureLocks(locks);
  return locks;
}

/**
 * Whether a specific feature is usable right now: the subscription must allow it, and an admin
 * must not have locked it. Admins ignore their own locks so they can still verify a locked
 * feature works.
 */
export function canUseFeature(status: AccessStatus, locks: FeatureLocks, feature: string): boolean {
  if (status.isAdmin) return true;
  if (locks[feature]) return false;
  return status.allowed;
}
