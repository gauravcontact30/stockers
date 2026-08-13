// What the person running this needs to do today.
//
// The overview was a wall of totals. A total is a thing to look at; none of them is a thing to act
// on, and an admin opening the dashboard is nearly always asking the second question — is anything
// wrong, and is anything about to be. This is that list.
//
// Pure: accounts in, traffic in, today's date in, a ranked list of things out. No fetching and no
// clock, so every rule here can be checked and none of them drifts with the machine's timezone.
//
// The bar for an item is that it is *actionable* and *specific*. "Traffic is down" is neither.
// "Four subscriptions lapse within a week" names a number, a deadline and a page to open. Anything
// that cannot meet that bar belongs in the figures above, not here.

import type { FeatureUsage } from "./analytics-report";

export type Urgency = "critical" | "warning" | "info";

export type AttentionItem = {
  id: string;
  urgency: Urgency;
  title: string;
  /** Why it matters, in one sentence. */
  detail: string;
  /** How many things this is about, for the badge. */
  count: number;
  /** Where to go and deal with it. */
  href: string;
  action: string;
};

/** The shape this needs off an account. Structurally a subset of the admin roster's row. */
export type AccountLike = {
  id: string;
  name: string;
  email: string;
  plan: string;
  role?: string;
  createdAt: string;
  subscribedUntil?: string | null;
  emailVerified: boolean;
};

/** A subscription inside this many days is close enough to be worth chasing. */
export const EXPIRY_WINDOW_DAYS = 7;
/** An account unverified longer than this is not going to verify on its own. */
const STALE_VERIFICATION_DAYS = 3;

/** Whole calendar days from `from` to `to`. Negative once `to` has passed. */
export function daysUntil(to: string | null | undefined, from: string): number | null {
  if (!to) return null;
  const target = Date.parse(`${to}T00:00:00Z`);
  const start = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(start)) return null;
  return Math.round((target - start) / 86_400_000);
}

/**
 * Subscriptions that lapse within the window, soonest first. Already-lapsed ones are excluded.
 *
 * Generic over the row so a caller gets its own richer type back rather than the narrow shape this
 * module needs — the overview renders these straight into a table with columns `AccountLike` does
 * not describe.
 */
export function expiringSoon<T extends AccountLike>(accounts: T[], today: string, within = EXPIRY_WINDOW_DAYS): T[] {
  return accounts
    .filter((account) => {
      const left = daysUntil(account.subscribedUntil, today);
      return left !== null && left >= 0 && left <= within;
    })
    .sort((a, b) => (a.subscribedUntil ?? "").localeCompare(b.subscribedUntil ?? ""));
}

/**
 * Subscriptions that have already run out.
 *
 * Bounded to the last thirty days rather than all of history: an account that lapsed a year ago is
 * not a task, it is a statistic, and putting it in a queue of things to do makes the queue useless.
 */
export function recentlyLapsed<T extends AccountLike>(accounts: T[], today: string, within = 30): T[] {
  return accounts
    .filter((account) => {
      const left = daysUntil(account.subscribedUntil, today);
      return left !== null && left < 0 && left >= -within;
    })
    .sort((a, b) => (b.subscribedUntil ?? "").localeCompare(a.subscribedUntil ?? ""));
}

/** Accounts that signed up more than a few days ago and never confirmed their address. */
export function stuckUnverified<T extends AccountLike>(accounts: T[], today: string): T[] {
  return accounts.filter((account) => {
    if (account.emailVerified) return false;
    const age = daysUntil(account.createdAt.slice(0, 10), today);
    return age !== null && age <= -STALE_VERIFICATION_DAYS;
  });
}

/**
 * The queue, worst first.
 *
 * Every item is generated only when its condition actually holds, so an empty list means a system
 * with nothing outstanding rather than a check that did not run — which is why the panel can say
 * "nothing needs you" and be believed.
 */
