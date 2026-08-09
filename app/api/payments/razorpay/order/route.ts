import { NextResponse } from "next/server";
import { CHECKOUT_BRAND_NAME, CHECKOUT_LOGO_URL, CHECKOUT_WEBSITE_URL } from "../../../../lib/checkout-brand";
import { userFromRequest } from "../../../../lib/store";
import {
  amountInPaise,
  createOrder,
  isBillingCycle,
  isPlanKey,
  razorpayKeys,
} from "../../../../lib/razorpay";
import { billedAmount, billingSummary, monthlyEquivalent } from "../../../../lib/subscription-pricing";

export const dynamic = "force-dynamic";

/**
 * Opens a Razorpay order for one subscription period.
 *
 * The caller names a plan and a cycle; the price comes from the server's own table. Everything the
 * browser needs to open checkout is returned — including the *public* key id, which is meant to be
 * public. The secret never leaves this process.
 */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Please sign in before subscribing." }, { status: 401 });
  }

  const keys = razorpayKeys();
  if (!keys) {
    return NextResponse.json(
      { error: "Card payments aren't switched on yet. Please try again shortly.", configured: false },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const plan = body?.plan;
  const cycle = body?.cycle;

  if (!isPlanKey(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json({ error: "Choose a plan and a billing cycle." }, { status: 400 });
  }

  const order = await createOrder({ plan, cycle, userId: user.id, email: user.email });
  if (!order.ok) {
    return NextResponse.json(
      {
        error: order.error,
        gatewayStatus: order.status ?? null,
        configured: true,
      },
      { status: order.status === 401 ? 503 : 502 },
    );
  }

  return NextResponse.json({
    orderId: order.value.id,
    amount: order.value.amount || amountInPaise(plan, cycle),
    currency: order.value.currency || "INR",
    keyId: keys.keyId,
    plan,
    cycle,
    amountRupees: billedAmount(plan, cycle),
    monthlyEquivalentRupees: monthlyEquivalent(plan, cycle),
    billingSummary: billingSummary(plan, cycle),
    name: user.name,
    email: user.email,
    brandName: CHECKOUT_BRAND_NAME,
    websiteUrl: CHECKOUT_WEBSITE_URL,
    logoUrl: CHECKOUT_LOGO_URL,
  });
}
