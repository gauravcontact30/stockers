"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BseBoard } from "../lib/bse-market";
import { formatCrore, formatPercent, moveTone } from "../lib/market-format";
import { formatChangePercent, formatLevel, formatPoints, rangePosition, type IndexQuote } from "./market-indices";

/**
 * The exchange, kept live.
 *
 * ---------------------------------------------------------------------------
 * Two feeds, two cadences, and the card says which is which
 * ---------------------------------------------------------------------------
 *
 * The section is fed by two different things, and conflating them would be the one dishonest move
 * available here:
 *
 *   * The SENSEX strip is a genuinely live quote. It reprints through the session, the server
 *     caches it for a second, and this reads it every second. Every figure on that strip — level,
 *     points, percent, day range, where in the day's range it is sitting — is recomputed from each
 *     new print.
 *
 *   * The breadth, tier and market-cap figures come from the exchange's own Bhavcopy: a settlement
 *     file published per session, not a tape that ticks. Those numbers cannot change every second
 *     because the source does not produce them that way. This board still re-reads them every
 *     second so a new publication is on screen the moment it exists — but the card labels them as
 *     the session's figures rather than dressing them up as live prints.
 *
 * Animating an invented path between two settlement figures would be making up market data, which
 * is the one thing a board like this must never do. So the count-up below only ever walks between
 * two *measured* values, and the per-second motion is on the live strip and the age counter.
 *
 * ---------------------------------------------------------------------------
 * Why the board used to go stale
 * ---------------------------------------------------------------------------
 *
 * It polled on an interval but never read on mount, and the landing page it sits on is itself
 * cached — so a reader could arrive to figures that were already a minute old and watch the "ago"
 * counter climb from there. Worse, `/api/market/bse` answers with `max-age=30`, so a plain `fetch`
 * could be served out of the browser's own cache without the server ever hearing about it, and a
 * failed read was swallowed in silence: the card kept its figures, kept counting, and looked live
 * while being half an hour behind. All three are fixed here — read on mount, `no-store` so a poll
 * is always a real read, and a failure that says so on the card instead of hiding.
 */

/** How often the settlement board is re-read. */
const BOARD_POLL_MS = 1_000;

/** How often the live index strip is re-read. The server caches it for a second either way. */
const LIVE_POLL_MS = 1_000;

/** How long a changed figure stays highlighted. */
const FLASH_MS = 1_200;

/** How long the count-up between two measured values takes. */
const COUNT_MS = 600;

/**
 * How long without a successful read before the card admits it is not live.
 *
 * Five polls. One dropped request on a phone changing cells is not worth a warning; ten seconds of
 * silence is, because by then the figures on screen are no longer evidence of anything.
 */
const STALE_AFTER_MS = 10_000;

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

type IconProps = { className?: string };

const ICON_BASE = "h-3.5 w-3.5 shrink-0";

/** Every icon on this card is drawn the same way: one stroke weight, currentColor, decorative. */
function Icon({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${ICON_BASE} ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ListedIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);

const TradedIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 16H3m0 0 3-3m-3 3 3 3M17 8h4m0 0-3-3m3 3-3 3" />
    <path d="M7 8h10" />
  </Icon>
);

const AdvancingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Icon>
);

const DecliningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </Icon>
);

const UnchangedIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 9h14M5 15h14" />
  </Icon>
);

const MarketCapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 5h9M7 9h9M13 5c3 0 3 4 0 4H7l7 8" />
  </Icon>
);

const TierIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Icon>
);

const PulseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 12h4l3-8 6 16 3-8h4" />
  </Icon>
);

