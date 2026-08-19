"use client";

// The greeting a first-time visitor gets five seconds after they arrive.
//
// Five seconds is the whole design constraint. It is long enough that somebody who bounced never
// sees it, and short enough that somebody still reading is still reading. What appears has to earn
// the interruption, so it is not a newsletter box: it is two stocks the site has actually measured
// — the best six-month performers currently sitting at the bottom of their week — and a few tips
// about the exchange written against today's session.
//
// The tone is deliberate. Somebody arriving here has not asked for anything yet, so the copy
// thanks them for the visit and offers rather than instructs, and the dismissal is as easy to
// reach as the call to action.
//
// ---------------------------------------------------------------------------
// "New user" means a browser that has not been greeted
// ---------------------------------------------------------------------------
//
// There is no account at this point and usually never will be one, so the only honest definition
// available is local: a flag in `localStorage`, written the first time the dialog is shown. That
// makes the greeting once per browser rather than once per person, which is the right way round —
// showing it twice to somebody who has seen it is the failure that matters, and a reader who
// clears their storage getting a second welcome is not.
//
// The flag is written when the dialog *opens*, not when it is dismissed. A reader who closes the
// tab mid-greeting has still been greeted, and re-greeting them on the next page load would be
// exactly the nag this is trying not to be.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { WelcomeBrief, WelcomePick } from "../lib/welcome-brief";
import { AppleModal } from "./apple-modal";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { SectorPill } from "./sector-pill";
import { formatRupee, formatSignedPercent, toneFor } from "./market-format";

const ENDPOINT = "/api/welcome";

/** The storage key. Versioned, so a future rewrite can greet everybody once more, deliberately. */
export const WELCOME_SEEN_KEY = "stockers.welcome.v1";

/** How long a first-time visitor reads the page before being greeted. */
export const WELCOME_DELAY_MS = 5_000;

/**
 * `?welcome=1` on the URL, which shows the greeting to a browser that has already had it.
 *
 * The flag below is deliberately one-way — that is the whole point of it — which makes the dialog
 * impossible to look at again once it has been seen, including for the person who asked for it.
 * An explicit query parameter is the way back in: nobody arrives at it by accident, and it changes
 * nothing about who gets greeted unprompted.
 */
function forcedByUrl(): boolean {
  return new URLSearchParams(window.location.search).get("welcome") === "1";
}

/** Whether this browser has been greeted before. A storage that throws counts as "yes". */
export function hasBeenWelcomed(): boolean {
  if (forcedByUrl()) return false;

  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) !== null;
  } catch {
    // Private browsing, or storage disabled entirely. Not being able to remember that somebody was
    // greeted means greeting them on every single page load, which is worse than never greeting
    // them, so this errs towards silence.
    return true;
  }
}

function markWelcomed(): void {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to do. The dialog is already open; it simply may appear again next time.
  }
}

/** The half-sentence under the heading, which depends on what the exchange is doing right now. */
export function sessionLine(brief: WelcomeBrief): string {
  switch (brief.marketSession) {
    case "live":
      return "The BSE is trading right now. Both have led the last six months and are back near their lowest price of the week.";
    case "pre-open":
      return "The BSE opens at 9:15 AM IST. Both have led the last six months and closed near their lowest price of the week.";
    case "closed":
      return "The BSE has closed for the day. Both have led the last six months and finished near their lowest price of the week.";
    default:
      return "The BSE is shut today. Both have led the last six months and last traded near their lowest price of the week.";
  }
}

/**
 * One suggestion.
 *
 * Both halves of the screen are on the card, because either on its own is a different and worse
 * suggestion: the six-month return says the business has been working, the distance above the
 * week's low says it is at the bottom of its recent range. A card that showed only the second
 * would be pointing at a faller.
 */
