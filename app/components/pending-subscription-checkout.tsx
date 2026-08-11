"use client";

import { useEffect, useState } from "react";
import { billedAmount, monthlyEquivalent, rupees } from "../lib/subscription-pricing";
import { PLANS, type Billing } from "./pricing-plans";
import {
  clearPendingSubscription,
  readPendingSubscription,
  savePendingSubscription,
  SubscribeButton,
  type PendingSubscription,
  type PlanKey,
} from "./razorpay-checkout";
import { useSubscription } from "./subscription-provider";

function intentFromLocation(): PendingSubscription | null {
  /* istanbul ignore next -- the server pass of this client component has no window; jsdom always
     does, so the guard is real but cannot be reached from a test. */
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");
  const cycle = params.get("cycle");
  return params.get("subscribe") === "1" &&
    (plan === "starter" || plan === "pro" || plan === "elite") &&
    (cycle === "monthly" || cycle === "yearly")
    ? { plan, cycle }
    : null;
}

function initialIntent(): PendingSubscription | null {
  /* istanbul ignore next -- as above: unreachable under jsdom, load-bearing on the server pass. */
  if (typeof window === "undefined") return null;
  return intentFromLocation() ?? readPendingSubscription();
}

export function PendingSubscriptionCheckout() {
  const [intent, setIntent] = useState<PendingSubscription | null>(() => initialIntent());
  const { status, loading } = useSubscription();

  useEffect(() => {
    const fromUrl = intentFromLocation();
    if (fromUrl) savePendingSubscription(fromUrl.plan, fromUrl.cycle);
  }, []);

  if (!intent || loading || !status?.signedIn) return null;

  /* istanbul ignore next -- `intent.plan` is validated to one of the three keys before it is ever
     stored, and PLANS carries all three; the fallback exists only because `find` may return
     undefined as far as the type system knows. */
  const selected = PLANS.find((plan) => plan.key === intent.plan) ?? PLANS[1];
  const payable = billedAmount(selected.key, intent.cycle);
  const perMonth = monthlyEquivalent(selected.key, intent.cycle);

  const close = () => {
    clearPendingSubscription();
    setIntent(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  };

  const setCycle = (cycle: Billing) => {
    const next = { ...intent, cycle };
    savePendingSubscription(next.plan, next.cycle);
    setIntent(next);
  };

  const setPlan = (plan: PlanKey) => {
    const next = { ...intent, plan };
    savePendingSubscription(next.plan, next.cycle);
    setIntent(next);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-emerald-200 bg-white p-4 shadow-[0_28px_90px_-34px_rgba(15,23,42,0.65)] dark:border-emerald-500/30 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">
              Complete subscription
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {selected.name} plan ready for checkout
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {rupees(payable)} payable now, {rupees(perMonth)}/month effective on {intent.cycle} billing.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={intent.plan}
              onChange={(event) => setPlan(event.target.value as PlanKey)}
              className="h-10 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              aria-label="Subscription plan"
            >
              {PLANS.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </select>
            <select
              value={intent.cycle}
              onChange={(event) => setCycle(event.target.value as Billing)}
              className="h-10 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              aria-label="Billing cycle"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <SubscribeButton
              plan={intent.plan}
              cycle={intent.cycle}
              label="Pay now"
              className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            />
            <button
              type="button"
              onClick={close}
              className="h-10 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
