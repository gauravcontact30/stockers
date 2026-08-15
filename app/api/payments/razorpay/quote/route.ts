import { NextResponse } from "next/server";
import { subscriptionQuote } from "../../../../lib/checkout-discounts";
import { isBillingCycle, isPlanKey } from "../../../../lib/razorpay";
import { userFromRequest } from "../../../../lib/store";
import { billingSummary, monthlyEquivalent } from "../../../../lib/subscription-pricing";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const plan = body?.plan;
  const cycle = body?.cycle;

  if (!isPlanKey(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json({ error: "Choose a plan and a billing cycle." }, { status: 400 });
  }

  const user = await userFromRequest(request);
  const quote = await subscriptionQuote({
    plan,
    cycle,
    promoCode: body?.promoCode,
    referralCode: body?.referralCode,
    currentUserId: user?.id,
  });

  return NextResponse.json({
    ...quote,
    amount: quote.amountRupees * 100,
    monthlyEquivalentRupees: monthlyEquivalent(plan, cycle),
    billingSummary: billingSummary(plan, cycle),
  });
}
