"use client";

import { useState } from "react";
import { featuresForTier, PLAN_TIERS, starsFor, TIER_LABEL, type PlanTier } from "../lib/plan-tiers";
import { SubscribeButton, type PlanKey } from "./razorpay-checkout";

/**
 * Pricing, benchmarked against what Indian retail research actually costs.
 *
 * The old ladder quoted two plans monthly and the third yearly, which made them impossible to
 * compare — the "₹4999" plan looked like the dearest and was in fact the cheapest. Every plan is
 * now quoted on the same billing cycle and the cycle is a switch, so the comparison is like for
 * like whichever way the reader is thinking about it.
 */

export type Billing = "monthly" | "yearly";

// Three months free on an annual commitment, and the reason the yearly figure is derived rather
// than typed — the saving can never drift from the price it is quoted against.
const YEARLY_MONTHS = 9;

export type Plan = {
  /** The key the payment server prices this plan by — the two must never drift apart. */
  key: PlanKey;
  name: string;
  /** Rupees per month when billed monthly. */
  monthly: number;
  blurb: string;
  featured?: boolean;
  chrome: string;
  accent: string;
  button: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    monthly: 149,
    blurb: "For someone tracking a handful of holdings.",
    chrome: "border-sky-200 bg-sky-50/80 dark:border-sky-500/30 dark:bg-sky-500/10",
    accent: "text-sky-700 dark:text-sky-300",
    button: "bg-sky-600 hover:bg-sky-500",
    features: [
      "Every exchange board, unlimited",
      "AI verdicts on 5 stocks a day",
      "Market pulse and sector rotation",
      "Dividend and IPO calendars",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 399,
    blurb: "For an active investor running their own screens.",
    featured: true,
    chrome: "border-emerald-300 bg-emerald-50/90 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    accent: "text-emerald-700 dark:text-emerald-300",
    button: "bg-emerald-600 hover:bg-emerald-500",
    features: [
      "Everything in Starter",
      "Unlimited AI verdicts and research",
      "All four screeners, every session",
      "Two- and three-stock AI comparisons",
      "Filings digest with sentiment",
    ],
  },
  {
    key: "elite",
    name: "Elite",
    monthly: 899,
    blurb: "For anyone managing money across many positions.",
    chrome: "border-violet-200 bg-violet-50/80 dark:border-violet-500/30 dark:bg-violet-500/10",
    accent: "text-violet-700 dark:text-violet-300",
    button: "bg-violet-600 hover:bg-violet-500",
    features: [
      "Everything in Pro",
      "Full 4,900-name BSE directory exports",
      "Priority AI queue at the open",
      "Portfolio and watchlist workspaces",
      "Direct line to the desk",
    ],
  },
];

export function yearlyPrice(monthly: number): number {
  return monthly * YEARLY_MONTHS;
}

/** What the annual cycle saves against paying month to month, in whole rupees. */
export function yearlySaving(monthly: number): number {
  return monthly * 12 - yearlyPrice(monthly);
}

export function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

const BILLING_OPTIONS: { key: Billing; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const FEATURE_CARD_TONE: Record<PlanTier, { card: string; pill: string; line: string }> = {
  starter: {
    card: "border-sky-200 bg-sky-50/85 dark:border-sky-500/30 dark:bg-sky-500/10",
    pill: "border-sky-200 bg-white text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    line: "border-sky-200/80 dark:border-sky-500/20",
  },
  pro: {
    card: "border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    pill: "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    line: "border-emerald-200/80 dark:border-emerald-500/20",
  },
  elite: {
    card: "border-violet-200 bg-violet-50/85 dark:border-violet-500/30 dark:bg-violet-500/10",
    pill: "border-violet-200 bg-white text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    line: "border-violet-200/80 dark:border-violet-500/20",
  },
};

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="m10 1.6 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L10 1.6Z" />
    </svg>
  );
}

