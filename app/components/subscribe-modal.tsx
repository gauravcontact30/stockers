"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { billedAmount, monthlyEquivalent, rupees, yearlySaving, type BillingCycle } from "../lib/subscription-pricing";
import { FEATURE_BY_KEY, featureTier, isFeatureKey } from "../lib/plan-tiers";
import { PLANS } from "./pricing-plans";
import { AppleModal } from "./apple-modal";
import { SubscribeButton, type PlanKey } from "./razorpay-checkout";
import { authHeaders, useSubscription } from "./subscription-provider";

/**
 * Buying a plan from wherever the reader ran into the wall.
 *
 * The modal intentionally stays compact when opened from a locked feature: it starts on the plan
 * that unlocks the feature, but still lets the reader choose any plan they do not already hold.
 * The full plan comparison remains on the pricing section, while this dialog keeps the purchase
 * decision short and local.
 */

const cycles: { key: BillingCycle; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

type DiscountQuote = {
  amountRupees: number;
  baseAmountRupees: number;
  discountRupees: number;
  discountPercent: number;
  discountLabel: string | null;
  appliedCode: string | null;
  message: string | null;
};

function ModalDropdown<T extends string>({
  label,
  value,
  options,
  open,
  onOpenChange,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.key === value) ?? options[0];
  const listId = `${label.toLowerCase().replace(/\s+/g, "-")}-options`;

  return (
    <div className={`relative rounded-[18px] border border-slate-200 bg-white/85 p-2.5 dark:border-slate-800 dark:bg-slate-950/35 ${open ? "z-50" : "z-0"}`}>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        aria-label={label === "Plan" ? "Subscription plan" : "Billing cycle"}
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onOpenChange(false);
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
        className="mt-1.5 flex h-9 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-black text-slate-950 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.8)] outline-none transition hover:border-emerald-200 hover:bg-emerald-50/35 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:border-emerald-500/35 dark:focus:border-emerald-400 dark:focus:ring-emerald-500/15"
      >
        <span className="truncate">{selected?.label}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}>
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-2.5 right-2.5 top-[calc(100%-0.35rem)] z-[90] overflow-hidden rounded-xl border border-emerald-200 bg-white p-1 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.75)] ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-slate-950 dark:ring-emerald-500/15"
        >
          {options.map((option) => {
            const active = option.key === value;

            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.key);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm font-bold transition ${
                  active
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                }`}
              >
                <span>{option.label}</span>
                {active && <span className="text-xs text-emerald-600 dark:text-emerald-300">Selected</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SubscribeModal({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  /** The feature the reader was refused, when the modal was opened from a lock. */
  feature?: string;
}) {
  const { status, loading, canUse } = useSubscription();
  const [billing, setBilling] = useState<BillingCycle>("yearly");
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey>(() => featureTier(feature ?? "") ?? "pro");
  const [openDropdown, setOpenDropdown] = useState<"plan" | "billing" | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [quote, setQuote] = useState<DiscountQuote | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const required = feature ? featureTier(feature) : null;
  const featureLabel = feature && isFeatureKey(feature) ? FEATURE_BY_KEY[feature].label : "this feature";
  const heldPlan = status?.planName ?? null;
  const requiredPlanName = required ? PLANS.find((candidate) => candidate.key === required)?.name : null;
  const availablePlans = PLANS.filter((candidate) => candidate.name !== heldPlan);
  const planOptions = availablePlans.length > 0 ? availablePlans : PLANS;
  const plan = planOptions.find((candidate) => candidate.key === selectedPlanKey) ?? planOptions[0] ?? PLANS[1];
  const baseBilledNow = billedAmount(plan.key, billing);
  const hasDiscountInput = promoCode.trim().length > 0 || referralCode.trim().length > 0;
  const activeQuote = hasDiscountInput ? quote : null;
  const billedNow = activeQuote?.amountRupees ?? baseBilledNow;
  const perMonth = monthlyEquivalent(plan.key, billing);
  const saving = yearlySaving(plan.key) + (activeQuote?.discountRupees ?? 0);
  const signedOut = status?.signedIn === false;
  const discountApplied = Boolean(activeQuote?.discountRupees);

  useEffect(() => {
    if (!open || !hasDiscountInput) return;

    let live = true;
    const controller = new AbortController();

    async function loadQuote() {
      try {
        const response = await fetch("/api/payments/razorpay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ plan: plan.key, cycle: billing, promoCode, referralCode }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (live && response.ok) setQuote(payload as DiscountQuote);
      } catch {
        if (live) setQuote(null);
      }
    }

    const timer = window.setTimeout(() => void loadQuote(), 180);
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [billing, hasDiscountInput, open, plan.key, promoCode, referralCode]);

  // The payment leaves the status stale for as long as it takes the verify call to come back and
  // the provider to refetch. When it lands and the feature is usable, the reader is done here.
  // `!loading` carries its weight: `canUse` answers optimistically until the first status lands.
  const unlocked = open && !loading && Boolean(feature) && canUse(feature as string);
  useEffect(() => {
    if (!unlocked) return;
    const timeout = setTimeout(onClose, 1200);
    return () => clearTimeout(timeout);
  }, [unlocked, onClose]);

  return (
    <AppleModal
      open={open}
      onClose={onClose}
      compact={Boolean(required)}
      dense
      label="Buy Plan"
      header={
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
              Subscribe
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-950 dark:text-white">Buy Plan</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {heldPlan
                ? `You are on ${heldPlan}. Choose another plan and billing.`
                : requiredPlanName
                  ? `${featureLabel} is available on ${requiredPlanName}; choose any plan.`
                  : "Choose a plan and billing to continue."}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            Razorpay
          </span>
        </div>
      }
    >
      {unlocked ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          You&apos;re subscribed - {featureLabel} is unlocked.
        </p>
      ) : (
        <>
          <div className="space-y-2.5 rounded-[20px] border border-slate-200 bg-gradient-to-br from-white via-emerald-50/35 to-sky-50/45 p-3 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.7)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
            <div className="grid grid-cols-2 gap-2.5">
              <ModalDropdown
                label="Plan"
                value={plan.key}
                options={planOptions.map((option) => ({ key: option.key, label: option.name }))}
                open={openDropdown === "plan"}
                onOpenChange={(nextOpen) => setOpenDropdown(nextOpen ? "plan" : null)}
                onChange={setSelectedPlanKey}
              />

              <ModalDropdown
                label="Billing"
                value={billing}
                options={cycles}
                open={openDropdown === "billing"}
                onOpenChange={(nextOpen) => setOpenDropdown(nextOpen ? "billing" : null)}
                onChange={setBilling}
              />

            </div>

            <div className="rounded-[18px] border border-emerald-200 bg-white/90 p-3 shadow-sm dark:border-emerald-500/25 dark:bg-slate-950/45">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Payable now
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tracking-normal text-slate-950 tabular-nums dark:text-white">
                    {rupees(billedNow)}
                  </p>
                </div>
                <p className="pb-0.5 text-sm font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                  {rupees(perMonth)}/mo
                </p>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                {billing === "yearly" ? (
                  <>
                    Annual billing saves <span className="font-bold text-emerald-700 dark:text-emerald-300">{rupees(saving)}</span>.
                  </>
                ) : (
                  "Monthly billing renews each month."
                )}
              </p>
              {discountApplied && (
                <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  {activeQuote?.discountLabel} saved {rupees(activeQuote?.discountRupees ?? 0)}.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="min-w-0 rounded-[16px] border border-slate-200 bg-white/85 p-2 dark:border-slate-800 dark:bg-slate-950/35">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Promo code
                </span>
                <input
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                  placeholder="SAVE10"
                  className="mt-1 h-8 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold uppercase text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="min-w-0 rounded-[16px] border border-slate-200 bg-white/85 p-2 dark:border-slate-800 dark:bg-slate-950/35">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Referral code
                </span>
                <input
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                  placeholder="STK..."
                  className="mt-1 h-8 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold uppercase text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </div>
            {hasDiscountInput && activeQuote?.message && (
              <p className={`text-xs font-semibold ${activeQuote.discountRupees ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                {activeQuote.message}
              </p>
            )}

            <SubscribeButton
              plan={plan.key}
              cycle={billing}
              promoCode={promoCode}
              referralCode={referralCode}
              label={signedOut ? "Create account & buy" : `Buy ${plan.name}`}
              // Closes this sheet the moment the payment confirms, before the button sends the
              // reader to sign in again with the plan attached.
              onPaid={onClose}
              className={`inline-flex w-full justify-center rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-[0_18px_40px_-24px_rgba(5,150,105,0.9)] transition ${plan.button}`}
            />
          </div>

          {status?.referralCode && status.referralUrl && (
            <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/75 p-3 text-xs text-slate-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Share referral</p>
                  <p className="mt-0.5">
                    Your code <span className="font-black text-slate-900 dark:text-white">{status.referralCode}</span> gives 10% off.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(status.referralUrl!);
                      setCopiedReferral(true);
                      setTimeout(() => setCopiedReferral(false), 1400);
                    } catch {
                      setCopiedReferral(false);
                    }
                  }}
                  className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:border-sky-300 dark:border-sky-500/30 dark:bg-slate-950 dark:text-sky-300"
                >
                  {copiedReferral ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}

          {status && !status.signedIn && (
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link href="/signin" className="font-semibold text-emerald-700 underline dark:text-emerald-400">
                Sign in
              </Link>{" "}
              first and your plan will be added to it.
            </p>
          )}

          <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            UPI, cards and netbanking. Payment is verified server-side before access is granted.
          </p>
        </>
      )}
    </AppleModal>
  );
}
