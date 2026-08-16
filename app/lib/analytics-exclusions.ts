// Reads the analytics exclusion list. `server-only` for the same reason ./admin-access has it: this
// names real accounts, and a client component pulling it in should be a build error rather than a
// list of the operators' addresses shipped to every browser.
import "server-only";

/**
 * Accounts the platform does not track.
 *
 * These are the people who build and run the site. Every page they open while checking a deploy,
 * every AI feature they exercise while testing one, and every heartbeat from a dashboard left open
 * on a second monitor was being counted as audience — so "visitors today", the funnel, the most
 * explored features, the busiest hours and the Recent activity feed on Traffic & Usage were all
 * measuring the operators as much as the market. On a site at this stage that is not a rounding
 * error; it is the largest single contributor to its own numbers.
 *
 * Excluded rather than merely hidden. Nothing is written for these accounts in the first place —
 * see `recordEvent` in ./analytics and `touchPresence` in ./presence — because a row that exists
 * but is filtered on the way out is a row that the next query, export or count forgets to filter.
 *
 * The report still filters as well, and that is not redundant: it is what clears the events already
 * in the store from before this list existed. See `buildReport` in ./analytics-report.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not do
 * ---------------------------------------------------------------------------
 *
 * It does not exclude admins as a class. `isAdminEmail` would have been the shorter rule and it is
 * the wrong one: an admin is a role that can be granted to a customer's account, and a customer who
 * is given the admin page should still appear in the figures. This is a list of *operator* accounts,
 * which is a different thing that happens to overlap today.
 *
 * It also does not touch billing, subscriptions or the user list. An excluded account is a real
 * account and still appears in Users, Revenue and Subscriptions — it is only absent from the
 * traffic and usage telemetry, which is the only place its presence distorts anything.
 */
const EXCLUDED_EMAILS = ["garvcontact30@gmail.com", "gauravcontact66@gmail.com"];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailsFrom(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * The full set, with anything named in `ANALYTICS_EXCLUDED_EMAILS` folded in.
 *
 * The env var is there so a new operator or a QA account can be added without a deploy, exactly as
 * `ADMIN_EMAILS` and `TEST_ACCOUNT_EMAILS` work in ./admin-access. Read per call rather than frozen
 * into a module constant, so a change to the environment takes effect on the next request instead
 * of on the next cold start.
 */
export function analyticsExcludedEmails(): Set<string> {
  return new Set([
    ...EXCLUDED_EMAILS.map(normalizeEmail),
    ...emailsFrom(process.env.ANALYTICS_EXCLUDED_EMAILS),
  ]);
}

/** Whether this address is one the platform does not record traffic or usage for. */
export function isAnalyticsExcludedEmail(email: string | null | undefined): boolean {
  return Boolean(email && analyticsExcludedEmails().has(normalizeEmail(email)));
}
