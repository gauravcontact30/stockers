import { NextResponse } from "next/server";
import { userFromRequest } from "./store";
import { canUseFeature, getAccessStatus, readFeatureLocks, type AccessStatus, type FeatureKey } from "./subscription";

export type Guard = { allowed: boolean; status: AccessStatus; locked: boolean };

/**
 * Resolves whether the caller may use one AI feature.
 *
 * This runs on the server for a reason: hiding a section in the UI stops nobody from calling the
 * endpoint behind it. The paywall is only real because the route itself refuses.
 */
export async function guardFeature(request: Request, feature: FeatureKey): Promise<Guard> {
  const user = await userFromRequest(request);
  const [status, locks] = await Promise.all([getAccessStatus(user), readFeatureLocks()]);

  return {
    allowed: canUseFeature(status, locks, feature),
    status,
    locked: locks[feature] === true && !status.isAdmin,
  };
}

/**
 * The response a gated route returns when access is refused. 402 Payment Required is the honest
 * status: the request was understood and the caller authenticated, they simply have not paid.
 */
export function lockedResponse(guard: Guard, feature: FeatureKey) {
  return NextResponse.json(
    {
      error: guard.locked
        ? "This feature has been turned off by an administrator."
        : "Your free trial has ended. Renew your subscription to keep using AI features.",
      locked: guard.locked,
      feature,
      state: guard.status.state,
      marketDaysLeft: guard.status.marketDaysLeft,
      subscribedUntil: guard.status.subscribedUntil,
    },
    { status: 402 },
  );
}
