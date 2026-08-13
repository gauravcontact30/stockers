"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LivePortfolioRow } from "../api/portfolio/live/route";
import { formatMoney, formatPercent, formatSignedMoney, toneFor } from "../lib/portfolio-metrics";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
import { marketSession, useClockTick } from "./market-clock";
import { CARD, EmptyPanel, ErrorNote, LABEL, PanelHeading, Tile } from "./portfolio-chrome";
import { StockDetailTrigger } from "./stock-detail-provider";
import { authHeaders } from "./subscription-provider";
import type { BoardBrief } from "../lib/board-read";

/**
 * The book, live.
 *
 * The holdings grid is drawn from the performance endpoint, which carries a year of history and is
 * cached for a minute — right for a card showing 1M/6M/1Y returns, and wrong for anything claiming
 * to tick. This polls a separate endpoint that carries the last print and nothing else, so the
 * numbers here move while the reader watches them.
 *
 * The poll rate follows the exchange rather than a fixed timer, which is the only honest way to do
 * it: five seconds while the market is trading, and once every two minutes when it is not. A closed
 * market reprints nothing, so a five-second poll after 15:30 would be the page spending the
 * reader's battery to re-fetch a number that cannot have changed.
 */

const OPEN_POLL_MS = 5_000;
const CLOSED_POLL_MS = 120_000;

export type LivePayload = {
  rows: LivePortfolioRow[];
  asOf: string;
  tradedToday: number;
  lastTradeAt: string | null;
};

export type LiveTotals = {
  value: number;
  dayChange: number;
  dayChangePercent: number;
  /** Owned positions the feed could price. */
  priced: number;
  /** Owned positions it could not — excluded from the totals, so the panel says so. */
  unpriced: number;
};

/**
 * The book's live value and today's move across it.
 *
 * Tracked rows — quantity zero — contribute nothing and are not counted as unpriced: they are not
 * positions, and reporting them as gaps in the totals would make a complete book look broken.
 */
export function liveTotals(rows: LivePortfolioRow[]): LiveTotals {
  const owned = rows.filter((row) => row.quantity > 0);
  const priced = owned.filter((row) => row.price !== null);

  const value = priced.reduce((sum, row) => sum + row.quantity * (row.price as number), 0);
  const dayChange = priced.reduce(
    (sum, row) => (row.previousClose === null ? sum : sum + row.quantity * ((row.price as number) - row.previousClose)),
    0,
  );
  const opened = value - dayChange;

  return {
    value,
    dayChange,
    dayChangePercent: opened > 0 ? (dayChange / opened) * 100 : 0,
    priced: priced.length,
    unpriced: owned.length - priced.length,
  };
}

/** Where today's price sits between the session's low and high, 0-1. Null without a full range. */
export function dayRangePosition(row: LivePortfolioRow): number | null {
  if (row.price === null || row.dayLow === null || row.dayHigh === null) return null;
  const span = row.dayHigh - row.dayLow;
  if (span <= 0) return null;
  return Math.max(0, Math.min(1, (row.price - row.dayLow) / span));
}

/** The live tape's figures, in the shape the board-read endpoint narrates. */
export function liveBrief(rows: LivePortfolioRow[], totals: LiveTotals, sessionLabel: string): BoardBrief | null {
  const moving = rows.filter((row) => row.changePercent !== null);
  if (moving.length === 0) return null;

  const ranked = [...moving].sort((a, b) => (b.changePercent as number) - (a.changePercent as number));
  const advancing = moving.filter((row) => (row.changePercent as number) > 0).length;

  const facts = [
    { label: "Live value", value: formatMoney(totals.value) },
    { label: "Today", value: `${formatSignedMoney(totals.dayChange)} (${formatPercent(totals.dayChangePercent)})` },
    { label: "Breadth", value: `${advancing} up, ${moving.length - advancing} down of ${moving.length}` },
    { label: "Session", value: sessionLabel },
  ];

  const highlights = [
    `${ranked[0].symbol} leads the book today at ${formatPercent(ranked[0].changePercent)}.`,
    ...(ranked.length > 1
      ? [`${ranked[ranked.length - 1].symbol} lags at ${formatPercent(ranked[ranked.length - 1].changePercent)}.`]
      : []),
  ];

  for (const row of ranked.slice(0, 3)) {
    if (row.quantity <= 0 || row.price === null || row.previousClose === null) continue;
    highlights.push(
      `${row.symbol} moved ${formatSignedMoney(row.quantity * (row.price - row.previousClose))} across ${row.quantity} shares.`,
    );
  }

  if (totals.unpriced > 0) {
    highlights.push(`${totals.unpriced} owned position(s) have no live print and are outside these totals.`);
  }

  return {
    subject: "one investor's own holdings on today's live exchange tape",
    question: "What is actually moving the book right now, and is any of it worth acting on today?",
    facts,
    highlights,
  };
}

