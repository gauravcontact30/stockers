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
import { supabaseConfigured, supabaseRequest } from "./supabase";

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
  /** Razorpay's order id, for the ledger. Absent on a webhook that did not carry one. */
  orderId?: string | null;
  /** Paise, exactly as Razorpay counts it. Absent when the caller could not read it. */
  amountPaise?: number | null;
  promoCode?: string | null;
  referralCode?: string | null;
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

  // The ledger entry, after the entitlement rather than before it. Every paywall check reads
  // `users.subscribed_until`; this table is the record of what was billed, and a subscriber must
  // never be left unentitled because the audit row could not be written. So it is best-effort and
  // its failure is logged, not raised.
  await recordPayment({ ...input, plan, subscribedUntil });

  return { ok: true, user: updated, subscribedUntil, alreadyCredited: false };
}

/**
 * Writes one row of `public.subscription_payments`.
 *
 * Only against Supabase — there is no local ledger, because the JSON backend exists so a fresh
 * clone runs, and a fresh clone takes no payments. The primary key is Razorpay's payment id, so
 * the webhook arriving after the browser collides rather than double-counting the revenue.
 */
async function recordPayment(input: {
  userId: string;
  paymentId: string;
  orderId?: string | null;
  plan: string;
  cycle: BillingCycle;
  amountPaise?: number | null;
  promoCode?: string | null;
  referralCode?: string | null;
  subscribedUntil: string;
}): Promise<void> {
  if (!supabaseConfigured()) return;

  try {
    await supabaseRequest({
      method: "POST",
      path: "subscription_payments?on_conflict=payment_id",
      body: {
        payment_id: input.paymentId,
        order_id: input.orderId ?? null,
        user_id: input.userId,
        plan: input.plan,
        cycle: input.cycle,
        amount_paise: input.amountPaise ?? 0,
        currency: "INR",
        promo_code: input.promoCode ?? null,
        referral_code: input.referralCode ?? null,
        subscribed_until: input.subscribedUntil,
        paid_at: new Date().toISOString(),
      },
      merge: true,
    });
  } catch (error) {
    console.error("payments: could not write the ledger row", error);
  }
}
