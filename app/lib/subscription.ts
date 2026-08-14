import { CACHE_TAGS } from "./cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hasTestAccess, isSuperAdminEmail, TEST_ACCESS_UNTIL } from "./admin-access";
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
import { eq, supabaseConfigured, supabaseRequest } from "./supabase";

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
   * Null for a lapsed account. A live free trial reports the Elite tier, because the trial is the
   * whole product for three calendar days rather than a sample of the cheapest part of it. See
   * `accessStatusFor`.
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
 * A live trial grants *every* AI feature — Starter, Pro and Elite alike — for three IST calendar
 * days. A trial that only opened the cheapest tier was arguing for the cheapest plan; showing the
 * whole product and then closing it is what makes the choice at the end a real one. Paid plans use
 * the stored plan tier, and admins are unconditional above the top tier.
 *
 * When the three days are spent and nothing has been bought, the account falls to `expired` and
 * every AI feature locks until a plan is purchased.
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

  // A comped test account: every AI feature, for a fixed window, without admin rights.
  //
  // Checked after the admin branch and before the trial clock, so it cannot be cut short by a
  // trial that ran out and does not need a payment on the record. Reported as `active` with an
  // Elite tier and a real end date, which means the countdown, the plan pill and the paywall all
  // read it the same way they read a paid subscription — no separate state for them to mishandle.
  if (hasTestAccess(user.email, today)) {
    return {
      ...base,
      state: "active",
      allowed: true,
      tier: "elite",
      planName: "Elite",
      subscribedUntil: TEST_ACCESS_UNTIL,
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
      // The top tier, so nothing in the dashboard is locked while the trial is live. `state` is
      // what the UI reads to say "free trial" rather than "Elite subscriber" — the tier is the
      // access granted, not a claim about what they have paid for.
      tier: "elite",
      planName: "Elite",
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

const locksPath = process.env.STOCKERS_LOCKS_FILE || path.join(process.cwd(), "app", "data", "feature-locks.json");

/**
 * One row of `public.feature_locks`. Only locked features are stored — an absent row is open,
 * which is what a feature added to AI_FEATURES tomorrow should be without anybody writing a row.
 */
type LockRow = { feature: string; locked: boolean | null };

/**
 * The locks, from whichever store is configured.
 *
 * This used to be the JSON file alone, and that could not work in production: a serverless host's
 * application directory is read-only, so the admin's toggle failed silently, and anywhere else the
 * next deploy wiped it. An admin turning a feature off and finding it back on an hour later was
 * that bug. Supabase now holds them wherever it is configured, on the same rule as the account
 * store — configuration alone decides, and the two backends produce the same object.
 *
 * A failure reads as "nothing is locked" rather than throwing. That direction is deliberate: the
 * alternative is a database blip taking every AI surface off the site at once, which is a far
 * worse outcome than a lock that takes a moment longer to apply.
 */
export async function readFeatureLocks(): Promise<FeatureLocks> {
  if (supabaseConfigured()) {
    try {
      const rows = await supabaseRequest<LockRow>({ method: "GET", path: "feature_locks?select=feature,locked" });
      const locks: FeatureLocks = {};
      for (const row of rows) {
        if (isFeatureKey(row.feature) && row.locked !== false) locks[row.feature] = true;
      }
      return locks;
    } catch (error) {
      console.error("feature locks: could not be read", error);
      return {};
    }
  }

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

/**
 * Locks or unlocks one feature.
 *
 * Against Postgres this is one statement per change rather than a read of every lock followed by a
 * write of every lock: two admins toggling different features at the same moment would otherwise
 * each write the whole set, and the second would undo the first.
 */
export async function setFeatureLock(feature: FeatureKey, locked: boolean): Promise<FeatureLocks> {
  if (supabaseConfigured()) {
    if (locked) {
      await supabaseRequest({
        method: "POST",
        path: "feature_locks?on_conflict=feature",
        body: { feature, locked: true, updated_at: new Date().toISOString() },
        merge: true,
      });
    } else {
      // Unlocking removes the row rather than storing `false`: absent and open are the same state,
      // and keeping only one representation of it is what stops the two disagreeing.
      await supabaseRequest({ method: "DELETE", path: `feature_locks?feature=${eq(feature)}` });
    }
    return readFeatureLocks();
  }

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
