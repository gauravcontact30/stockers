"use client";

// Where a signed-in reader stands with their free trial, on the dashboard they actually work in.
//
// The header chip in the landing navigation has always carried this number, but the landing page is
// not where somebody using the product spends their time — they sign in and go straight to the
// workspace, where until now the only thing said about entitlement was a tier pill reading "Elite".
// A live trial reports the Elite tier (see `accessStatusFor` in ../lib/subscription: the trial is
// the whole product for the trial rather than a sample of the cheapest part of it), so the pill
// told a trialling reader they were on the top plan and said nothing about the clock against it.
//
// This card is the clock. It states the days left, the date the trial ends, and the one action that
// changes the outcome, on every dashboard page.
//
// Four states, and the card only draws in three of them:
//
//   trial    the countdown, warming from emerald to amber to rose as the last day approaches
//   expired  what has stopped working, and the way to restore it
//   active   the paid plan and the date it runs to — brief, because nothing needs doing
//   admin    nothing at all; an administrator stands outside the paywall entirely

import Link from "next/link";
import { useSubscription } from "./subscription-provider";

/**
 * An IST date string as a reader would write it.
 *
 * The dates on the status are IST calendar days (`YYYY-MM-DD`), and are parsed here as UTC rather
 * than local time on purpose: `new Date("2026-08-18")` is midnight UTC, and formatting that in a
 * timezone behind UTC would render the 17th. Pinning the format to UTC keeps the date the server
 * decided on as the date the reader sees, wherever they are.
 */
export function formatTrialDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The palette warms as the trial runs out, so the last day does not look like the first. */
function trialChrome(daysLeft: number) {
  if (daysLeft <= 1) {
    return {
      frame: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10",
      eyebrow: "text-rose-700 dark:text-rose-300",
      figure: "text-rose-800 dark:text-rose-200",
      body: "text-rose-700/80 dark:text-rose-200/70",
      cta: "bg-rose-600 text-white hover:bg-rose-500",
    };
  }

  if (daysLeft <= 2) {
    return {
      frame: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      eyebrow: "text-amber-700 dark:text-amber-300",
      figure: "text-amber-800 dark:text-amber-200",
      body: "text-amber-700/80 dark:text-amber-200/70",
      cta: "bg-amber-600 text-white hover:bg-amber-500",
    };
  }

  return {
    frame: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    eyebrow: "text-emerald-700 dark:text-emerald-300",
    figure: "text-emerald-800 dark:text-emerald-200",
    body: "text-emerald-700/80 dark:text-emerald-200/70",
    cta: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
}

export function TrialStatusCard() {
  const { status } = useSubscription();

  // Nothing until the status lands, and nothing for an admin or a signed-out reader. The dashboard
  // is behind a sign-in, so the last of those is only reachable for the moment before the redirect.
  if (!status || !status.signedIn || status.state === "admin") return null;

  if (status.state === "trial") {
    const daysLeft = Math.max(0, status.marketDaysLeft);
    const chrome = trialChrome(daysLeft);
    const endsOn = formatTrialDate(status.trialEndsAt);

    return (
      <section
        aria-label="Free trial status"
        className={`flex flex-col gap-4 rounded-[32px] border p-5 sm:flex-row sm:items-center sm:justify-between ${chrome.frame}`}
      >
        <div className="min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-[0.22em] ${chrome.eyebrow}`}>Free trial</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${chrome.figure}`}>
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </p>
          <p className={`mt-1 text-sm ${chrome.body}`}>
            {/* The date is the half a countdown cannot give: "1 day left" is ambiguous about
                whether that means tonight or this time tomorrow. */}
            {endsOn ? `Every AI feature is unlocked until ${endsOn}.` : "Every AI feature is unlocked for now."}
          </p>
        </div>

        <Link
          href="/pricing"
          className={`inline-flex shrink-0 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:-translate-y-px ${chrome.cta}`}
        >
          {daysLeft <= 1 ? "Keep your access" : "See plans"}
        </Link>
      </section>
    );
  }

  if (status.state === "expired") {
    const endedOn = formatTrialDate(status.trialEndsAt);

    return (
      <section
        aria-label="Free trial status"
        className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Free trial ended
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {endedOn ? `Your trial ran to ${endedOn}.` : "Your trial has ended."}
          </p>
          {/* Named rather than implied, and named accurately: the account did not lose everything,
              it stepped down to Starter. A message that reads as though the whole product had been
              withdrawn would be both discouraging and untrue. */}
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your account is on the <span className="font-semibold text-slate-900 dark:text-white">Starter</span> plan and
            keeps its Starter AI features. Pro and Elite features need a subscription.
          </p>
        </div>

        <Link
          href="/pricing"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
        >
          Choose a plan
        </Link>
      </section>
    );
  }

  // `active`: a paid plan. One line, because there is nothing for the reader to do about it.
  const until = formatTrialDate(status.subscribedUntil);
  if (!until) return null;

  return (
    <section
      aria-label="Subscription status"
      className="rounded-[32px] border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
    >
      <p className="text-sm text-emerald-800 dark:text-emerald-200">
        <span className="font-semibold">{status.planName ?? "Your plan"}</span> is active until {until}.
      </p>
    </section>
  );
}
