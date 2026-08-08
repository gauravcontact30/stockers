// Taking money, through Razorpay.
//
// Two things about this file are worth knowing before reading it.
//
// Where the money lands is not decided here. Razorpay settles into whichever bank account is
// verified on the Razorpay account itself — that is set once, in the Razorpay dashboard under
// Account & Settings → Banking details, and it is what KYC is run against. No bank account number
// belongs in this repository or in an environment variable, and none is written here: a settlement
// account that could be changed by editing code would be a fraud waiting to happen.
//
// And nothing the browser says about a payment is believed. The browser hands back three fields
// after checkout; the signature over them is verified with the key secret, and then the payment is
// re-fetched from Razorpay to confirm it was really captured and really for the amount the plan
// costs. A caller who forges a success callback gets nothing.
//
// Required environment:
//   RAZORPAY_KEY_ID          the public key id, also sent to the browser
//   RAZORPAY_KEY_SECRET      the secret — server only, never sent anywhere
//   RAZORPAY_WEBHOOK_SECRET  the secret configured on the webhook in the dashboard
//
// Without them every entry point here reports "not configured" and the app carries on with its
// existing unpaid renewal flow, so a checkout misconfiguration cannot take the site down.

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export type BillingCycle = "monthly" | "yearly";

export type PlanKey = "starter" | "pro" | "elite";

/**
 * What each plan costs, in rupees a month, and what the annual cycle multiplies that by.
 *
 * These are the same figures the pricing table renders — a test asserts the two agree, because a
 * price that differs between the page and the charge is the worst bug this file could have.
 */
export const PLAN_MONTHLY: Record<PlanKey, number> = {
  starter: 299,
  pro: 799,
  elite: 1999,
};

/** Ten months for twelve on the annual cycle, matching the pricing page's own arithmetic. */
export const YEARLY_MONTHS = 10;

export const PLAN_NAMES: Record<PlanKey, string> = { starter: "Starter", pro: "Pro", elite: "Elite" };

/** How long each cycle buys, in calendar days. */
export const CYCLE_DAYS: Record<BillingCycle, number> = { monthly: 30, yearly: 365 };

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "starter" || value === "pro" || value === "elite";
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/** What a plan and cycle costs, in whole rupees. */
export function priceFor(plan: PlanKey, cycle: BillingCycle): number {
  return cycle === "yearly" ? PLAN_MONTHLY[plan] * YEARLY_MONTHS : PLAN_MONTHLY[plan];
}

/** Razorpay works in the smallest currency unit, so every amount crosses the wire in paise. */
export function amountInPaise(plan: PlanKey, cycle: BillingCycle): number {
  return priceFor(plan, cycle) * 100;
}

export type RazorpayKeys = { keyId: string; keySecret: string };

/** The API credentials, or null when the environment has none — which is not an error. */
export function razorpayKeys(): RazorpayKeys | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export function razorpayConfigured(): boolean {
  return razorpayKeys() !== null;
}

function authHeader({ keyId, keySecret }: RazorpayKeys): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

export type OrderRequest = {
  plan: PlanKey;
  cycle: BillingCycle;
  userId: string;
  email: string;
};

/**
 * Opens an order for one subscription period.
 *
 * The amount is computed here from the plan, never taken from the browser: a checkout that let the
 * client name its own price would be exactly the hole it sounds like. The user and plan travel in
 * `notes`, so the webhook can tell whose subscription a payment belongs to even if the browser
 * closes before it reports back.
 */
export async function createOrder(request: OrderRequest): Promise<RazorpayOrder | null> {
  const keys = razorpayKeys();
  if (!keys) return null;

  try {
    const response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: authHeader(keys), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountInPaise(request.plan, request.cycle),
        currency: "INR",
        // Razorpay caps receipts at 40 characters, and a user id plus a timestamp fits.
        receipt: `sub_${request.userId}_${Date.now().toString(36)}`.slice(0, 40),
        notes: {
          userId: request.userId,
          email: request.email,
          plan: request.plan,
          cycle: request.cycle,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Razorpay responded with ${response.status}`);

    const payload = (await response.json()) as RazorpayOrder;
    return payload?.id ? payload : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type RazorpayPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  method?: string;
  email?: string;
  notes?: Record<string, string>;
};

/** One payment as Razorpay itself has it — the only version of it this app trusts. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment | null> {
  const keys = razorpayKeys();
  if (!keys) return null;

  try {
    const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: authHeader(keys) },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Razorpay responded with ${response.status}`);

    const payload = (await response.json()) as RazorpayPayment;
    return payload?.id ? payload : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/** Constant-time comparison, so a signature can't be discovered a byte at a time. */
function sameSignature(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(provided, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Whether a checkout callback really came from Razorpay.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. This is what separates "the browser
 * says the payment worked" from "the payment worked".
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keys = razorpayKeys();
  if (!keys || !input.orderId || !input.paymentId || !input.signature) return false;

  const expected = createHmac("sha256", keys.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  return sameSignature(expected, input.signature);
}

/**
 * Whether a webhook body really came from Razorpay.
 *
 * Signed over the raw request body with the webhook secret, which is a different secret from the
 * API key — so the body must be read as text and verified before it is parsed as JSON.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameSignature(expected, signature);
}

/**
 * Whether a captured payment actually pays for the plan it claims to.
 *
 * Status and amount are both checked against Razorpay's own record: a real payment for ₹299
 * cannot be redeemed as a year of Elite.
 */
export function paymentCovers(payment: RazorpayPayment, plan: PlanKey, cycle: BillingCycle): boolean {
  return (
    payment.status === "captured" &&
    payment.currency === "INR" &&
    payment.amount >= amountInPaise(plan, cycle)
  );
}
