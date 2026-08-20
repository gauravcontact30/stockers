"use client";

// The greeting every visitor gets five seconds after they arrive.
//
// It is shown on every arrival rather than once per browser: each visit is treated as a fresh one,
// and the dialog stays up until the reader closes it themselves — nothing dismisses it on a timer.
// What appears has to earn the interruption, so it is not a newsletter box: it is two stocks the
// site has actually measured — six-month performers currently sitting at the bottom of their week —
// and one thing worth knowing about trading today.
//
// The five-second wait is the one concession to somebody who is only passing through. It is long
// enough that a reader who bounces never sees it and short enough that a reader who is still
// reading is still reading, and it keeps the brief from being fetched for arrivals that end in the
// first few seconds.
//
// ---------------------------------------------------------------------------
// Why the two names are drawn here rather than sent
// ---------------------------------------------------------------------------
//
// A greeting that opens on every visit cannot say the same thing every visit. The brief carries
// everything that cleared the screen — six-month leaders within 2% of their weekly low — and this
// deals two of them per arrival, skipping whichever pair the last arrival was dealt. Drawing in the
// browser rather than on the server is what makes that possible at all: the brief is one cached
// object shared by every reader for half an hour, so anything the *server* chose would be the same
// two names for all of them.
//
// The symbols of the pair just shown are the only thing kept, and only so the next visit can avoid
// them. A browser that refuses storage still gets a random pair; it just cannot promise the pair is
// new.
//
// The tone is deliberate. Somebody arriving here has not asked for anything yet, so the copy offers
// rather than instructs, the greeting line changes with the visit, and the dismissal is as easy to
// reach as the call to action.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WelcomeBrief, WelcomePick } from "../lib/welcome-brief";
import { AppleModal } from "./apple-modal";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { SectorPill } from "./sector-pill";
import { formatRupee, formatSignedPercent, toneFor } from "./market-format";

const ENDPOINT = "/api/welcome";

/** How long a visitor reads the page before being greeted. */
export const WELCOME_DELAY_MS = 5_000;

/** How many of the qualified names one visit is shown. */
const PICKS_SHOWN = 2;

/** The pair the last visit was dealt, kept only so this visit can deal a different one. */
export const LAST_PICKS_KEY = "stockers.welcome.last-picks";

/**
 * The opening line, which changes with the visit.
 *
 * A fixed sentence read twice is the tell that nothing behind it moved either. All four are the
 * same greeting in the same voice — warm, and out of the reader's way in one line.
 */
export const WELCOME_HEADLINES = [
  "Good to see you here",
  "Come in — here's today's read",
  "Here's what today's screen turned up",
  "A quick look at today's market",
];

/** The little status pill beside the greeting, once the session is known. */
const SESSION_PILL: Record<WelcomeBrief["marketSession"], { label: string; dot: string; text: string }> = {
  live: {
    label: "BSE live",
    dot: "bg-emerald-500",
    text: "text-emerald-700 bg-emerald-50 ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  "pre-open": {
    label: "Pre-open",
    dot: "bg-amber-500",
    text: "text-amber-700 bg-amber-50 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  },
  closed: {
    label: "Closed",
    dot: "bg-slate-400",
    text: "text-slate-600 bg-slate-100 ring-slate-400/20 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15",
  },
  holiday: {
    label: "Holiday",
    dot: "bg-slate-400",
    text: "text-slate-600 bg-slate-100 ring-slate-400/20 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15",
  },
};

/** The pair the last visit saw. An unreadable storage is simply no memory of a last visit. */
export function lastPicks(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LAST_PICKS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((symbol): symbol is string => typeof symbol === "string") : [];
  } catch {
    return [];
  }
}

function rememberPicks(symbols: string[]): void {
  try {
    window.localStorage.setItem(LAST_PICKS_KEY, JSON.stringify(symbols));
  } catch {
    // Private browsing, or storage disabled. The draw still happened; the next one just cannot know
    // what this one showed.
  }
}

/**
 * Two of the qualified names, avoiding the pair the last visit was shown.
 *
 * Names the previous visit used are taken out of the hat first, and only put back when doing so
 * would leave too few to draw from — a session where three stocks cleared the screen has to repeat
 * one eventually, and repeating one is better than showing one.
 */
export function drawPicks(pool: WelcomePick[], previous: string[]): WelcomePick[] {
  if (pool.length <= PICKS_SHOWN) return pool;

  const fresh = pool.filter((pick) => !previous.includes(pick.symbol));
  const source = fresh.length >= PICKS_SHOWN ? fresh : pool;

  // Two distinct draws: the second is an offset from the first rather than a second index, so it
  // can never land on the same name.
  const first = Math.floor(Math.random() * source.length);
  const step = 1 + Math.floor(Math.random() * (source.length - 1));
  return [source[first], source[(first + step) % source.length]];
}

/** The greeting line for this visit. */
export function drawHeadline(): string {
  return WELCOME_HEADLINES[Math.floor(Math.random() * WELCOME_HEADLINES.length)];
}

