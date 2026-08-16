import { NextResponse } from "next/server";
import { FEATURE_THROTTLE_MS, recordEvent, visitorIdFromRequest } from "./analytics";
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
  const allowed = canUseFeature(status, locks, feature);

  /**
   * Every AI route funnels through here, which makes this the one place that sees the whole of
   * what the audience reaches for — and it sees it on the server, so the "most explored feature"
   * ranking in the admin dashboard cannot be moved by anyone posting at an endpoint.
   *
   * Refusals are recorded as well as opens: the features people are turned away from are the
   * clearest signal of what the paywall is holding back, and a count of successful opens alone
   * cannot show it. Not awaited — the visitor is waiting on the feature, not on the bookkeeping,
   * and `recordEvent` swallows its own failures rather than surfacing an unhandled rejection.
   */
  void recordEvent({
    type: "feature",
    feature,
    userId: user?.id ?? null,
    // The operators exercise every AI feature while testing them; that is not audience interest.
    userEmail: user?.email ?? null,
    visitorId: visitorIdFromRequest(request),
    userAgent: request.headers.get("user-agent"),
    blocked: !allowed,
    // Several panels refresh themselves on a timer. Without this the ranking would measure poll
    // intervals rather than interest — see the throttle note in ./analytics.
    throttleMs: FEATURE_THROTTLE_MS,
  });

  return {
    allowed,
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