function PickCard({ pick }: { pick: WelcomePick }) {
  return (
    <li className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition dark:border-white/10 dark:bg-white/[0.06]">
      {/* A soft wash behind the card, keyed to the "at its low" half of the claim. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-400/20 to-fuchsia-400/10 blur-2xl"
      />

      <div className="relative flex items-start gap-2.5">
        <CompanyLogo symbol={pick.symbol} size={36} preferReal />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white">
              {pick.symbol}
            </span>
            <CapTierBadge raw={pick.capTier} />
          </div>
          <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">{pick.name}</p>
          <SectorPill sector={pick.sector} className="mt-1" />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold leading-none tabular-nums text-slate-900 dark:text-white">
            {formatRupee(pick.price)}
          </p>
          <p className={`mt-1 text-[11px] font-bold leading-none tabular-nums ${toneFor(pick.changePercent)}`}>
            {formatSignedPercent(pick.changePercent)}
          </p>
        </div>
      </div>

      <dl className="relative mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-xl bg-emerald-50 px-2 py-1.5 text-center dark:bg-emerald-500/10">
          <dt className="text-[8px] font-bold uppercase tracking-wider text-emerald-700/70 dark:text-emerald-300/70">
            6-month return
          </dt>
          <dd className="mt-0.5 text-[12px] font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatSignedPercent(pick.sixMonthReturn)}
          </dd>
        </div>
        <div className="rounded-xl bg-indigo-50 px-2 py-1.5 text-center dark:bg-indigo-500/10">
          <dt className="text-[8px] font-bold uppercase tracking-wider text-indigo-700/70 dark:text-indigo-300/70">
            Week&apos;s low
          </dt>
          <dd className="mt-0.5 text-[12px] font-bold leading-none tabular-nums text-indigo-700 dark:text-indigo-300">
            {formatRupee(pick.weekLow)}
          </dd>
          {/* The distance is what makes "near the low" checkable rather than asserted. */}
          <dd className="mt-0.5 text-[9px] font-semibold leading-none tabular-nums text-indigo-600/70 dark:text-indigo-300/60">
            {pick.aboveWeekLow === null ? "—" : `${pick.aboveWeekLow.toFixed(1)}% above`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<WelcomeBrief | null>(null);
  /** Kept so the dialog is never opened twice in one page life, whatever the timers do. */
  const greeted = useRef(false);

  useEffect(() => {
    if (greeted.current || hasBeenWelcomed()) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      // The flag goes down as the dialog goes up: a reader who leaves mid-greeting has still been
      // greeted, and the alternative is a welcome that reappears until it is formally dismissed.
      greeted.current = true;
      markWelcomed();
      setOpen(true);

      // Fetched after the wait rather than before it, so a visitor who bounces in the first five
      // seconds — most of them — costs nothing at all. The dialog opens on its own and fills in.
      fetch(ENDPOINT, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: WelcomeBrief | null) => {
          if (payload) setBrief(payload);
        })
        .catch(() => {
          // An unreachable brief leaves the welcome itself, which is still a welcome.
        });
    }, WELCOME_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <AppleModal
      open={open}
      onClose={close}
      label="Welcome to StockersAI"
      header={
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_-14px_rgba(139,92,246,0.95)]"
          >
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/25 to-transparent" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="relative h-5 w-5">
              <path d="M3 17l5-5 4 3 8-8" />
              <path d="M20 7h-4M20 7v4" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">
              Welcome
            </p>
            <h2 className="mt-0.5 text-xl font-semibold leading-snug text-slate-900 dark:text-white">
              Thank you for stopping by
            </h2>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            href="/bse-gainers-losers"
            onClick={close}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-16px_rgba(99,102,241,0.95)] transition hover:from-indigo-500 hover:to-violet-500"
          >
            Explore the live market
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={close}
            className="inline-flex justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Maybe later
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          We&apos;re glad you&apos;re here. Nothing is asked of you — no sign-up, no email. Here are two
          BSE stocks worth exploring, and a few notes that might help if the market is new to you.
        </p>

        {brief && brief.picks.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Two to explore
              </p>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                6-month leaders, near this week&apos;s low
              </span>
            </div>
            <ul className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {brief.picks.map((pick) => (
                <PickCard key={pick.symbol} pick={pick} />
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{sessionLine(brief)}</p>
          </div>
        )}

        {brief && brief.picks.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-snug text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No stock cleared both halves of the screen today — six months of gains and a price back
            near this week&apos;s low. Rather than reach for something that did not, here are the
            notes on their own, and the live boards are one click away.
          </p>
        )}

        {!brief && (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Reading today&apos;s session…
          </p>
        )}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {brief?.tipsSource === "ai" ? "AI tips for today's BSE" : "Tips for trading the BSE"}
          </p>
          <ol className="mt-2 space-y-1.5">
            {(brief?.tips ?? []).map((tip, index) => (
              <li
                key={tip}
                className="flex gap-2.5 rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white px-3 py-2 text-[12px] leading-snug text-slate-700 dark:border-white/10 dark:from-white/[0.06] dark:to-transparent dark:text-slate-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[9px] font-black text-white"
                >
                  {index + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
          Measured from BSE published closes and live quotes — information, not advice. Every figure
          here is one you can check on the boards behind this dialog.
        </p>
      </div>
    </AppleModal>
  );
}
