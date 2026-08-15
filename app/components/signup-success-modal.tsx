"use client";

// What a new account is told, at the one moment it has their full attention.
//
// Sign-up used to store a session and push straight to the dashboard behind a line of status text.
// That skipped past the two things somebody needs to know at exactly that point: that the account
// was really created, and what they have just been given. A reader who lands on a full dashboard
// with an "Elite" pill and no explanation does not know a clock is running.
//
// So the flow stops here for a moment: the account is confirmed, the trial is named with its length
// and end date, and the reader continues to sign-in deliberately rather than being carried there.
//
// It is built on ./apple-modal — the same sheet the rest of the app uses for dialogs — so it
// inherits the focus trap, the escape handling and the enter/exit curve rather than reinventing
// them. `onClose` and "Continue to sign in" do the same thing on purpose: dismissing this dialog
// has exactly one sensible destination, and a reader who presses escape should still arrive there.

import { TRIAL_DAYS } from "../lib/subscription-policy";
import { AppleModal } from "./apple-modal";

/** What the trial opens, in the order a reader cares about. */
const INCLUDED = [
  "Every AI research report, screener and stock comparison",
  "The AI market pulse, daily top picks and dip screens",
  "Portfolio review, peer comparison and corporate actions",
];

export function SignupSuccessModal({
  open,
  email,
  trialEndsOn,
  onContinue,
}: {
  open: boolean;
  /** Shown back so the reader can catch a typo before they try to sign in with it. */
  email: string;
  /** The trial's last day, already formatted, or null when the server did not say. */
  trialEndsOn: string | null;
  onContinue: () => void;
}) {
  return (
    <AppleModal
      open={open}
      onClose={onContinue}
      label="Account created"
      header={
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
              Account created
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-white">
              Your {TRIAL_DAYS}-day free trial has started
            </h2>
          </div>
        </div>
      }
      footer={
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex w-full justify-center rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
        >
          Continue to sign in
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          We&apos;ve created your account for{" "}
          <span className="font-semibold text-slate-900 dark:text-white">{email}</span> and sent a
          verification link there. Sign in to open your dashboard.
        </p>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            Unlocked for {TRIAL_DAYS} days
          </p>
          <ul className="mt-2 space-y-1.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
          {trialEndsOn && (
            // The date, not only the count: "5 days" is a promise, a date is a fact the reader can
            // put in a calendar.
            <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Your trial runs until {trialEndsOn}.
            </p>
          )}
        </div>

        {/* Said now rather than discovered on day six. Nothing is taken away entirely, and a reader
            who knows that is more likely to still be here to decide. */}
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          When the trial ends your account stays open on the Starter plan — the market boards and
          Starter features keep working. Pro and Elite features need a subscription.
        </p>
      </div>
    </AppleModal>
  );
}