/** The half-sentence under the picks, which depends on what the exchange is doing right now. */
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
    <li className="group relative overflow-hidden rounded-[20px] bg-gradient-to-b from-white to-slate-50/80 p-[1px] shadow-[0_2px_10px_-4px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-22px_rgba(79,70,229,0.55)] hover:ring-indigo-300/70 dark:from-white/[0.08] dark:to-white/[0.02] dark:ring-white/10 dark:hover:ring-indigo-400/30">
      <div className="relative overflow-hidden rounded-[19px] p-3.5">
        {/* A soft wash behind the card, keyed to the "at its low" half of the claim. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-gradient-to-br from-indigo-400/25 to-fuchsia-400/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
        />

        <div className="relative flex items-start gap-3">
          <CompanyLogo symbol={pick.symbol} size={38} preferReal />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                {pick.symbol}
              </span>
              <CapTierBadge raw={pick.capTier} />
            </div>
            <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">{pick.name}</p>
            <SectorPill sector={pick.sector} className="mt-1.5" />
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[15px] font-bold leading-none tracking-tight tabular-nums text-slate-900 dark:text-white">
              {formatRupee(pick.price)}
            </p>
            <p className={`mt-1.5 text-[11px] font-bold leading-none tabular-nums ${toneFor(pick.changePercent)}`}>
              {formatSignedPercent(pick.changePercent)}
            </p>
          </div>
        </div>

        <dl className="relative mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50/90 px-2.5 py-2 text-center ring-1 ring-inset ring-emerald-500/10 dark:bg-emerald-500/10 dark:ring-emerald-400/15">
            <dt className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-emerald-700/70 dark:text-emerald-300/70">
              6-month return
            </dt>
            <dd className="mt-1 text-[13px] font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatSignedPercent(pick.sixMonthReturn)}
            </dd>
          </div>
          <div className="rounded-2xl bg-indigo-50/90 px-2.5 py-2 text-center ring-1 ring-inset ring-indigo-500/10 dark:bg-indigo-500/10 dark:ring-indigo-400/15">
            <dt className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-indigo-700/70 dark:text-indigo-300/70">
              Week&apos;s low
            </dt>
            <dd className="mt-1 text-[13px] font-bold leading-none tabular-nums text-indigo-700 dark:text-indigo-300">
              {formatRupee(pick.weekLow)}
            </dd>
            {/* The distance is what makes "near the low" checkable rather than asserted. */}
            <dd className="mt-1 text-[9px] font-semibold leading-none tabular-nums text-indigo-600/70 dark:text-indigo-300/60">
              {pick.aboveWeekLow === null ? "—" : `${pick.aboveWeekLow.toFixed(1)}% above`}
            </dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<WelcomeBrief | null>(null);
  const [picks, setPicks] = useState<WelcomePick[]>([]);
  const [headline, setHeadline] = useState(WELCOME_HEADLINES[0]);

  // Once per mount: the cleanup below cancels the pending timer, so an effect that re-runs — in
  // development React does exactly that — replaces the wait rather than stacking a second one.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setHeadline(drawHeadline());
      setOpen(true);

      // Fetched after the wait rather than before it, so a visitor who bounces in the first five
      // seconds — most of them — costs nothing at all. The dialog opens on its own and fills in.
      fetch(ENDPOINT, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: WelcomeBrief | null) => {
          if (!payload) return;

          const drawn = drawPicks(payload.picks, lastPicks());
          rememberPicks(drawn.map((pick) => pick.symbol));
          setBrief(payload);
          setPicks(drawn);
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
  const session = brief ? SESSION_PILL[brief.marketSession] : null;

  return (
    <AppleModal
      open={open}
      onClose={close}
      label="Welcome to StockersAI"
      header={
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_16px_32px_-16px_rgba(139,92,246,0.95)] ring-1 ring-white/40"
          >
            <span className="absolute inset-0 rounded-[18px] bg-gradient-to-tr from-white/30 to-transparent" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="relative h-5 w-5">
              <path d="M3 17l5-5 4 3 8-8" />
              <path d="M20 7h-4M20 7v4" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-violet-600 dark:text-violet-300">
                Welcome
              </p>
              {session && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.12em] ring-1 ring-inset ${session.text}`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${session.dot}`} />
                  {session.label}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-[22px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
              {headline}
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
        <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400">
          Nothing is asked of you — no sign-up, no email. Here are two BSE stocks worth exploring,
          drawn fresh each visit, and one thing worth knowing before you trade today.
        </p>

        {picks.length > 0 && brief && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Two to explore
              </p>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                6-month leaders, near this week&apos;s low
              </span>
            </div>
            <ul className="mt-2.5 grid gap-3 sm:grid-cols-2">
              {picks.map((pick) => (
                <PickCard key={pick.symbol} pick={pick} />
              ))}
            </ul>
            <p className="mt-2.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{sessionLine(brief)}</p>
          </div>
        )}

        {brief && picks.length === 0 && (
          <p className="rounded-2xl bg-slate-50 px-3.5 py-3 text-[12px] leading-snug text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
            No stock cleared both halves of the screen today — six months of gains and a price back
            near this week&apos;s low. Rather than reach for something that did not, here is the tip
            on its own, and the live boards are one click away.
          </p>
        )}

        {!brief && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-3.5 py-3 text-[12px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
            Reading today&apos;s session…
          </div>
        )}

        {/* One tip, not a list. Three general tips are a leaflet somebody skims; one about this
            session is the only one that has a chance of being read and used. */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-white to-indigo-50/70 p-3.5 ring-1 ring-inset ring-violet-200/70 dark:from-violet-500/10 dark:via-transparent dark:to-indigo-500/10 dark:ring-violet-400/20">
          <div className="relative flex items-start gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[0_10px_20px_-12px_rgba(139,92,246,0.95)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                {brief?.tipSource === "ai" ? "AI tip for today's BSE" : "Tip for trading the BSE"}
              </p>
              {brief ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">{brief.tip}</p>
              ) : (
                <span
                  aria-hidden="true"
                  className="mt-2 block h-3 w-56 max-w-full animate-pulse rounded-full bg-slate-200/80 dark:bg-white/10"
                />
              )}
            </div>
          </div>
        </section>

        <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
          Measured from BSE published closes and live quotes — information, not advice. Every figure
          here is one you can check on the boards behind this dialog.
        </p>
      </div>
    </AppleModal>
  );
}
