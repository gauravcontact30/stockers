"use client";

import { useState } from "react";
import {
  billedAmount,
  monthlyEquivalent,
  PLAN_MONTHLY,
  rupees,
  YEARLY_MONTHS,
  yearlySaving as yearlySavingForPlan,
  type BillingCycle,
  type PlanKey,
} from "../lib/subscription-pricing";
import { featuresIntroducedAtTier, PLAN_TIERS, starsFor, TIER_LABEL, type PlanTier } from "../lib/plan-tiers";
import { SubscribeButton } from "./razorpay-checkout";

/**
 * Pricing, benchmarked against what Indian retail research actually costs.
 *
 * The old ladder quoted two plans monthly and the third yearly, which made them impossible to
 * compare — the "₹4999" plan looked like the dearest and was in fact the cheapest. Every plan is
 * now quoted on the same billing cycle and the cycle is a switch, so the comparison is like for
 * like whichever way the reader is thinking about it.
 */

export type Billing = BillingCycle;

export { rupees } from "../lib/subscription-pricing";

// Three months free on an annual commitment, and the reason the yearly figure is derived rather
// than typed — the saving can never drift from the price it is quoted against.
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
    monthly: PLAN_MONTHLY.starter,
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
    monthly: PLAN_MONTHLY.pro,
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
    monthly: PLAN_MONTHLY.elite,
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

