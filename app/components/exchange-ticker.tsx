"use client";

import { useEffect, useRef, useState } from "react";
import type { BseBoard } from "../lib/bse-market";
import { formatCrore, formatPercent, moveTone } from "../lib/market-format";

/**
 * The exchange summary, kept live.
 *
 * On the cadence, because it is the whole design of this file: the BSE tape behind these figures is
 * cached for fifteen minutes upstream and `/api/market/bse` revalidates every sixty seconds. The
 * numbers therefore *cannot* change every second. Polling at that rate would re-render identical
 * values, and animating movement between them would be inventing market data — which is the one
 * thing a board like this must never do.
 *
 * So the second-by-second motion here is only ever on things that genuinely change every second:
 *
 *   * the "updated N seconds ago" counter, which is real and ticks at 1Hz;
 *   * the count-up between an old figure and a new one, which is a transition between two measured
 *     values rather than a made-up path;
 *   * the flash on a figure that actually moved.
 *
 * The poll itself runs every thirty seconds, which is inside the API's own sixty-second window —
 * so a change is on screen within about half a minute of existing, and a tab left open all day
 * costs one cheap cached request a minute rather than thousands.
 */

/** How often the figures are re-read. Half the API's revalidate window, so nothing is missed late. */
const POLL_MS = 30_000;

/** How long a changed figure stays highlighted. */
const FLASH_MS = 1_200;

/** How long the count-up between two measured values takes. */
const COUNT_MS = 600;

/**
 * Walks a number to its new value over `COUNT_MS`.
 *
 * Both ends are measured figures; only the path between them is animation. `requestAnimationFrame`
 * rather than a timer so it runs at the display's rate and stops dead when the tab is hidden.
 */
export function useCountUp(value: number, enabled = true): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (!enabled) {
      setShown(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const distance = value - origin;
    if (distance === 0) return;

    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_MS);
      // Ease-out: fast off the mark, settling onto the real figure rather than snapping to it.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(origin + distance * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);

  useEffect(() => {
    from.current = value;
  }, [value]);

  return enabled ? shown : value;
}

/** "just now", "14s ago", "3m ago" — the one thing on this card that is genuinely per-second. */
export function agoLabel(seconds: number): string {
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function Figure({
  label,
  value,
  tone = "",
  animate = true,
}: {
  label: string;
  value: number;
  tone?: string;
  animate?: boolean;
}) {
  const shown = useCountUp(value, animate);
  const previous = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === previous.current) return;
    setFlash(value > previous.current ? "up" : "down");
    previous.current = value;

    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div
      className={`rounded-xl border px-3 py-2 transition-colors duration-500 ${
        flash === "up"
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          : flash === "down"
            ? "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <p className={`text-lg font-bold leading-none tabular-nums ${tone || "text-slate-900 dark:text-white"}`}>
        {shown.toLocaleString("en-IN")}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

const TIERS: { key: "Large" | "Mid" | "Small"; label: string; chrome: string; accent: string }[] = [
  {
    key: "Large",
    label: "Large cap",
    chrome: "border-sky-200 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-500/10",
    accent: "text-sky-700 dark:text-sky-300",
  },
  {
    key: "Mid",
    label: "Mid cap",
    chrome: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "Small",
    label: "Small cap",
    chrome: "border-violet-200 bg-violet-50/70 dark:border-violet-500/25 dark:bg-violet-500/10",
    accent: "text-violet-700 dark:text-violet-300",
  },
];

export function ExchangeTicker({ initial }: { initial: BseBoard["summary"] }) {
  const [summary, setSummary] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);

  // The per-second tick. Nothing is refetched here — this only moves the "ago" counter, which is
  // the one figure on the card that really does change every second.
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - fetchedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [fetchedAt]);

  // The poll. Paused while the tab is hidden: a backgrounded page asking the exchange for figures
  // nobody is looking at is battery spent for nothing.
  useEffect(() => {
    let live = true;

    const read = async () => {
      try {
        const response = await fetch("/api/market/bse");
        if (!response.ok) return;
        const board = (await response.json()) as BseBoard;
        if (!live || !board?.summary) return;
        setSummary(board.summary);
        setFetchedAt(Date.now());
        setSeconds(0);
      } catch {
        // A dropped poll is not worth an error banner over a board that is already on screen —
        // the figures simply stay as they are until the next one lands.
      }
    };

    let timer = window.setInterval(read, POLL_MS);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") {
        void read();
        timer = window.setInterval(read, POLL_MS);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const { breadth } = summary;
  // Which way the exchange is leaning, as a share of what actually traded.
  const advanceShare = breadth.traded > 0 ? (breadth.advancing / breadth.traded) * 100 : 0;

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50"
      aria-label="The exchange today"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
          <span aria-hidden="true" className="animate-live-blink inline-block h-2 w-2 rounded-full bg-emerald-500" />
          The exchange today
        </p>
        <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {summary.sessionDate && <>Session {summary.sessionDate} · </>}
          {/* Announced politely so a screen reader is not interrupted once a second. */}
          <span aria-live="polite">Updated {agoLabel(seconds)}</span>
        </p>
      </div>

      {/* Advance/decline as one bar. The single most-read figure on any market board is which way
          the day is leaning, and six separate counts do not say it at a glance. */}
      <div className="mt-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-700 ease-out dark:bg-emerald-400"
            style={{ width: `${advanceShare}%` }}
          />
          <div className="h-full flex-1 bg-rose-500 transition-[width] duration-700 ease-out dark:bg-rose-400" />
        </div>
        <p className="mt-1 flex justify-between text-[9px] font-semibold tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            {breadth.advancing.toLocaleString("en-IN")} advancing
          </span>
          <span className="text-slate-500 dark:text-slate-400">{Math.round(advanceShare)}% of traded</span>
          <span className="text-rose-600 dark:text-rose-400">{breadth.declining.toLocaleString("en-IN")} declining</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Listed" value={summary.listed} animate={false} />
        <Figure label="Traded" value={breadth.traded} />
        <Figure label="Advancing" value={breadth.advancing} tone="text-emerald-600 dark:text-emerald-400" />
        <Figure label="Declining" value={breadth.declining} tone="text-rose-600 dark:text-rose-400" />
        <Figure label="Unchanged" value={breadth.unchanged} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-lg font-bold leading-none tabular-nums text-slate-900 dark:text-white">
            {formatCrore(summary.totalMarketCapCr)}
          </p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Market cap
          </p>
        </div>

        {TIERS.map((tier) => {
          const stats = summary.byTier[tier.key];
          return (
            <div key={tier.key} className={`rounded-xl border px-3 py-2 ${tier.chrome}`}>
              <p className="flex items-baseline justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${tier.accent}`}>{tier.label}</span>
                <span className={`text-sm font-bold tabular-nums ${moveTone(stats.averageChangePercent)}`}>
                  {formatPercent(stats.averageChangePercent)}
                </span>
              </p>
              <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
                {stats.breadth.advancing.toLocaleString("en-IN")} up · {stats.breadth.declining.toLocaleString("en-IN")} down
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[9px] text-slate-400 dark:text-slate-500">
        Figures come from the exchange&apos;s own end-of-session tape, which refreshes upstream every
        fifteen minutes. This board re-reads it every thirty seconds, so a change appears here as soon as it exists.
      </p>
    </section>
  );
}