export function buildAttentionQueue({
  accounts,
  today,
  features = [],
  lockedFeatures = 0,
  unhealthyChecks = 0,
  ledgerUnavailable = false,
}: {
  accounts: AccountLike[];
  today: string;
  /** Today's feature usage, for the paywall-demand item. */
  features?: FeatureUsage[];
  lockedFeatures?: number;
  /** Health checks currently in an `off` state. */
  unhealthyChecks?: number;
  ledgerUnavailable?: boolean;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (unhealthyChecks > 0) {
    items.push({
      id: "health",
      urgency: "critical",
      title: `${unhealthyChecks} integration${unhealthyChecks === 1 ? " is" : "s are"} down`,
      detail: "Something the app depends on is configured but not answering. The panel below names which.",
      count: unhealthyChecks,
      href: "/admin/application",
      action: "Check application",
    });
  }

  const expiring = expiringSoon(accounts, today);
  if (expiring.length > 0) {
    const soonest = daysUntil(expiring[0].subscribedUntil, today) ?? 0;
    items.push({
      id: "expiring",
      urgency: soonest <= 2 ? "critical" : "warning",
      title: `${expiring.length} subscription${expiring.length === 1 ? "" : "s"} lapse within ${EXPIRY_WINDOW_DAYS} days`,
      detail:
        soonest === 0
          ? `The soonest is ${expiring[0].name}, today.`
          : `The soonest is ${expiring[0].name}, in ${soonest} day${soonest === 1 ? "" : "s"}.`,
      count: expiring.length,
      href: "/admin/subscriptions",
      action: "Review subscriptions",
    });
  }

  const lapsed = recentlyLapsed(accounts, today);
  if (lapsed.length > 0) {
    items.push({
      id: "lapsed",
      urgency: "warning",
      title: `${lapsed.length} subscription${lapsed.length === 1 ? " has" : "s have"} lapsed this month`,
      detail: "These accounts have lost their AI access and have not renewed.",
      count: lapsed.length,
      href: "/admin/subscriptions",
      action: "Review subscriptions",
    });
  }

  const unverified = stuckUnverified(accounts, today);
  if (unverified.length > 0) {
    items.push({
      id: "unverified",
      urgency: "warning",
      title: `${unverified.length} account${unverified.length === 1 ? " has" : "s have"} never verified their email`,
      detail: `Signed up more than ${STALE_VERIFICATION_DAYS} days ago and still unconfirmed — usually a mail delivery problem rather than a change of mind.`,
      count: unverified.length,
      href: "/admin/users",
      action: "Open accounts",
    });
  }

  // The clearest signal of what the paywall is holding back: reaches that were refused, ranked.
  const blocked = features.filter((feature) => feature.blocked > 0).sort((a, b) => b.blocked - a.blocked);
  const blockedTotal = blocked.reduce((sum, feature) => sum + feature.blocked, 0);
  if (blockedTotal > 0) {
    items.push({
      id: "blocked",
      urgency: "info",
      title: `${blockedTotal} AI open${blockedTotal === 1 ? " was" : "s were"} refused today`,
      detail: `Most refused: ${blocked[0].label}, ${blocked[0].blocked} time${blocked[0].blocked === 1 ? "" : "s"}. This is demand the paywall is holding back, not an error.`,
      count: blockedTotal,
      href: "/admin/analytics",
      action: "See traffic",
    });
  }

  if (lockedFeatures > 0) {
    items.push({
      id: "locked",
      urgency: "info",
      title: `${lockedFeatures} feature${lockedFeatures === 1 ? " is" : "s are"} switched off`,
      detail: "An administrator has turned these off for everyone, including paying subscribers.",
      count: lockedFeatures,
      href: "/admin/features",
      action: "Review locks",
    });
  }

  if (ledgerUnavailable) {
    items.push({
      id: "ledger",
      urgency: "info",
      title: "Revenue is not being recorded",
      detail: "Payments still credit accounts, but the ledger they should be written to cannot be read.",
      count: 1,
      href: "/admin/application",
      action: "Check application",
    });
  }

  const ORDER: Urgency[] = ["critical", "warning", "info"];
  return items.sort((a, b) => ORDER.indexOf(a.urgency) - ORDER.indexOf(b.urgency) || b.count - a.count);
}
