import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { readLedger } from "../../../lib/payments-ledger";
import { userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * What the app has been paid.
 *
 * Admins only, and re-checked here rather than trusted from the page: the dashboard hides itself
 * from everyone else, but that is presentation — this route can be called directly, and it answers
 * with what every customer has paid.
 *
 * `readLedger` never throws; a store that cannot be read comes back as a reason rather than a 500,
 * because revenue is one panel on the overview and an accounting read that fails must not take the
 * rest of the page with it.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  return NextResponse.json(await readLedger(), {
    // Customer payment records: never stored, and never by a cache anything else can read from.
    headers: { "Cache-Control": "no-store" },
  });
}
