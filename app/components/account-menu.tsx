"use client";

// The trial chip and the theme switch, as one control.
//
// They used to sit side by side in the header: a wide amber pill reading "Trial - 5 calendar days
// left" and a round button holding a moon. Two controls, two shapes, two borders, competing for the
// same corner of a bar that also carries a nav, a plan button, "Sign in" and "Get started" — and
// the widest of them was a *status*, not something to press, which is the worst thing to give the
// most horizontal space to.
//
// Folded into one trigger: the status becomes the trigger's own label, and the theme switch becomes
// an item in the sheet behind it, alongside the account links that belong there anyway. The trigger
// keeps its colour from the subscription state, so the trial countdown is still readable at a
// glance without opening anything.
//
// Signed out it collapses to a plain theme control — there is no account to put in a menu — which
// is why `SubscriptionBadge` no longer renders for signed-out visitors either.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/theme-provider";
import { track } from "../lib/track";
import { useSubscription } from "./subscription-provider";

function MoonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function SunIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function SparkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m12 3 2.1 4.9L19 10l-4.9 2.1L12 17l-2.1-4.9L5 10l4.9-2.1L12 3Z" />
    </svg>
  );
}

function GridIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** The trigger's label and palette, from whatever the subscription status currently is. */
function triggerState(status: ReturnType<typeof useSubscription>["status"]) {
  if (!status?.signedIn || status.state === "admin") {
    return {
      label: null,
      chrome: "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
      icon: null,
    };
  }

  if (status.state === "trial") {
    const days = status.marketDaysLeft;
    return {
      label: `Trial - ${days} ${days === 1 ? "day" : "days"} left`,
      chrome:
        days <= 1
          ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
          : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
      icon: <ClockIcon />,
    };
  }

  if (status.state === "active") {
    return {
      label: status.planName ?? "Subscribed",
      chrome:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
      icon: <SparkIcon />,
    };
  }

  return {
    label: "Starter",
    chrome: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
    icon: <SparkIcon />,
  };
}

const ITEM =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { status } = useSubscription();

  const isDark = theme === "dark";
  const state = triggerState(status);
  const signedIn = Boolean(status?.signedIn);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    // Escape as well as a click outside: this is a menu, and a keyboard user should not have to
    // find the trigger again to shut it.
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const switchTheme = () => {
    // The theme they are switching *to*, which is the half of the pair worth counting.
    track("theme.set", isDark ? "light" : "dark");
    toggleTheme();
    setOpen(false);
  };

  return (
    <div ref={panel} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={state.label ? `${state.label} — account and appearance` : "Appearance and account"}
        className={`inline-flex h-10 items-center gap-2 rounded-full border text-sm font-semibold transition hover:border-emerald-300 dark:hover:border-emerald-500/40 ${
          state.label ? "px-3" : "w-10 justify-center"
        } ${state.chrome}`}
      >
        {state.icon ?? (isDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />)}
        {/* The countdown is the reason this control is wide, so it is hidden first on a narrow
            bar rather than being allowed to push the sign-in controls off the edge. */}
        {state.label && <span className="hidden whitespace-nowrap md:inline">{state.label}</span>}
        {state.label && (
          <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900"
        >
          {state.label && (
            <div className="border-b border-slate-100 px-3 pb-2 pt-1.5 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Your access
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{state.label}</p>
            </div>
          )}

          <div className="pt-1.5">
            <button type="button" role="menuitem" onClick={switchTheme} className={ITEM}>
              {isDark ? <SunIcon /> : <MoonIcon />}
              {isDark ? "Light mode" : "Dark mode"}
            </button>

            {signedIn ? (
              <Link href="/overview" role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                <GridIcon />
                Open dashboard
              </Link>
            ) : (
              <Link href="/signin" role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                <GridIcon />
                Sign in
              </Link>
            )}

            <Link href="/pricing" role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
              <SparkIcon />
              {status?.state === "active" ? "Manage plan" : "See plans"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
