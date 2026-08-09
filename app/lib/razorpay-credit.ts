// Turning a captured payment into subscription days.
//
// Both ways a payment can reach this app — the browser reporting back from checkout, and Razorpay's
// webhook — end here, so the rule that a payment buys exactly one period lives in one place.
//
// The idempotency key is the payment id itself, recorded on the user. Whichever of the two arrives
// second sees its own id already credited and stops, so a subscriber never gets sixty days for one
// month's money and never gets thirty for two months' worth either.

import { todayIST } from "./nse-client";
import { CYCLE_DAYS, PLAN_NAMES, type BillingCycle, type PlanKey } from "./razorpay";
import { findUserById, updateUser, type AppUser } from "./store";
import { renewedUntil } from "./subscription";

export type CreditResult =
  | { ok: true; user: AppUser; subscribedUntil: string; alreadyCredited: boolean }
  | { ok: false; error: string };

/**
 * Credits one captured payment to one account.
 *
 * The caller must already have verified the payment against Razorpay — this does the bookkeeping,
 * not the checking.
 */
export async function creditPayment(input: {
  userId: string;
  paymentId: string;
  plan: PlanKey;
  cycle: BillingCycle;
}): Promise<CreditResult> {
  const user = await findUserById(input.userId);
  if (!user) return { ok: false, error: "That payment is not attached to an account we know." };

  // Already credited: report the subscription as it stands rather than extending it again.
  if (user.lastPaymentId === input.paymentId) {
    return { ok: true, user, subscribedUntil: user.subscribedUntil ?? "", alreadyCredited: true };
  }

  const subscribedUntil = renewedUntil(user.subscribedUntil, todayIST(), CYCLE_DAYS[input.cycle]);

  // The plan the user paid for is what they are on from here. Elite used to be folded into Pro
  // because access was all-or-nothing and the distinction bought nothing; now that each feature
  // carries a tier, collapsing the two would silently sell Elite and deliver Pro.
  const plan = PLAN_NAMES[input.plan];

  const updated = await updateUser(user.id, { subscribedUntil, lastPaymentId: input.paymentId, plan });
  if (!updated) return { ok: false, error: "Couldn't record your subscription. Please contact support." };

  return { ok: true, user: updated, subscribedUntil, alreadyCredited: false };
}
