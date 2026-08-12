import { NextResponse } from "next/server";
import { creditPayment } from "../../../../lib/razorpay-credit";
import { isBillingCycle, isPlanKey, paymentCovers, verifyWebhookSignature, type RazorpayPayment } from "../../../../lib/razorpay";

export const dynamic = "force-dynamic";

/**
 * Razorpay's own account of what happened.
 *
 * This is the authoritative path, not the convenient one. A browser can close, lose its network or
 * be shut before the confirmation call goes out; the webhook fires regardless, so a payment that
 * left the customer's bank always ends up crediting their subscription.
 *
 * The body is read as raw text and its signature checked *before* it is parsed, because the
 * signature is over the exact bytes Razorpay sent. Set the same secret here and in the dashboard
 * (Settings → Webhooks) as RAZORPAY_WEBHOOK_SECRET, and subscribe the endpoint to `payment.captured`.
 *
 * Failures answer 200 wherever the event is simply not ours to act on: a non-2xx tells Razorpay to
 * retry, and there is nothing to retry when an event is about something else entirely.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Unreadable payload." }, { status: 400 });
  }

  if (event.event !== "payment.captured") {
    return NextResponse.json({ ignored: event.event ?? null });
  }

  const payment = event.payload?.payment?.entity;
  const notes = payment?.notes ?? {};
  const plan = notes.plan;
  const cycle = notes.cycle;

  // The notes were written by this app when the order was opened. An event without them is a
  // payment taken through some other flow, and this endpoint has no business crediting it.
  if (!payment?.id || !notes.userId || !isPlanKey(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json({ ignored: "payment carries no subscription notes" });
  }

  if (!paymentCovers(payment, plan, cycle)) {
    return NextResponse.json({ ignored: "payment does not cover subscription amount" });
  }

  const credited = await creditPayment({ userId: notes.userId, paymentId: payment.id, plan, cycle });
  if (!credited.ok) {
    // The signature was good and the event was ours, so this is our problem to fix — a 500 has
    // Razorpay retry it, which is what we want while, say, the user store is briefly unwritable.
    return NextResponse.json({ error: credited.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, credited: !credited.alreadyCredited });
}
