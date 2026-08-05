"use client";

import { useSyncExternalStore } from "react";

export type MarketState = "open" | "pre-open" | "closed" | "weekend" | "holiday";
export type MarketSession = { state: MarketState; open: boolean; label: string };

const IST = "Asia/Kolkata";
// NSE/BSE regular session, in minutes past IST midnight.
const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;

// hourCycle "h23" rather than hour12:false — the latter renders midnight as hour "24" in some
// locales, which would put the clock an entire day out at exactly 00:00 IST.
const IST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  hourCycle: "h23",
  weekday: "long",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export type IstMoment = {
  weekday: string;
  dayLabel: string;
  timeLabel: string;
  minuteOfDay: number;
  dateKey: string;
  isWeekend: boolean;
};

export function istMoment(timestamp: number): IstMoment {
  const date = new Date(timestamp);
  const parts: Record<string, string> = {};
  for (const part of IST_PARTS.formatToParts(date)) parts[part.type] = part.value;

  return {
    weekday: parts.weekday,
    dayLabel: `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`,
    timeLabel: `${parts.hour}:${parts.minute}:${parts.second}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: date.toLocaleDateString("en-CA", { timeZone: IST }),
    isWeekend: parts.weekday === "Saturday" || parts.weekday === "Sunday",
  };
}

/**
 * Whether the Indian market is trading right now.
 *
 * The clock alone can't tell a trading Tuesday from Republic Day, so a weekday inside the
 * session window is only called "open" if the exchange has actually printed a trade today —
 * `lastTradeAt` comes from the live quote feed. That catches exchange holidays without needing
 * a hardcoded holiday calendar to maintain.
 */
export function marketSession(timestamp: number, lastTradeAt: string | null): MarketSession {
  const moment = istMoment(timestamp);

  if (moment.isWeekend) return { state: "weekend", open: false, label: "Closed · weekend" };
  if (moment.minuteOfDay < OPEN_MINUTE) return { state: "pre-open", open: false, label: "Pre-open · opens 09:15 IST" };
  if (moment.minuteOfDay >= CLOSE_MINUTE) return { state: "closed", open: false, label: "Closed · ended 15:30 IST" };

  if (lastTradeAt) {
    const traded = new Date(lastTradeAt);
    if (Number.isNaN(traded.getTime()) || istMoment(traded.getTime()).dateKey !== moment.dateKey) {
      return { state: "holiday", open: false, label: "Closed · exchange holiday" };
    }
  }

  return { state: "open", open: true, label: "Open · live until 15:30 IST" };
}

// One shared interval drives every clock on the page, and it only runs while something is
// subscribed. useSyncExternalStore keeps the value out of component state, so there is no
// setState-in-effect and no hydration mismatch: the server renders 0, which callers treat as
// "not ticking yet".
let currentTick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (timer === null) {
    currentTick = Date.now();
    timer = setInterval(() => {
      currentTick = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentTick;
const getServerSnapshot = () => 0;

/** Current epoch milliseconds, re-rendering the caller once per second. */
export function useClockTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const STATE_STYLE: Record<MarketState, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  "pre-open": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400",
  closed: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400",
  weekend: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400",
  holiday: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400",
};

/** Today's date and a seconds-resolution IST clock, with the current session status. */
export function MarketClock({ lastTradeAt = null, className = "" }: { lastTradeAt?: string | null; className?: string }) {
  const tick = useClockTick();

  // Before the first tick (server render and the hydration pass) there is no trustworthy time
  // to show, so the clock renders a placeholder rather than a stale or mismatched one.
  if (tick === 0) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950 ${className}`}>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Syncing IST clock…</p>
      </div>
    );
  }

  const moment = istMoment(tick);
  const session = marketSession(tick, lastTradeAt);

  return (
    <div className={`rounded-2xl border px-3 py-2 ${STATE_STYLE[session.state]} ${className}`}>
      <p className="text-xs font-medium opacity-80">{moment.dayLabel}</p>
      <p className="text-lg font-semibold tabular-nums">
        {moment.timeLabel} <span className="text-xs font-medium opacity-70">IST</span>
      </p>
      <p className="text-xs font-semibold">{session.label}</p>
    </div>
  );
}
