"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSubscription } from "./subscription-provider";

/**
 * The admin's per-feature switch. Rendered only for admins — and backed by a server-side admin
 * check, so hiding it is a convenience, not the security boundary.
 */
export function FeatureLockToggle({ feature, label }: { feature: string; label: string }) {
  const { status, isLocked, setLock } = useSubscription();
  const [busy, setBusy] = useState(false);

  if (!status?.isAdmin) return null;

  const locked = isLocked(feature);

  const toggle = async () => {
    setBusy(true);
    await setLock(feature, !locked);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={locked}
      aria-label={`${locked ? "Unlock" : "Lock"} ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
        locked
          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400"
          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
      }`}
    >
      <span aria-hidden="true">{locked ? "🔒" : "🔓"}</span>
      {busy ? "Saving…" : locked ? "Locked" : "Unlocked"}
    </button>
  );
}

export function LockPanel({ feature, label }: { feature: string; label: string }) {
  const { status, isLocked } = useSubscription();
  const lockedByAdmin = isLocked(feature);
  const signedIn = status?.signedIn ?? false;

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/60">
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{label} is locked</p>

      {lockedByAdmin ? (
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
          An administrator has turned this feature off. It will come back on once they re-enable it.
        </p>
      ) : (
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
          Your free trial of five open market days has ended. Subscribe to keep using the AI features — live market data
          stays free.
        </p>
      )}

      {!lockedByAdmin && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {signedIn ? (
            <Link
              href="/#pricing"
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              See plans
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Start free trial
              </Link>
              <Link
                href="/signin"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Wraps an AI feature, showing a lock panel in its place when the caller may not use it.
 *
 * This is presentation only. Every gated endpoint refuses on the server too, so a user who
 * removes this from the DOM still gets a 402 from the API.
 */
export function AiGate({ feature, label, children }: { feature: string; label: string; children: ReactNode }) {
  const { canUse } = useSubscription();

  if (canUse(feature)) return <>{children}</>;
  return <LockPanel feature={feature} label={label} />;
}

/**
 * One AI section on the landing page: the admin's lock switch above it (admins only) and, by
 * default, the subscription gate around it.
 *
 * @param gate set false for a section that is only partly AI — the market pulse keeps its
 * exchange data visible and has the server withhold just the AI narrative, so replacing the whole
 * card with a lock panel would hide real data the user is entitled to.
 */
export function GatedSection({
  feature,
  label,
  id,
  gate = true,
  children,
}: {
  feature: string;
  label: string;
  id?: string;
  gate?: boolean;
  children: ReactNode;
}) {
  const { status } = useSubscription();

  return (
    <div id={id} className="scroll-mt-28">
      {status?.isAdmin && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
          <FeatureLockToggle feature={feature} label={label} />
        </div>
      )}
      {gate ? (
        <AiGate feature={feature} label={label}>
          {children}
        </AiGate>
      ) : (
        children
      )}
    </div>
  );
}
