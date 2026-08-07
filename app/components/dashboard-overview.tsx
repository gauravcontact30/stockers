"use client";

import { istMoment, useClockTick, type IstMoment } from "./market-clock";

/**
 * The overview is the first screen of the workspace, so it answers two questions before any
 * board is opened: what is the market doing right now, and what do the numbers on every other
 * screen actually mean.
 *
 * Everything here is either derived from the clock or written down in advance — the overview
 * fires no market request of its own, so opening the dashboard costs one page load, not fifteen
 * exchange calls.
 */

// ---------------------------------------------------------------------------
// Where we are in the trading day
// ---------------------------------------------------------------------------

export type SessionKey = "weekend" | "before" | "pre-open" | "live" | "post" | "closed";

export type SessionBrief = {
  key: SessionKey;
  label: string;
  note: string;
  /** Chip colours for the state. */
  tone: string;
  /** The lamp beside the label. */
  dot: string;
};

const PRE_OPEN_AT = 9 * 60;
const OPEN_AT = 9 * 60 + 15;
const CLOSE_AT = 15 * 60 + 30;
const POST_UNTIL = 16 * 60;

/**
 * A paragraph about the current part of the trading day.
 *
 * The status chip in Market Pulse already answers "is it open?" in four words; this answers the
 * next question — what that state means for the numbers on screen. Both read the same
 * `istMoment`, so the two can never disagree about what time it is in India.
 *
 * Like that chip, this reads the clock only: it does not know the exchange holiday calendar, and
 * the footnote under it says so rather than letting a reader assume otherwise.
 */
export function sessionBrief(moment: IstMoment): SessionBrief {
  if (moment.isWeekend) {
    return {
      key: "weekend",
      label: "Closed for the weekend",
      note: "NSE and BSE trade Monday to Friday. The boards below still show Friday's closing data.",
      tone: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
      dot: "bg-slate-400",
    };
  }

  if (moment.minuteOfDay < PRE_OPEN_AT) {
    return {
      key: "before",
      label: "Before the pre-open",
      note: "The pre-open auction starts at 9:00 AM IST and continuous trading at 9:15 AM.",
      tone: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
      dot: "bg-sky-400",
    };
  }

  if (moment.minuteOfDay < OPEN_AT) {
    return {
      key: "pre-open",
      label: "Pre-open auction",
      note: "Orders are collected until 9:08 and matched into an opening price. Prices you see now are indicative.",
      tone: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
      dot: "bg-amber-400",
    };
  }

  if (moment.minuteOfDay < CLOSE_AT) {
    return {
      key: "live",
      label: "Continuous trading",
      note: "Live until 3:30 PM IST. Prices, breadth and turnover on every board are moving.",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
      dot: "bg-emerald-500",
    };
  }

  if (moment.minuteOfDay < POST_UNTIL) {
    return {
      key: "post",
      label: "Post-close session",
      note: "The closing price is set between 3:30 and 3:40; orders at that price run to 4:00 PM.",
      tone: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
      dot: "bg-violet-400",
    };
  }

  return {
    key: "closed",
    label: "Closed for the day",
    note: "Today's closing prices are final. Bhavcopy-backed boards settle shortly after the close.",
    tone: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  };
}

/** Time-of-day greeting in IST rather than the reader's own timezone — this is an Indian market app. */
export function greeting(moment: IstMoment): string {
  if (moment.minuteOfDay < 12 * 60) return "Good morning";
  if (moment.minuteOfDay < 17 * 60) return "Good afternoon";
  return "Good evening";
}

// Worded differently from the session labels above on purpose: the same phrase in the chip and in
// the timetable reads as a duplicate rather than as two views of the same day.
const TIMETABLE: { at: string; what: string; keys: SessionKey[] }[] = [
  { at: "9:00 – 9:15", what: "Orders collected, opening price matched", keys: ["pre-open"] },
  { at: "9:15 – 15:30", what: "Regular market", keys: ["live"] },
  { at: "15:30 – 15:40", what: "Closing price computed", keys: ["post"] },
  { at: "15:40 – 16:00", what: "Orders at the closing price", keys: ["post"] },
];

/**
 * The header strip: who is signed in, what the market is doing, and the day's timetable.
 *
 * `useClockTick` returns 0 until the shared interval has run, which is what the server render and
 * the hydration pass both see — so the panel prints no time at all rather than one that would
 * change underneath the reader a moment later.
 */
export function OverviewHeader({ name }: { name: string }) {
  const tick = useClockTick();
  const moment = tick === 0 ? null : istMoment(tick);
  const session = moment ? sessionBrief(moment) : null;

  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.3em] text-emerald-600 uppercase dark:text-emerald-400">
            {moment ? greeting(moment) : "Welcome back"}
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{name}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
            Every board in this workspace reads from BSE and NSE directly. The AI explains what it finds and never
            supplies a figure of its own — so when a number here disagrees with a headline, the exchange is what this
            is quoting.
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:w-80 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Market clock
            </p>
            {moment && (
              <span className="font-mono text-sm font-bold text-slate-700 tabular-nums dark:text-slate-200">
                {moment.timeLabel} IST
              </span>
            )}
          </div>

          {session ? (
            <>
              <span
                className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${session.tone}`}
              >
                <span className={`h-2 w-2 rounded-full ${session.dot}`} aria-hidden="true" />
                {session.label}
              </span>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{session.note}</p>
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Syncing IST clock…</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 border-t border-slate-200 text-xs sm:grid-cols-4 dark:border-slate-800">
        {TIMETABLE.map((slot) => {
          const current = session !== null && slot.keys.includes(session.key);
          return (
            <div
              key={slot.what}
              className={`border-r border-slate-200 px-4 py-3 last:border-r-0 dark:border-slate-800 ${
                current ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
              }`}
            >
              <dt className="font-mono font-semibold text-slate-700 tabular-nums dark:text-slate-200">{slot.at}</dt>
              <dd
                className={`mt-0.5 ${
                  current ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {slot.what}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="border-t border-slate-200 px-6 py-2.5 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Session times are the standard NSE/BSE equity timetable in IST. Exchange holidays are not accounted for here —
        Market Pulse checks the live feed for those.
      </p>
    </section>
  );
}