const BILLING_OPTIONS: { key: Billing; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const FEATURE_CARD_TONE: Record<PlanTier, { card: string; pill: string; line: string; dot: string; ribbon: string; count: string }> = {
  starter: {
    card: "border-sky-200 bg-sky-50/85 dark:border-sky-500/30 dark:bg-sky-500/10",
    pill: "border-sky-200 bg-white text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    line: "border-sky-200/80 dark:border-sky-500/20",
    dot: "bg-sky-500",
    ribbon: "border-sky-200 bg-gradient-to-r from-white via-sky-50 to-sky-100 text-sky-900 dark:border-sky-500/30 dark:from-sky-950/80 dark:via-sky-950/60 dark:to-sky-900/50 dark:text-sky-100",
    count: "text-sky-700 dark:text-sky-300",
  },
  pro: {
    card: "border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    pill: "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    line: "border-emerald-200/80 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
    ribbon: "border-emerald-200 bg-gradient-to-r from-white via-emerald-50 to-emerald-100 text-emerald-900 dark:border-emerald-500/30 dark:from-emerald-950/80 dark:via-emerald-950/60 dark:to-emerald-900/50 dark:text-emerald-100",
    count: "text-emerald-700 dark:text-emerald-300",
  },
  elite: {
    card: "border-violet-200 bg-violet-50/85 dark:border-violet-500/30 dark:bg-violet-500/10",
    pill: "border-violet-200 bg-white text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    line: "border-violet-200/80 dark:border-violet-500/20",
    dot: "bg-violet-500",
    ribbon: "border-violet-200 bg-gradient-to-r from-white via-violet-50 to-violet-100 text-violet-900 dark:border-violet-500/30 dark:from-violet-950/80 dark:via-violet-950/60 dark:to-violet-900/50 dark:text-violet-100",
    count: "text-violet-700 dark:text-violet-300",
  },
};

const PLAN_INCLUDED_COPY: Record<PlanTier, string> = {
  starter: "Starter AI features",
  pro: "All Starter AI features included",
  elite: "All Starter + Pro AI features included.",
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

/**
 * The access matrix inside the pricing section: what each plan actually unlocks.
 *
 * This used to be a `<section>` of its own, with its own "Plan access" eyebrow and its own heading,
 * nested inside the pricing `<section>` — so the page carried two section headers stacked on top of
 * each other describing one subject. A reader met "Pricing / Flexible plans for every investor",
 * three priced cards, and then immediately a second titled block, which reads as a new topic rather
 * than as the rest of the one above it.
 *
 * It is one section now. Both halves are still here and neither lost anything: the prices answer
 * "what does it cost", these answer "what do I get", and they are two answers about the same three
 * tiers. What changed is that the eyebrow is gone and the heading is demoted to an `h4` behind a
 * rule — a hinge inside a section rather than the start of another one.
 *
 * The `compact` prop went with it. It existed to give this block its own card chrome when rendered
 * standalone, and nothing has ever rendered it standalone.
 */
function PlanFeatureCards() {
  return (
    <div aria-labelledby="plan-ai-features" className="mt-10">
      {/* The hinge. A rule with the heading sitting on it says "same subject, second part" in a way
          that a second eyebrow-and-title pair cannot. */}
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-6 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <h4 id="plan-ai-features" className="text-lg font-semibold text-slate-900 dark:text-white">
          AI access by tier
        </h4>
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400 sm:text-right">
          Pro includes every Starter AI tool. Elite includes every Starter and Pro AI tool, plus its own advanced features.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const tone = FEATURE_CARD_TONE[tier];
          const features = featuresIntroducedAtTier(tier);
          return (
            <article key={tier} className={`rounded-3xl border p-5 ${tone.card}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone.pill}`}>
                  {TIER_LABEL[tier]}
                </span>
                <div
                  aria-label={`${features.length} ${TIER_LABEL[tier]} AI features. ${PLAN_INCLUDED_COPY[tier]}`}
                  className={`relative overflow-hidden rounded-2xl border px-3 py-2 text-right shadow-sm ${tone.ribbon}`}
                >
                  <span aria-hidden="true" className={`absolute inset-y-0 right-0 w-1.5 ${tone.dot}`} />
                  <span className="block text-xs font-black uppercase tracking-wide">
                    <strong className={`mr-1 text-xl font-black leading-none tabular-nums ${tone.count}`}>{features.length}</strong>{" "}
                    {TIER_LABEL[tier]} AI features
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-slate-500 dark:text-slate-300">
                    {PLAN_INCLUDED_COPY[tier]}
                  </span>
                </div>
              </div>
              <ul className="mt-4 divide-y text-sm text-slate-700 dark:text-slate-300">
                {features.map((feature) => {
                  const stars = starsFor(tier, feature.key);
                  const featureTone = FEATURE_CARD_TONE[feature.tier];
                  return (
                    <li key={feature.key} className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${tone.line}`}>
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${featureTone.dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{feature.label}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${featureTone.pill}`}>
                            {TIER_LABEL[feature.tier]}
                          </span>
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
    </div>
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
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Plans, and what each one unlocks</h3>
          {/* Covers both halves of the section now — the prices and the access — because the
              "Plan access" header that used to introduce the second half is gone. */}
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Priced for the Indian market and quoted per month on both cycles, so the only thing that changes when you
            switch is what you pay — not what you are comparing. Every plan reads the same exchange data; what a plan
            buys is the AI layer over it, listed tier by tier below.
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
          const yearly = billedAmount(plan.key, "yearly");
          // Both cycles are quoted per month. A yearly plan billed at nine months' cost works out
          // at 9/12 of the monthly rate, and that is the number worth comparing.
          const perMonth = monthlyEquivalent(plan.key, billing);

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
                      {rupees(yearlySavingForPlan(plan.key))}
                    </span>
                  </>
                ) : (
                  <>
                    Billed monthly · <span className="tabular-nums">{rupees(yearly)}</span> a year on the annual cycle
                  </>
                )}
              </p>

              {/* The buying action comes before the long feature list. A visitor comparing cards
                  decides on fit from name, price, billing and headline promise first; the list
                  below is the validation, not the thing they should have to cross before acting. */}
              <div className="mt-6">
                <SubscribeButton
                  plan={plan.key}
                  cycle={billing}
                  label={`Choose ${plan.name}`}
                  className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white transition ${plan.button}`}
                />
              </div>

              <ul className="mt-5 space-y-2 border-t border-slate-200/70 pt-5 text-sm text-slate-700 dark:border-slate-700/60 dark:text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className={plan.accent}>
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

            </div>
          );
        })}
      </div>

      <PlanFeatureCards />

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Payments are taken by Razorpay — cards, UPI and netbanking — and settle to StockersAI&apos;s own bank account.
        Prices in Indian rupees, inclusive of GST. Exchange data is the same on every plan — what a plan buys is the AI
        layer on top of it. Cancel any time; annual plans are refunded pro rata.
      </p>
    </section>
  );
}
