import { NextResponse } from "next/server";
import { updateUser, userFromRequest } from "../../../lib/store";
import { getAccessStatus, renewedUntil, SUBSCRIPTION_DAYS } from "../../../lib/subscription";
import { todayIST } from "../../../lib/nse-client";

export const dynamic = "force-dynamic";

/**
 * Activates or extends a subscription.
 *
 * There is no payment provider wired in, so this grants the period outright — the flow is real,
 * the billing is not. Anything shipping to production must take payment before this point.
 */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Please sign in to manage your subscription." }, { status: 401 });
  }

  const today = todayIST();
  const until = renewedUntil(user.subscribedUntil, today);

  const updated = await updateUser(user.id, { subscribedUntil: until });
  if (!updated) {
    return NextResponse.json({ error: "Couldn't update your subscription. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subscribedUntil: until,
    days: SUBSCRIPTION_DAYS,
    status: await getAccessStatus(updated),
  });
}
