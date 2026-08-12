"use client";

import Link from "next/link";
import { useState } from "react";
import { CHECKOUT_BRAND_NAME, CHECKOUT_LOGO_URL, CHECKOUT_WEBSITE_URL } from "../lib/checkout-brand";
import {
  billingSummary,
  PLAN_LABEL,
  type BillingCycle,
  type PlanKey,
} from "../lib/subscription-pricing";
import { authHeaders, useSubscription } from "./subscription-provider";

/**
 * The subscribe button, and the Razorpay checkout behind it.
 *
 * The money never touches this app: Razorpay's own hosted checkout collects the card, UPI or
 * netbanking details in its own iframe, and this only ever sees an order id and a signed result.
 * That is the point of using it — the site's PCI surface is a script tag.
 *
 * The flow, and why each step exists:
 *
 *   1. ask our server to open an order. The amount comes from the server's price table, so a
 *      browser cannot name its own price;
 *   2. hand the order to Razorpay's checkout and let it take the payment;
 *   3. post what checkout hands back to our server, which verifies the signature against the key
 *      secret and re-fetches the payment from Razorpay before granting a single day.
 *
 * Step 3 is a convenience, not the source of truth. If the browser is closed between paying and
 * reporting back, Razorpay's webhook credits the subscription anyway.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export type { BillingCycle, PlanKey } from "../lib/subscription-pricing";
export type PendingSubscription = { plan: PlanKey; cycle: BillingCycle; promoCode?: string; referralCode?: string };

const PENDING_SUBSCRIPTION_KEY = "stockers-pending-subscription";

export type OrderResponse = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: PlanKey;
  cycle: BillingCycle;
  name: string;
  email: string;
  brandName?: string;
  websiteUrl?: string;
  logoUrl?: string;
  amountRupees?: number;
  baseAmountRupees?: number;
  discountRupees?: number;
  discountPercent?: number;
  discountLabel?: string | null;
  appliedCode?: string | null;
  appliedKind?: "promo" | "referral" | null;
  monthlyEquivalentRupees?: number;
  billingSummary?: string;
};

type CheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = { open: () => void };

type RazorpayWindow = Window & {
  Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
};

/**
 * Loads Razorpay's checkout script, once.
 *
 * It is fetched on the first click rather than on every page load: a visitor reading the pricing
 * table has not asked to talk to a payment gateway yet, and a third-party script on every render is
 * a cost — and a tracking surface — nobody agreed to.
 */