function Figure({
  label,
  value,
  icon: IconComponent,
  tone = "",
  animate = true,
}: {
  label: string;
  value: number;
  icon: (props: IconProps) => React.ReactElement;
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
      {/* The icon sits with the label rather than above the number: it names the row, and putting
          it beside the figure would compete with the one thing on the tile worth reading. */}
      <p className="mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <IconComponent className={tone || undefined} />
        {label}
      </p>
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

/**
 * The SENSEX as it stands this second.
 *
 * Its own strip rather than another tile in the grid, because it is the only thing on the card that
 * is a live print — everything below it is the settlement file. Read from `/api/market/live`, which
 * holds each level for one second on the server, so the rate this costs upstream is bounded by that
 * cache rather than by how many people have the page open.
 */
function LiveIndexStrip({ quote, stale }: { quote: IndexQuote | null; stale: boolean }) {
  const change = quote?.change ?? null;
  const up = (change ?? 0) >= 0;
  const position = quote ? rangePosition(quote.price, quote.dayLow, quote.dayHigh) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
          <PulseIcon className={up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
          SENSEX
          <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
            30 blue chips · live
          </span>
        </p>

        {quote ? (
          <p className="flex items-baseline gap-2 tabular-nums">
            <span className="text-xl font-bold leading-none text-slate-900 dark:text-white">
              {formatLevel(quote.price)}
            </span>
            <span className={`text-xs font-bold ${moveTone(quote.changePercent)}`}>
              {formatPoints(change)} ({formatChangePercent(quote.changePercent)})
            </span>
          </p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {stale ? "Level unavailable" : "Reading the tape…"}
          </p>
        )}
      </div>

      {/* Where in the day's range the level is sitting — recomputed on every print. */}
      {position !== null && quote && (
        <div className="mt-2">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`absolute top-0 h-full w-1 rounded-full transition-[left] duration-700 ease-out ${up ? "bg-emerald-500" : "bg-rose-500"}`}
              style={{ left: `calc(${position}% - 2px)` }}
            />
          </div>
          <p className="mt-1 flex justify-between text-[9px] tabular-nums text-slate-500 dark:text-slate-400">
            <span>Low {formatLevel(quote.dayLow)}</span>
            <span>{Math.round(position)}% of today&apos;s range</span>
            <span>High {formatLevel(quote.dayHigh)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function ExchangeTicker({ initial }: { initial: BseBoard["summary"] }) {
  const [summary, setSummary] = useState(initial);
  const [quote, setQuote] = useState<IndexQuote | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  /** Set when reads have been failing long enough that the figures are no longer evidence. */
  const [stale, setStale] = useState(false);

  // Refs rather than state: the pollers read these to avoid stacking a second request on a slow
  // first one, and doing that through state would restart the timers on every tick.
  const boardInFlight = useRef(false);
  const liveInFlight = useRef(false);
  // Zero until the pollers start, which they do by stamping it: reading the clock during render
  // would make the render impure, and a component that renders differently depending on when it
  // was rendered is exactly what that rule exists to prevent.
  const lastGoodAt = useRef(0);

  /**
   * One read of the settlement board.
   *
   * `no-store` on purpose: the route answers with `max-age=30`, so an ordinary fetch can be served
   * out of the browser's own cache without the server ever hearing about it — which is a poll that
   * cannot discover anything new.
   */
  const readBoard = useCallback(async () => {
    if (boardInFlight.current) return;
    boardInFlight.current = true;

    try {
      const response = await fetch("/api/market/bse", { cache: "no-store" });
      if (!response.ok) throw new Error("refused");

      const board = (await response.json()) as BseBoard;
      if (!board?.summary) throw new Error("no summary");

      setSummary(board.summary);
      setFetchedAt(Date.now());
      setSeconds(0);
      setStale(false);
      lastGoodAt.current = Date.now();
    } catch {
      // The figures stay on screen — they are still the last thing the exchange actually said —
      // but the card stops claiming to be live once the silence is long enough to matter.
      if (Date.now() - lastGoodAt.current >= STALE_AFTER_MS) setStale(true);
    } finally {
      boardInFlight.current = false;
    }
  }, []);

  /** One read of the live index level. Its own failure path: a missing print is not a stale board. */
  const readLive = useCallback(async () => {
    if (liveInFlight.current) return;
    liveInFlight.current = true;

    try {
      const response = await fetch("/api/market/live", { cache: "no-store" });
      if (!response.ok) throw new Error("refused");

      const data = (await response.json()) as { indices?: IndexQuote[] };
      const sensex = data?.indices?.find((index) => index.symbol === "SENSEX");
      if (sensex) setQuote(sensex);
    } catch {
      // Left as it was. The strip keeps the last level it was given rather than blanking, which is
      // what every other board in this app does with a dropped poll.
    } finally {
      liveInFlight.current = false;
    }
  }, []);

  // The per-second tick. Nothing is refetched here — this only moves the "ago" counter.
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - fetchedAt) / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, [fetchedAt]);

  // The polls. Both start with a read, because the page this sits on is itself cached: without it
  // a reader arrives at figures that are already old and watches the counter climb from there.
  useEffect(() => {
    // The clock starts here rather than at render: until a read lands, "how long has this been
    // failing" is measured from the moment the card mounted.
    lastGoodAt.current = Date.now();

    const pollBoard = () => {
      if (document.visibilityState === "hidden") return;
      void readBoard();
    };

    const pollLive = () => {
      if (document.visibilityState === "hidden") return;
      void readLive();
    };

    // Off the effect body: both raise state before they await, and setting state synchronously
    // while an effect runs is a cascading render.
    queueMicrotask(() => {
      pollBoard();
      pollLive();
    });

    const boardTimer = window.setInterval(pollBoard, BOARD_POLL_MS);
    const liveTimer = window.setInterval(pollLive, LIVE_POLL_MS);

    // A reader returning to the tab is the moment the figures are most likely to be stale, so the
    // way back is a read rather than a wait for the next tick.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      pollBoard();
      pollLive();
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(boardTimer);
      window.clearInterval(liveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [readBoard, readLive]);

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
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "animate-live-blink bg-emerald-500"}`}
          />
          The exchange today
        </p>
        <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {summary.sessionDate && <>Session {summary.sessionDate} · </>}
          {/* Announced politely so a screen reader is not interrupted once a second. */}
          <span aria-live="polite">
            {stale ? "Reconnecting — figures may be behind" : `Updated ${agoLabel(seconds)}`}
          </span>
        </p>
      </div>

      <div className="mt-3">
        <LiveIndexStrip quote={quote} stale={stale} />
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
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <AdvancingIcon className="h-3 w-3" />
            {breadth.advancing.toLocaleString("en-IN")} advancing
          </span>
          <span className="text-slate-500 dark:text-slate-400">{Math.round(advanceShare)}% of traded</span>
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            {breadth.declining.toLocaleString("en-IN")} declining
            <DecliningIcon className="h-3 w-3" />
          </span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Listed" value={summary.listed} icon={ListedIcon} animate={false} />
        <Figure label="Traded" value={breadth.traded} icon={TradedIcon} />
        <Figure
          label="Advancing"
          value={breadth.advancing}
          icon={AdvancingIcon}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Figure
          label="Declining"
          value={breadth.declining}
          icon={DecliningIcon}
          tone="text-rose-600 dark:text-rose-400"
        />
        <Figure label="Unchanged" value={breadth.unchanged} icon={UnchangedIcon} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-lg font-bold leading-none tabular-nums text-slate-900 dark:text-white">
            {formatCrore(summary.totalMarketCapCr)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <MarketCapIcon />
            Market cap
          </p>
        </div>

        {TIERS.map((tier) => {
          const stats = summary.byTier[tier.key];
          return (
            <div key={tier.key} className={`rounded-xl border px-3 py-2 ${tier.chrome}`}>
              <p className="flex items-baseline justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${tier.accent}`}>
                  <TierIcon />
                  {tier.label}
                </span>
                <span className={`text-sm font-bold tabular-nums ${moveTone(stats.averageChangePercent)}`}>
                  {formatPercent(stats.averageChangePercent)}
                </span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400">
                <AdvancingIcon className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                {stats.breadth.advancing.toLocaleString("en-IN")} up
                <span aria-hidden="true">·</span>
                <DecliningIcon className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400" />
                {stats.breadth.declining.toLocaleString("en-IN")} down
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[9px] text-slate-400 dark:text-slate-500">
        The SENSEX strip is a live quote and is re-read every second. The counts, tier averages and
        market cap come from the exchange&apos;s own settlement file, which is published per session —
        this board re-reads it every second so a new publication appears the moment it exists, but
        those figures move when the exchange moves them, not once a second.
      </p>
    </section>
  );
}
