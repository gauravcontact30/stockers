import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { isAnalyticsExcludedEmail } from "../../../lib/analytics-exclusions";
import { listPresence } from "../../../lib/presence";
import { buildPresenceReport, type LivePresenceState } from "../../../lib/presence-report";
import { listUsers, userFromRequest } from "../../../lib/store";
import { isMissingTable, missingTableMessage } from "../../../lib/supabase";

/**
 * Who is on the site right now.
 *
 * Admins only, and checked here on the server rather than only in the UI that links to it: this
 * joins live sittings to names, email addresses and mobile numbers, so a caller who merely knows
 * the URL must get nothing. The same rule the rest of `/api/admin` follows.
 *
 * A store that has not been created yet comes back as `available: false` and a sentence saying
 * what to run, rather than as a 500. That case is not a fault — it is a deployment that has not
 * applied the schema — and telling the reader to try again would be advice that cannot work.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  const now = new Date();

  try {
    // The sittings say who is here and the accounts say who they are; both are needed for a single
    // row, so they are fetched together rather than one after the other.
    const [sessions, users] = await Promise.all([listPresence(now), listUsers()]);
    const excludedUserIds = new Set(users.filter((account) => isAnalyticsExcludedEmail(account.email)).map((account) => account.id));
    const visibleUsers = users.filter((account) => !excludedUserIds.has(account.id));
    const visibleSessions = sessions.filter((session) => !(session.userId && excludedUserIds.has(session.userId)));

    return NextResponse.json(buildPresenceReport({ sessions: visibleSessions, users: visibleUsers, now }) satisfies LivePresenceState, {
      // One admin's view of where everyone currently is. Never stored, and never by a shared cache.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { available: false, message: missingTableMessage("live_sessions") } satisfies LivePresenceState,
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Couldn't read the live session store." }, { status: 500 });
  }
}