export function loadCheckoutScript(): Promise<boolean> {
  const target = window as RazorpayWindow;
  if (target.Razorpay) return Promise.resolve(true);

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(Boolean(target.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(target.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function subscriptionSignupHref(plan: PlanKey, cycle: BillingCycle, promoCode = "", referralCode = ""): string {
  const params = new URLSearchParams({ subscribe: "1", plan, cycle });
  if (promoCode.trim()) params.set("promo", promoCode.trim());
  if (referralCode.trim()) params.set("ref", referralCode.trim());
  return `/signup?${params.toString()}`;
}

export function savePendingSubscription(plan: PlanKey, cycle: BillingCycle, promoCode = "", referralCode = "") {
  try {
    window.localStorage.setItem(PENDING_SUBSCRIPTION_KEY, JSON.stringify({ plan, cycle, promoCode, referralCode }));
  } catch {}
}

export function readPendingSubscription(): PendingSubscription | null {
  try {
    const raw = window.localStorage.getItem(PENDING_SUBSCRIPTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSubscription>;
    const plan = parsed.plan;
    const cycle = parsed.cycle;
    return (plan === "starter" || plan === "pro" || plan === "elite") && (cycle === "monthly" || cycle === "yearly")
      ? {
          plan,
          cycle,
          promoCode: typeof parsed.promoCode === "string" ? parsed.promoCode : "",
          referralCode: typeof parsed.referralCode === "string" ? parsed.referralCode : "",
        }
      : null;
  } catch {
    return null;
  }
}

export function clearPendingSubscription() {
  try {
    window.localStorage.removeItem(PENDING_SUBSCRIPTION_KEY);
  } catch {}
}

/** What Razorpay's checkout is opened with. Pure, so the wiring can be checked without a gateway. */
export function checkoutOptions(
  order: OrderResponse,
  handlers: { onSuccess: (result: CheckoutResult) => void; onDismiss: () => void },
): Record<string, unknown> {
  const brandName = order.brandName ?? CHECKOUT_BRAND_NAME;
  const websiteUrl = order.websiteUrl ?? CHECKOUT_WEBSITE_URL;
  const summary = order.billingSummary ?? billingSummary(order.plan, order.cycle);
  const discount = order.discountLabel && order.discountRupees ? ` after ${order.discountLabel}` : "";

  return {
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: brandName,
    image: order.logoUrl ?? CHECKOUT_LOGO_URL,
    description: `${PLAN_LABEL[order.plan]} plan - ${summary}${discount}`,
    order_id: order.orderId,
    prefill: { name: order.name, email: order.email },
    notes: {
      plan: order.plan,
      cycle: order.cycle,
      brand: brandName,
      website: websiteUrl,
      product: "StockersAI subscription",
      discountCode: order.appliedCode ?? "",
      discountKind: order.appliedKind ?? "",
    },
    theme: { color: "#059669" },
    handler: handlers.onSuccess,
    modal: { ondismiss: handlers.onDismiss },
  };
}

type Phase = "idle" | "opening" | "verifying" | "done";

export function SubscribeButton({
  plan,
  cycle,
  label,
  className = "",
  promoCode = "",
  referralCode = "",
}: {
  plan: PlanKey;
  cycle: BillingCycle;
  label: string;
  className?: string;
  promoCode?: string;
  referralCode?: string;
}) {
  const { status, refresh } = useSubscription();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Signed-out visitors are sent to sign up rather than into a checkout that would 401: an account
  // has to exist before a subscription can be attached to it.
  if (status && !status.signedIn) {
    return (
      <Link
        href={subscriptionSignupHref(plan, cycle, promoCode, referralCode)}
        onClick={() => savePendingSubscription(plan, cycle, promoCode, referralCode)}
        className={className}
      >
        {label}
      </Link>
    );
  }

  const pay = async () => {
    setError(null);
    setPhase("opening");

    try {
      const created = await fetch("/api/payments/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ plan, cycle, promoCode, referralCode }),
      });

      const order = (await created.json()) as OrderResponse & { error?: string };
      if (!created.ok) throw new Error(order?.error || "Couldn't start the payment.");

      const ready = await loadCheckoutScript();
      const target = window as RazorpayWindow;
      if (!ready || !target.Razorpay) throw new Error("Couldn't load the payment window. Check your connection.");

      const checkout = new target.Razorpay(
        checkoutOptions(order, {
          onSuccess: async (result) => {
            setPhase("verifying");
            try {
              const confirmed = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ ...result, plan, cycle, promoCode, referralCode }),
              });

              const payload = await confirmed.json();
              if (!confirmed.ok) throw new Error(payload?.error || "We couldn't confirm that payment.");

              setPhase("done");
              await refresh();
            } catch (failure) {
              // The money may well have left: say so plainly rather than implying it did not, and
              // point at the receipt, because the webhook will credit it either way.
              setPhase("idle");
              setError(
                `${(failure as Error).message} If your account was debited, the payment is still recorded — refresh in a minute.`,
              );
            }
          },
          // Closing the window is not a failure, it is a decision. Back to the button, no message.
          onDismiss: () => setPhase("idle"),
        }),
      );

      checkout.open();
    } catch (failure) {
      setPhase("idle");
      setError((failure as Error).message);
    }
  };

  if (phase === "done") {
    return (
      <p className="rounded-full bg-emerald-100 px-4 py-2 text-center text-sm font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
        Subscribed — thank you
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={pay} disabled={phase !== "idle"} className={`${className} disabled:opacity-60`}>
        {phase === "opening" ? "Opening checkout…" : phase === "verifying" ? "Confirming…" : label}
      </button>
      {error && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
