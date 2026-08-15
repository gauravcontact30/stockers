"use client";

import { useSearchParams } from "next/navigation";

const NOTE = {
  emerald:
    "rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber:
    "rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
} as const;

/**
 * Why this sign-in page was arrived at, when it was arrived at from somewhere in particular.
 *
 * Three journeys end here, and each leaves a note in the query so the page can say something more
 * useful than an unexplained login form:
 *
 *   ?verify=…            the link in the welcome mail was followed. /api/auth/verify is opened by a
 *                        person, so it redirects here rather than answering JSON at a URL that
 *                        would render as a blank page.
 *   ?welcome=1           an account was just created. Sign-up confirms in a dialog and sends the
 *                        reader here rather than opening a session for them.
 *   ?upgraded=1&plan=…   a payment was just confirmed. The session was minted before the purchase,
 *                        so the reader is signed back in to pick the new plan up everywhere at once.
 *
 * Anything else renders nothing, which is the ordinary case.
 */
export function VerifyNotice() {
  const params = useSearchParams();
  const outcome = params.get("verify");

  if (params.get("upgraded") === "1") {
    const plan = params.get("plan");
    return (
      <p role="status" className={NOTE.emerald}>
        {plan
          ? `Payment confirmed — your ${plan} plan is active. Sign in to pick it up.`
          : "Payment confirmed. Sign in to pick your new plan up."}
      </p>
    );
  }

  if (params.get("welcome") === "1") {
    return (
      <p role="status" className={NOTE.emerald}>
        Your account is ready and your free trial has started. Sign in to open your dashboard.
      </p>
    );
  }

  if (outcome !== "verified" && outcome !== "invalid") return null;

  const verified = outcome === "verified";

  return (
    <p role="status" className={verified ? NOTE.emerald : NOTE.amber}>
      {verified
        ? "Email confirmed. Sign in to pick up where you left off."
        : "That verification link has already been used or is no longer valid. Sign in and we can send you a new one."}
    </p>
  );
}
