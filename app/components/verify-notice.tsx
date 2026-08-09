"use client";

import { useSearchParams } from "next/navigation";

/**
 * The result of following the link in the welcome mail.
 *
 * /api/auth/verify is opened by a person, so it redirects here with ?verify=… rather than
 * answering JSON at a URL that would render as a blank page.
 */
export function VerifyNotice() {
  const outcome = useSearchParams().get("verify");
  if (outcome !== "verified" && outcome !== "invalid") return null;

  const verified = outcome === "verified";

  return (
    <p
      role="status"
      className={
        verified
          ? "rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
      }
    >
      {verified
        ? "Email confirmed. Sign in to pick up where you left off."
        : "That verification link has already been used or is no longer valid. Sign in and we can send you a new one."}
    </p>
  );
}
