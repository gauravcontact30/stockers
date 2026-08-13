import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { analyticsBackendName, dayBefore, istDay, listEvents, ANALYTICS_RETENTION_DAYS } from "../../../lib/analytics";
import { buildReport } from "../../../lib/analytics-report";
import { listUsers, userFromRequest, type AppUser } from "../../../lib/store";

export const dynamic = "force-dynamic";

/** The windows the dashboard offers. Anything else is snapped to the nearest of these. */
export const RANGE_OPTIONS = [1, 7, 30, 90] as const;

const DEFAULT_DAYS = 30;

/**
 * Reads the requested window, refusing to be talked into an unbounded one.
 *
 * A range is a database query someone can set from a URL, so it is clamped rather than trusted:
 * the retention window is the most that exists, and asking for more than that would only ever
 * scan rows that are not there.
 */
export function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), ANALYTICS_RETENTION_DAYS);
}

/**
 * Traffic, accounts and AI feature usage, for the super admin dashboard.
 *
 * Admin-only, and the check is here on the server rather than only in the UI that links to it —
 * this joins page views to names, addresses and mobile numbers, so a caller who merely knows the
 * URL must get nothing. The same rule the rest of `/api/admin` follows.
 */
async function requireAdmin(request: Request): Promise<AppUser | null> {
  const user = await userFromRequest(request);
  return user && (user.role === "admin" || isSuperAdminEmail(user.email)) ? user : null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const days = rangeFrom(new URL(request.url).searchParams.get("days"));
  const today = istDay();

  try {
    // Both are needed to answer a single row of the table — the event says what happened and the
    // account says who it happened to — so they are fetched together rather than one after the other.
    const [events, users] = await Promise.all([listEvents(dayBefore(today, days - 1)), listUsers()]);

    return NextResponse.json(
      buildReport({ events, users, today, days, backend: analyticsBackendName() }),
      // Never cached, and never by a shared cache: this is one admin's view of everyone's data.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(error);
    // Unlike recording an event, reading fails loudly. An admin shown an empty chart would read it
    // as a site nobody visited, which is a worse outcome than being told the query did not run.
    return NextResponse.json({ error: "Couldn't read the analytics store." }, { status: 500 });
  }
}
