"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isAdminPath } from "../lib/section-routes";

/**
 * Reports a page view, once per page per tab session.
 *
 * Mounted app-wide in the root layout. It renders nothing and blocks nothing: the request is fired
 * and forgotten, and every failure path — storage disabled, network down, endpoint refusing — ends
 * in the visitor seeing exactly the page they came for.
 *
 * What it sends is a random id, a path and a referring host. Not a fingerprint, no third party, and
 * no query strings: those are where the personal data is (a search term, a referral code, the token
 * in a verification link) and none of it is needed to count an arrival.
 */

/** Where the browser keeps the random id that makes one returning person countable as one person. */
const VISITOR_KEY = "stockers-visitor";
/** Mirrored into a cookie so the *server* can attribute a signed-out visitor's AI feature opens. */
const VISITOR_COOKIE = "stockers_visitor";
/** Marks a path already reported in this tab, so a back-and-forth is not counted as three visits. */
const SENT_PREFIX = "stockers-visit:";

/** The shape the server accepts: 8-64 characters of URL-safe alphabet. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function mint(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * This browser's visitor id, minting and storing one the first time.
 *
 * Null when storage is unavailable — a private-mode browser throws on access — in which case the
 * visit is still reported, just without an id, and counts as one anonymous arrival.
 */
export function visitorId(): string | null {
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY) ?? "";
    const id = ID_PATTERN.test(stored) ? stored : mint();
    window.localStorage.setItem(VISITOR_KEY, id);
    document.cookie = `${VISITOR_COOKIE}=${id}; path=/; max-age=31536000; SameSite=Lax`;
    return id;
  } catch {
    return null;
  }
}

/** Whether this tab has already reported `path`, marking it as reported on the way past. */
export function alreadySent(path: string): boolean {
  try {
    const key = `${SENT_PREFIX}${path}`;
    const seen = window.sessionStorage.getItem(key) === "1";
    window.sessionStorage.setItem(key, "1");
    return seen;
  } catch {
    // No session storage: fall through and report. The server folds a repeat from the same
    // visitor into the first one anyway, so the worst case here is a request that changes nothing.
    return false;
  }
}

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // The admin's own tour of the dashboard is not site traffic, and counting it would put the
    // person reading the chart into the chart.
    //
    // Membership rather than a `/admin` prefix: the admin pages sit in the `app/(admin)` route
    // group now, so they have no shared prefix left to test for. See `isAdminPath`.
    if (isAdminPath(pathname)) return;
    if (alreadySent(pathname)) return;

    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `keepalive` so a view reported as the visitor navigates away still goes out.
      keepalive: true,
      body: JSON.stringify({ path: pathname, referrer: document.referrer, visitorId: visitorId() }),
    }).catch(() => {
      // Counting a visit is never worth an error in a visitor's console.
    });
  }, [pathname]);

  return null;
}
