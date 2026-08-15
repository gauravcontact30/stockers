import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { buildHealthReport } from "../../../lib/admin-health";
import { userFromRequest } from "../../../lib/store";

/**
 * Which parts of this deployment are actually wired up.
 *
 * Admins only. The report itself carries no secrets — see the header of `../../../lib/admin-health`
 * — but which services a deployment is missing is still a map of where to push at it, so it is not
 * something to hand to anyone who asks.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  return NextResponse.json(await buildHealthReport(), { headers: { "Cache-Control": "no-store" } });
}
