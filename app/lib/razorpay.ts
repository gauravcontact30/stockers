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

// Reads RAZORPAY_KEY_SECRET. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { discountedAmount, discountFromPaymentNotes, type AppliedDiscount } from "./checkout-discounts";
import type { PlanName } from "./auth-validation";
import { CHECKOUT_BRAND_NAME, CHECKOUT_WEBSITE_URL } from "./checkout-brand";
import {
  billedAmount,
  isBillingCycle,
  isPlanKey,
  PLAN_MONTHLY,
  YEARLY_MONTHS,
  type BillingCycle,
  type PlanKey,
} from "./subscription-pricing";

const API = "https://api.razorpay.com/v1";

export { isBillingCycle, isPlanKey, PLAN_MONTHLY, YEARLY_MONTHS };
export type { BillingCycle, PlanKey };

/**
 * What each plan costs, in rupees a month, and what the annual cycle multiplies that by.
 *
 * These are the same figures the pricing table renders — a test asserts the two agree, because a
 * price that differs between the page and the charge is the worst bug this file could have.
 */
/**
 * Typed as PlanName rather than string because this is what gets written to the account record,
 * and that record is what every feature tier is then resolved against.
 */
export const PLAN_NAMES: Record<PlanKey, PlanName> = { starter: "Starter", pro: "Pro", elite: "Elite" };

/** How long each cycle buys, in calendar days. */
export const CYCLE_DAYS: Record<BillingCycle, number> = { monthly: 30, yearly: 365 };

/** What a plan and cycle costs, in whole rupees. */
export function priceFor(plan: PlanKey, cycle: BillingCycle, discount?: AppliedDiscount | null): number {
  return discountedAmount(billedAmount(plan, cycle), discount?.percent ?? 0);
}

/** Razorpay works in the smallest currency unit, so every amount crosses the wire in paise. */
export function amountInPaise(plan: PlanKey, cycle: BillingCycle, discount?: AppliedDiscount | null): number {
  return priceFor(plan, cycle, discount) * 100;
}

export type RazorpayKeys = { keyId: string; keySecret: string };

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/**
 * The API credentials, or null when the environment has none — which is not an error.
 *
 * `NEXT_PUBLIC_RAZORPAY_KEY_ID` is accepted as an alias for the key id because that is the name
 * Razorpay's own guides use and the one an operator reaches for first. It is a genuine alias and
 * not a second key: the id is public by design — the browser needs it to open checkout, and this
 * app already sends it down in the order response. Only the *secret* must stay server-side, and it
 * has no public alias for exactly that reason.
 *
 * Silently reading only the unprefixed name meant a correctly-supplied key id was invisible to the
 * server and checkout reported itself unconfigured, which is a confusing way to fail.
 */
export function razorpayKeys(): RazorpayKeys | null {
  const keyId = env("STOCKERS_RAZORPAY_KEY_ID") || env("RAZORPAY_KEY_ID") || env("NEXT_PUBLIC_RAZORPAY_KEY_ID");
  const keySecret = env("STOCKERS_RAZORPAY_KEY_SECRET") || env("RAZORPAY_KEY_SECRET");
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

export type RazorpayGatewayFailure = {
  ok: false;
  status?: number;
  error: string;
};

export type RazorpayGatewaySuccess<T> = {
  ok: true;
  value: T;
};

export type RazorpayGatewayResult<T> = RazorpayGatewaySuccess<T> | RazorpayGatewayFailure;

export type OrderRequest = {
  plan: PlanKey;
  cycle: BillingCycle;
  userId: string;
  email: string;
  discount?: AppliedDiscount | null;
  promoCode?: string;
  referralCode?: string;
};

function messageForStatus(status: number): string {
  if (status === 401) {
    return "Razorpay rejected the API key or secret. Check that both values are from the same Razorpay account and mode.";
  }
  if (status === 400) return "Razorpay rejected the order details.";
  if (status === 429) return "Razorpay is rate limiting order creation. Please try again shortly.";
  if (status >= 500) return "Razorpay is temporarily unavailable. Please try again shortly.";
  return "Razorpay refused the order request.";
}

async function gatewayFailure(response: Response): Promise<RazorpayGatewayFailure> {
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { description?: unknown; reason?: unknown; code?: unknown } };
    const description = payload?.error?.description;
    const reason = payload?.error?.reason;
    const code = payload?.error?.code;
    detail = [description, reason, code].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" ");
  } catch {
    detail = "";
  }

  const base = messageForStatus(response.status);
  return { ok: false, status: response.status, error: detail ? `${base} ${detail}` : base };
}

/**
 * Opens an order for one subscription period.
 *
 * The amount is computed here from the plan, never taken from the browser: a checkout that let the
 * client name its own price would be exactly the hole it sounds like. The user and plan travel in
 * `notes`, so the webhook can tell whose subscription a payment belongs to even if the browser
 * closes before it reports back.
 */
export async function createOrder(request: OrderRequest): Promise<RazorpayGatewayResult<RazorpayOrder>> {
  const keys = razorpayKeys();
  if (!keys) {
    return { ok: false, error: "Razorpay API key id and secret are not configured." };
  }
  const baseAmountRupees = billedAmount(request.plan, request.cycle);
  const finalAmountRupees = priceFor(request.plan, request.cycle, request.discount);

  try {
    const response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: authHeader(keys), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: finalAmountRupees * 100,
        currency: "INR",
        // Razorpay caps receipts at 40 characters, and a user id plus a timestamp fits.
        receipt: `sub_${request.userId}_${Date.now().toString(36)}`.slice(0, 40),
        notes: {
          userId: request.userId,
          email: request.email,
          plan: request.plan,
          cycle: request.cycle,
          baseAmountRupees: String(baseAmountRupees),
          finalAmountRupees: String(finalAmountRupees),
          discountKind: request.discount?.kind ?? "",
          discountCode: request.discount?.code ?? "",
          discountPercent: request.discount ? String(request.discount.percent) : "0",
          promoCode: request.promoCode ?? "",
          referralCode: request.referralCode ?? "",
          brand: CHECKOUT_BRAND_NAME,
          website: CHECKOUT_WEBSITE_URL,
          product: "StockersAI subscription",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return gatewayFailure(response);

    const payload = (await response.json()) as RazorpayOrder;
    return payload?.id ? { ok: true, value: payload } : { ok: false, error: "Razorpay returned an unreadable order." };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Couldn't reach Razorpay while creating the order." };
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
  const secret = env("STOCKERS_RAZORPAY_WEBHOOK_SECRET") || env("RAZORPAY_WEBHOOK_SECRET");
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
  const discount = discountFromPaymentNotes(payment.notes);
  return (
    payment.status === "captured" &&
    payment.currency === "INR" &&
    payment.amount >= amountInPaise(plan, cycle, discount)
  );
}
