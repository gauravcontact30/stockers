"use client";

import { useEffect, useRef, useState } from "react";
import { billedAmount, monthlyEquivalent, rupees, yearlySaving } from "../lib/subscription-pricing";
import { PLANS, type Billing } from "./pricing-plans";
import { SubscribeButton, type PlanKey } from "./razorpay-checkout";
import { useSubscription } from "./subscription-provider";

const BILLING: { key: Billing; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

export function HeaderSubscriptionCta() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanKey>("pro");
  const [cycle, setCycle] = useState<Billing>("yearly");
  const panel = useRef<HTMLDivElement>(null);
  const { status } = useSubscription();

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  /* istanbul ignore next -- `plan` is a PlanKey and PLANS carries all three, so the find always
     hits; the fallback only exists because `find` is typed as possibly returning undefined. */
  const selected = PLANS.find((item) => item.key === plan) ?? PLANS[1];
  const payable = billedAmount(selected.key, cycle);
  const perMonth = monthlyEquivalent(selected.key, cycle);
  const ctaLabel = status?.signedIn ? `Buy ${selected.name}` : "Create account & buy";

  return (
    <div ref={panel} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`group inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-px hover:border-emerald-300 hover:shadow-[0_10px_24px_-14px_rgba(5,150,105,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-500/45 dark:focus-visible:ring-offset-slate-900 ${
          open
            ? "border-emerald-300 shadow-[0_10px_24px_-14px_rgba(5,150,105,0.7)] dark:border-emerald-500/45"
            : "border-slate-200 dark:border-slate-700"
        }`}
      >
        {/* Small emerald mark keeps the commercial intent readable without turning the whole
            control into a second primary button next to "Get started". */}
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-emerald-600 dark:text-emerald-400">
          <path
            d="M3.5 7.5h13M6 4.5h8a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 13V7A2.5 2.5 0 0 1 6 4.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M6.5 12h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Buy plan
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-400 ${open ? "rotate-180" : ""}`}
        >
          <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        // whitespace-normal is load-bearing. The panel is a child of the header's control row,
        // which sets `whitespace-nowrap` to stop the buttons beside it breaking mid-label — and
        // `white-space` inherits, so the prose in here inherited it too and ran straight out past
        // the rounded edge instead of wrapping. Resetting it at the panel keeps the header's rule
        // where it belongs, on the header.
        <div className="absolute right-0 top-full z-40 mt-3 w-[340px] whitespace-normal rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">
                Subscribe
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Choose plan and billing</h3>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Razorpay
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {PLANS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPlan(item.key)}
                aria-pressed={plan === item.key}
                className={`rounded-2xl border px-3 py-2 text-left transition ${
                  plan === item.key
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"
                }`}
              >
                <span className="block text-sm font-semibold">{item.name}</span>
                <span className="mt-1 block text-[11px] tabular-nums opacity-75">
                  {rupees(monthlyEquivalent(item.key, cycle))}/mo
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
            {BILLING.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCycle(item.key)}
                aria-pressed={cycle === item.key}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  cycle === item.key
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Payable now</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{rupees(payable)}</p>
              </div>
              <p className="pb-1 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {rupees(perMonth)}/mo
              </p>
            </div>
            {cycle === "yearly" && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Annual billing saves <span className="font-semibold text-emerald-700 dark:text-emerald-300">{rupees(yearlySaving(selected.key))}</span>.
              </p>
            )}
          </div>

          <div className="mt-4">
            <SubscribeButton
              plan={plan}
              cycle={cycle}
              label={ctaLabel}
              className="inline-flex w-full justify-center rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
            />
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            UPI, cards and netbanking. Payment is verified server-side before access is granted.
          </p>
        </div>
      )}
    </div>
  );
}