function StarRankBadge({ stars }: { stars: number }) {
  if (stars === 0) return null;
  return (
    <span
      aria-label={`${stars} star Rank ${4 - stars}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: stars }, (_, index) => (
          <StarIcon key={index} className="h-3 w-3" />
        ))}
      </span>
      <span>Rank {4 - stars}</span>
    </span>
  );
}

export function PlanFeatureCards({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-labelledby="plan-ai-features"
      className={`${compact ? "rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-900" : "mt-8"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">Plan access</p>
          <h3 id="plan-ai-features" className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
            AI features by plan
          </h3>
        </div>
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Each card shows the AI tools included in that plan. The starred ribbons mark the top three AI features on the landing page.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const tone = FEATURE_CARD_TONE[tier];
          const features = featuresForTier(tier);
          return (
            <article key={tier} className={`rounded-3xl border p-5 ${tone.card}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone.pill}`}>
                  {TIER_LABEL[tier]}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{features.length} AI features</span>
              </div>
              <ul className="mt-4 divide-y text-sm text-slate-700 dark:text-slate-300">
                {features.map((feature) => {
                  const stars = starsFor(tier, feature.key);
                  return (
                    <li key={feature.key} className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${tone.line}`}>
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{feature.label}</span>
                          <StarRankBadge stars={stars} />
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{feature.blurb}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function PricingPlans() {
  const [billing, setBilling] = useState<Billing>("yearly");

  return (
    <section
      id="pricing"
      className="scroll-mt-28 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Pricing</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Flexible plans for every investor</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Priced for the Indian market and quoted per month on both cycles, so the only thing that changes when you
            switch is what you pay — not what you are comparing.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950/60">
          {BILLING_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setBilling(option.key)}
              aria-pressed={billing === option.key}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                billing === option.key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {option.label}
              {option.key === "yearly" && (
                <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  3 months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const yearly = yearlyPrice(plan.monthly);
          // Both cycles are quoted per month. A yearly plan billed at ten months' cost still
          // works out at 10/12 of the monthly rate, and that is the number worth comparing.
          const perMonth = billing === "yearly" ? Math.round(yearly / 12) : plan.monthly;

          return (
            <div
              key={plan.name}
              className={`relative rounded-3xl border p-6 transition-colors ${plan.chrome} ${
                plan.featured ? "shadow-[0_20px_40px_-25px_rgba(5,150,105,0.5)]" : ""
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 right-6 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}

              <p className="text-xl font-semibold text-slate-900 dark:text-white">{plan.name}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{plan.blurb}</p>

              <div className="mt-4 flex items-end gap-2">
                <span className={`text-4xl font-semibold tabular-nums ${plan.accent}`}>{rupees(perMonth)}</span>
                <span className="pb-1 text-slate-500 dark:text-slate-400">/month</span>
              </div>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {billing === "yearly" ? (
                  <>
                    <span className="tabular-nums">{rupees(yearly)}</span> billed yearly · saves{" "}
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {rupees(yearlySaving(plan.monthly))}
                    </span>
                  </>
                ) : (
                  <>
                    Billed monthly · <span className="tabular-nums">{rupees(yearly)}</span> a year on the annual cycle
                  </>
                )}
              </p>

              <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className={plan.accent}>
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Signed in, this opens Razorpay for the cycle currently on screen; signed out it is
                  still the sign-up link it always was, because a subscription needs an account to
                  attach itself to. */}
              <div className="mt-6">
                <SubscribeButton
                  plan={plan.key}
                  cycle={billing}
                  label={`Choose ${plan.name}`}
                  className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white transition ${plan.button}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <PlanFeatureCards />

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Payments are taken by Razorpay — cards, UPI and netbanking — and settle to Stockers.AI&apos;s own bank account.
        Prices in Indian rupees, inclusive of GST. Exchange data is the same on every plan — what a plan buys is the AI
        layer on top of it. Cancel any time; annual plans are refunded pro rata.
      </p>
    </section>
  );
}
