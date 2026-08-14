// Reads the admin allowlist. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

export const SUPER_ADMIN_EMAIL = "garvcontact30@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailsFrom(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export function superAdminEmails(): Set<string> {
  return new Set([
    normalizeEmail(SUPER_ADMIN_EMAIL),
    ...emailsFrom(process.env.SUPER_ADMIN_EMAIL),
    ...emailsFrom(process.env.SUPER_ADMIN_EMAILS),
  ]);
}

export function adminEmails(): Set<string> {
  return new Set([...emailsFrom(process.env.ADMIN_EMAILS), ...superAdminEmails()]);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && superAdminEmails().has(normalizeEmail(email)));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && adminEmails().has(normalizeEmail(email)));
}

// ---------------------------------------------------------------------------
// Test accounts
// ---------------------------------------------------------------------------
//
// Accounts given every AI feature for a fixed window, so the product can be exercised end to end
// without anyone paying for it or being made an admin.
//
// Two things this deliberately is not:
//
//   * It is not admin. These accounts get Elite-level *access* and nothing else — no user list, no
//     revenue page, no feature switches. Comping a tester by promoting them to admin would hand
//     over the whole back office to test a screener.
//   * It is not open-ended. `TEST_ACCESS_UNTIL` is a real date and the grant simply stops on it.
//     A relative "one month from now" window would renew itself on every request and quietly
//     become permanent free access, which is the failure mode this kind of list always has.
//
// Extra addresses can be appended without a deploy through `TEST_ACCOUNT_EMAILS`, and the date
// moved with `TEST_ACCESS_UNTIL`.

/** Granted full AI access until the date below. */
const TEST_ACCOUNT_EMAILS = [
  "chiragpandey678@gmail.com",
  "pankajdubae@gmail.com",
  "s77464524@gmail.com",
  "levime7908@careney.com",
  "jitu050288@gmail.com",
];

/**
 * Last IST day the grant covers, inclusive — one month from 14 August 2026.
 *
 * Compared as a string against `todayIST()`, which is the same YYYY-MM-DD comparison
 * `subscribedUntil` uses everywhere else, so this expires exactly the way a real subscription does.
 */
export const TEST_ACCESS_UNTIL = process.env.TEST_ACCESS_UNTIL || "2026-09-14";

export function testAccountEmails(): Set<string> {
  return new Set([
    ...TEST_ACCOUNT_EMAILS.map(normalizeEmail),
    ...emailsFrom(process.env.TEST_ACCOUNT_EMAILS),
  ]);
}

/**
 * Whether this address holds a live test grant on `today`.
 *
 * `today` is passed in rather than read from a clock here, so the expiry is testable and so this
 * agrees with the rest of the access calculation about what day it is.
 */
export function hasTestAccess(email: string | null | undefined, today: string): boolean {
  if (!email) return false;
  if (today > TEST_ACCESS_UNTIL) return false;
  return testAccountEmails().has(normalizeEmail(email));
}
