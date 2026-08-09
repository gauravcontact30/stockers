import { NextResponse } from "next/server";
import { userFromRequest } from "./store";
import {
  canUseFeature,
  getAccessStatus,
  readFeatureLocks,
  requiredPlanFor,
  type AccessStatus,
  type FeatureKey,
} from "./subscription";
import type { PlanName } from "./auth-validation";

export type Guard = {
  allowed: boolean;
  status: AccessStatus;
  locked: boolean;
  /** The plan that would unlock this, or null when money is not what is missing. */
  requiredPlan: PlanName | null;
};

/**
 * Resolves whether the caller may use one AI feature.
 *
 * This runs on the server for a reason: hiding a section in the UI stops nobody from calling the
 * endpoint behind it. The paywall is only real because the route itself refuses.
 */
export async function guardFeature(request: Request, feature: FeatureKey): Promise<Guard> {
  const user = await userFromRequest(request);
  const [status, locks] = await Promise.all([getAccessStatus(user), readFeatureLocks()]);

  const locked = locks[feature] === true && !status.isAdmin;

  return {
    allowed: canUseFeature(status, locks, feature),
    status,
    locked,
    requiredPlan: locked ? null : requiredPlanFor(feature, locks),
  };
}

/**
 * The response a gated route returns when access is refused. 402 Payment Required is the honest
 * status: the request was understood and the caller authenticated, they simply have not paid.
 *
 * The message names the plan that would unlock this particular feature, because "subscribe" is not
 * actionable advice when there are three plans and only one of them is the right answer.
 */
export function lockedResponse(guard: Guard, feature: FeatureKey) {
  const { requiredPlan, status } = guard;

  const error = guard.locked
    ? "This feature has been turned off by an administrator."
    : requiredPlan
      ? status.tier
        ? `${requiredPlan} is needed for this feature. Upgrade your plan to unlock it.`
        : `${requiredPlan} is needed for this feature. Subscribe to unlock it.`
      : "Subscribe to use the AI features.";

  return NextResponse.json(
    {
      error,
      locked: guard.locked,
      feature,
      requiredPlan,
      /** The plan the caller is actually on, so the client can say "you're on X, this needs Y". */
      plan: status.planName,
      state: status.state,
      marketDaysLeft: status.marketDaysLeft,
      subscribedUntil: status.subscribedUntil,
    },
    { status: 402 },
  );
}
