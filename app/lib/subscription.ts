import { CACHE_TAGS } from "./cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isSuperAdminEmail } from "./admin-access";
import type { PlanName } from "./auth-validation";
import { cached, fetchNse, todayIST } from "./nse-client";
import {
  AI_FEATURES,
  featureTier,
  isFeatureKey,
  TIER_LABEL,
  tierAtLeast,
  tierForPlan,
  type FeatureKey,
  type PlanTier,
} from "./plan-tiers";
import type { AppUser } from "./store";

// The feature table itself lives in ./plan-tiers, which imports nothing from Node — the browser
// needs the same tiers to decide what to blur. Re-exported here so the routes and pages that have
// always imported them from this module keep working.
export {
  AI_FEATURES,
  FEATURE_BY_KEY,
  featureTier,
  featuresForTier,
  isFeatureKey,
  isPlanTier,
  PLAN_HIGHLIGHTS,
  PLAN_TIERS,
  starsFor,
  TIER_LABEL,
  TIER_RANK,
  tierAtLeast,
  tierForPlan,
} from "./plan-tiers";
export type { AiFeature, FeatureKey, PlanTier } from "./plan-tiers";

/** Length of the free trial, counted in IST calendar days from signup. */
export const TRIAL_DAYS = 3;
/** Backward-compatible policy/status name; the trial now uses calendar days, not market days. */
export const TRIAL_MARKET_DAYS = TRIAL_DAYS;
/** How long a renewal buys, in calendar days. */
export const SUBSCRIPTION_DAYS = 30;

export type AccessState = "admin" | "trial" | "active" | "expired";

export type AccessStatus = {
  state: AccessState;
  /**
   * True when the account has any AI entitlement at all — an admin, or a live paid plan.
   *
   * This is a summary, not the gate. Which *particular* features are usable depends on the tier
   * below, because a Starter subscriber is `allowed` and still cannot open a Pro screener.
   */
  allowed: boolean;
  /**
   * The highest tier this account may use, or null when it may use none.
   *
   * Null for a lapsed account. A live free trial reports the Pro tier because it unlocks Starter
   * and Pro AI features for three calendar days. See `accessStatusFor`.
   */
  tier: PlanTier | null;
  /** The plan the account is on, for the client to name it back to them. Null when unsubscribed. */
  planName: PlanName | null;
  isAdmin: boolean;
  /** Calendar days consumed out of the trial allowance. */
  marketDaysUsed: number;
  marketDaysLeft: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
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

export function countTrialDays(fromIso: string, toIso: string): number {
  const start = Date.parse(`${fromIso}T00:00:00Z`);
  const end = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

export function addTrialDays(fromIso: string, days = TRIAL_DAYS): string | null {
  const start = Date.parse(`${fromIso}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
 * A live trial grants Starter and Pro AI features for three IST calendar days. Paid plans use the
 * stored plan tier, Elite remains paid, and admins are unconditional above the top tier.
 */
export function accessStatusFor(user: AppUser | null, today: string, _holidays: Set<string> = new Set()): AccessStatus {
  const base = {
    isAdmin: false,
    tier: null as PlanTier | null,
    planName: null as PlanName | null,
    marketDaysUsed: 0,
    marketDaysLeft: 0,
    trialStartedAt: null as string | null,
    trialEndsAt: null as string | null,
    subscribedUntil: null as string | null,
    today,
  };

  // Signed-out visitors are treated as lapsed: they are shown what exists and invited to sign up.
  if (!user) return { ...base, state: "expired", allowed: false };

  if (user.role === "admin" || isSuperAdminEmail(user.email)) {
    return {
      ...base,
      state: "admin",
      allowed: true,
      isAdmin: true,
      tier: "elite",
      planName: "Elite",
      marketDaysLeft: TRIAL_DAYS,
    };
  }

  // Accounts created before trials existed fall back to their creation date, so nobody is denied
  // a trial they never had the chance to use. An unparseable date reads as a spent trial.
  const trialStartedAt = user.trialStartedAt ?? user.createdAt;
  const startDate = istDateOf(trialStartedAt);
  const elapsedTrialDays = startDate ? countTrialDays(startDate, today) : TRIAL_DAYS;
  const marketDaysUsed = Math.min(TRIAL_DAYS, elapsedTrialDays);
  const marketDaysLeft = Math.max(0, TRIAL_DAYS - elapsedTrialDays);
  const trialEndsAt = startDate ? addTrialDays(startDate) : null;

  const subscribedUntil = user.subscribedUntil ?? null;
  if (subscribedUntil && today <= subscribedUntil) {
    const tier = tierForPlan(user.plan);
    return {
      ...base,
      state: "active",
      allowed: true,
      tier,
      // Read back from the tier rather than from the raw record, so a plan string this build does
      // not recognise still reports a name that matches the access actually granted.
      planName: TIER_LABEL[tier],
      subscribedUntil,
      marketDaysUsed,
      marketDaysLeft,
      trialStartedAt,
      trialEndsAt,
    };
  }

  if (marketDaysLeft > 0) {
    return {
      ...base,
      state: "trial",
      allowed: true,
      tier: "pro",
      planName: "Pro",
      marketDaysUsed,
      marketDaysLeft,
      trialStartedAt,
      trialEndsAt,
      subscribedUntil,
    };
  }

  return {
    ...base,
    state: "expired",
    allowed: false,
    marketDaysUsed,
    marketDaysLeft,
    trialStartedAt,
    trialEndsAt,
    subscribedUntil,
  };
}

export async function getAccessStatus(user: AppUser | null): Promise<AccessStatus> {
  return accessStatusFor(user, todayIST());
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

// The surfaces an admin can lock, and the tier each one belongs to, are defined together in
// ./plan-tiers and re-exported at the top of this file.

export type FeatureLocks = Record<string, boolean>;

const locksPath = path.join(process.cwd(), "app", "data", "feature-locks.json");

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
 * Whether a specific feature is usable right now.
 *
 * Three things have to hold: an admin must not have locked it, the caller must hold a plan, and
 * that plan must reach the feature's tier. Admins ignore their own locks and every tier, so they
 * can still verify a locked or top-tier feature works.
 */
export function canUseFeature(status: AccessStatus, locks: FeatureLocks, feature: string): boolean {
  if (status.isAdmin) return true;
  if (locks[feature]) return false;

  const required = featureTier(feature);
  // Not a key this app tiers — fall back to "holds any plan" rather than inventing a price for it.
  if (!required) return status.allowed;

  return tierAtLeast(status.tier, required);
}

/**
 * The plan a caller would have to be on to use a feature they currently cannot.
 *
 * Null when the refusal has nothing to do with money — an admin lock, or a key with no tier — so a
 * caller can tell "buy this" apart from "this is switched off", which are not the same message.
 */
export function requiredPlanFor(feature: string, locks: FeatureLocks): PlanName | null {
  if (locks[feature]) return null;
  const tier = featureTier(feature);
  return tier ? TIER_LABEL[tier] : null;
}

export function featureKeys(): FeatureKey[] {
  return AI_FEATURES.map((feature) => feature.key);
}
