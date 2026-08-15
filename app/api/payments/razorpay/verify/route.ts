import { NextResponse } from "next/server";
import { creditPayment } from "../../../../lib/razorpay-credit";
import {
  fetchPayment,
  isBillingCycle,
  isPlanKey,
  paymentCovers,
  razorpayConfigured,
  verifyPaymentSignature,
} from "../../../../lib/razorpay";
import { userFromRequest } from "../../../../lib/store";
import { getAccessStatus } from "../../../../lib/subscription";

/**
 * Confirms a checkout and turns it into subscription days.
 *
 * Four things are checked before a single day is granted, and each one is a hole if it is missing:
 *
 *   the caller is signed in, and it is their own subscription being extended;
 *   the signature over order|payment verifies against the key secret, so the callback is Razorpay's
 *     rather than something typed into a console;
 *   the payment, re-fetched from Razorpay, is actually captured and actually for at least what the
 *     claimed plan costs;
 *   the payment was made against the order it names, and that order was opened for this user.
 *
 * The webhook does the same work independently, so a browser that dies on the confirmation screen
 * still gets its subscription.
 */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Please sign in before subscribing." }, { status: 401 });
  }

  if (!razorpayConfigured()) {
    return NextResponse.json({ error: "Card payments aren't switched on yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
  const plan = body?.plan;
  const cycle = body?.cycle;

  if (!orderId || !paymentId || !signature || !isPlanKey(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json({ error: "That payment confirmation is incomplete." }, { status: 400 });
  }

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    return NextResponse.json({ error: "That payment could not be verified." }, { status: 400 });
  }

  const payment = await fetchPayment(paymentId);
  if (!payment) {
    return NextResponse.json({ error: "Couldn't confirm the payment with Razorpay." }, { status: 502 });
  }

  // The notes were written when the order was opened, so they say whose subscription this is —
  // a valid payment for somebody else's order cannot be redeemed here.
  if (payment.order_id !== orderId || (payment.notes?.userId && payment.notes.userId !== user.id)) {
    return NextResponse.json({ error: "That payment belongs to a different order." }, { status: 400 });
  }

  if (!paymentCovers(payment, plan, cycle)) {
    return NextResponse.json({ error: "That payment has not been captured for this plan." }, { status: 400 });
  }

  const credited = await creditPayment({
    userId: user.id,
    paymentId,
    plan,
    cycle,
    orderId,
    // Razorpay's own figure for what was captured, not the one this request asked for — the ledger
    // records what was actually taken.
    amountPaise: typeof payment.amount === "number" ? payment.amount : null,
    promoCode: typeof body?.promoCode === "string" ? body.promoCode : null,
    referralCode: typeof body?.referralCode === "string" ? body.referralCode : null,
  });
  if (!credited.ok) {
    return NextResponse.json({ error: credited.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    plan,
    cycle,
    paymentId,
    subscribedUntil: credited.subscribedUntil,
    alreadyCredited: credited.alreadyCredited,
    status: await getAccessStatus(credited.user),
  });
}