/** One position on the tape. */
function LiveRow({ row }: { row: LivePortfolioRow }) {
  const position = dayRangePosition(row);
  const dayPnl = row.price !== null && row.previousClose !== null ? row.quantity * (row.price - row.previousClose) : null;

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800">
      <CompanyLogo symbol={row.symbol} size={30} />

      <div className="min-w-0 flex-1 basis-32">
        <StockDetailTrigger symbol={row.symbol}>
          <span className="text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
            {row.symbol}
          </span>
        </StockDetailTrigger>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {row.quantity > 0 ? `${row.quantity} shares` : "Tracked only"}
          {/* A dot rather than the word "live": the badge is repeated on every row and the word
              would out-shout the prices it is annotating. */}
          {row.live && <span aria-label="printed today" className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />}
        </p>
      </div>

      {/* The session's range, with a marker where the last print landed. A price alone does not say
          whether it is near the day's high or scraping its low, which is the thing a live tape is
          being watched for. */}
      <div className="hidden w-32 shrink-0 sm:block">
        {position === null ? (
          <p className="text-center text-[10px] text-slate-300 dark:text-slate-600">No range</p>
        ) : (
          <>
            <div className="relative h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-slate-900 dark:bg-white"
                style={{ left: `calc(${position * 100}% - 2px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] tabular-nums text-slate-400 dark:text-slate-500">
              <span>{formatMoney(row.dayLow)}</span>
              <span>{formatMoney(row.dayHigh)}</span>
            </div>
          </>
        )}
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(row.price)}</p>
        <p className={`font-mono text-[11px] font-bold tabular-nums ${toneFor(row.changePercent)}`}>
          {formatPercent(row.changePercent)}
        </p>
      </div>

      <div className="w-28 shrink-0 text-right">
        <p className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
          {row.quantity > 0 && row.price !== null ? formatMoney(row.quantity * row.price) : "—"}
        </p>
        <p className={`font-mono text-[11px] font-bold tabular-nums ${toneFor(dayPnl)}`}>{formatSignedMoney(dayPnl)}</p>
      </div>
    </li>
  );
}

export function PortfolioLive({ hasHoldings }: { hasHoldings: boolean }) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const tick = useClockTick();
  const session = useMemo(() => marketSession(tick, payload?.lastTradeAt ?? null), [tick, payload?.lastTradeAt]);

  // Mirrored into a ref so the poll loop can read the current cadence without listing the clock in
  // its dependencies — at one tick a second, that would tear the timer down and rebuild it before
  // it ever fired. Written in an effect rather than during render, which is not a safe place to
  // mutate a ref.
  const openRef = useRef(session.open);
  useEffect(() => {
    openRef.current = session.open;
  }, [session.open]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/portfolio/live", { headers: authHeaders(), signal });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't reach the live feed.");
        return;
      }
      setPayload(data);
      setError(null);
    } catch {
      // An abort lands here too, on a component that is going away — setting state on it is
      // harmless in React 19 and the alternative is a flag every branch has to remember.
      if (!signal?.aborted) setError("Couldn't reach the live feed.");
    }
  }, []);

  useEffect(() => {
    if (!hasHoldings) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(async () => {
        // A hidden tab is a tab nobody is reading. Polling it burns the reader's battery and the
        // upstream feed's rate limit to update pixels that are not on screen.
        if (!paused && document.visibilityState === "visible") await load(controller.signal);
        if (!controller.signal.aborted) schedule();
      }, openRef.current ? OPEN_POLL_MS : CLOSED_POLL_MS);
    };

    load(controller.signal);
    schedule();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasHoldings, load, paused]);

  // Memoised rather than defaulted inline: a fresh `[]` on every render would be a new dependency
  // for both memos below, so neither would ever hit.
  const rows = useMemo(() => payload?.rows ?? [], [payload]);
  const totals = useMemo(() => liveTotals(rows), [rows]);
  const brief = useMemo(() => liveBrief(rows, totals, session.label), [rows, totals, session.label]);

  if (!hasHoldings) {
    return <EmptyPanel>Add a holding and this tape follows it print by print while the exchange is open.</EmptyPanel>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Live tape"
          blurb={`Last prints straight from the exchange feed, refreshed every ${session.open ? "5 seconds" : "2 minutes"} while this tab is open.`}
          aside={
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
                  session.open
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${session.open ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
                {session.label}
              </span>
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {paused ? "Resume" : "Pause"}
              </button>
            </div>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Live value" value={formatMoney(totals.value)} hint={`${totals.priced} priced positions`} />
          <Tile
            label="Today"
            value={formatSignedMoney(totals.dayChange)}
            hint={formatPercent(totals.dayChangePercent)}
            tone={toneFor(totals.dayChange)}
          />
          <Tile
            label="Printed today"
            value={`${payload?.tradedToday ?? 0}/${rows.length}`}
            hint="Stocks that traded this session"
          />
          <Tile
            label="Last update"
            value={payload ? new Date(payload.asOf).toLocaleTimeString("en-IN", { hour12: false }) : "—"}
            hint={paused ? "Paused" : "IST"}
          />
        </div>

        {totals.unpriced > 0 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {totals.unpriced} owned position(s) had no print on this feed and sit outside the figures above.
          </p>
        )}

        {payload === null ? (
          <p className={`mt-5 ${LABEL}`}>Connecting to the feed…</p>
        ) : rows.length === 0 ? (
          <EmptyPanel>Nothing to follow yet.</EmptyPanel>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            {rows.map((row) => (
              <LiveRow key={row.symbol} row={row} />
            ))}
          </ul>
        )}

        <AiGate feature="portfolio" label="AI portfolio review">
          <AiBoardRead feature="portfolio" brief={brief} />
        </AiGate>
      </section>
    </div>
  );
}
