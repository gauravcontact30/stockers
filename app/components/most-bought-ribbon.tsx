"use client";

// The rotating ribbon under the landing slider: what Indian investors are buying today, in order.
//
// It used to carry the week's strongest large caps — a return ranking, which says what *has*
// happened rather than what is being bought now. This carries one thing instead: the buying board
// from `../lib/most-bought`, whose rank blends the brokers' own published most-bought lists with
// the live tape (how many separate trades, how retail-sized they are, how much money, how hard the
// stock is being marked up). Only stocks trading above their previous close are eligible, so every
// card here is a stock on the bid.
//
// The server sends the opening board so it is in the HTML; from then on this polls, because the
// claim it makes — "today, live" — is one a static list cannot keep. Nothing is invented when the
// poll fails: the last good board stays on screen.

import { useEffect, useRef, useState } from "react";
import type { MostBoughtBoard, MostBoughtRow, MostBoughtSignal } from "../lib/most-bought";
import { CompanyLogo } from "./company-logo";
import { istMoment, useClockTick } from "./market-clock";
import { formatQuantity, formatRupee, formatSignedPercent } from "./market-format";
import { SectorPill } from "./sector-pill";

const ENDPOINT = "/api/market/most-bought";
/**
 * The board's own cache is 30s; polling faster than it would only re-fetch the same rows.
 *
 * The same number the server puts on `board.refreshMs`, and the ribbon prefers the server's copy
 * once a board has arrived — this is only the cadence to poll at before the first one has.
 */
const REFRESH_MS = 30_000;

const RANK_TONES = [
  "border-emerald-200 bg-emerald-50 text-emerald-900",
  "border-sky-200 bg-sky-50 text-sky-900",
  "border-violet-200 bg-violet-50 text-violet-900",
  "border-amber-200 bg-amber-50 text-amber-900",
  "border-rose-200 bg-rose-50 text-rose-900",
  "border-teal-200 bg-teal-50 text-teal-900",
] as const;

/** Every chip is a fact about why the row ranks, never an adjective. */
const SIGNAL_LABEL: Record<MostBoughtSignal, string> = {
  "broker-list": "On a broker's most-bought list",
  "retail-sized-trades": "Retail-sized trades",
  "crowded-tape": "Crowded tape",
  "heavy-turnover": "Heavy turnover",
  "strong-move": "Strong move",
};

const SESSION_NOTE: Record<MostBoughtBoard["marketSession"], string> = {
  "pre-open": "Pre-open: buying ranks from the last completed BSE session, live from 9:15 AM IST.",
  live: "Live BSE session: buying ranks update as the tape does.",
  closed: "Market closed: where the buying ranks finished today.",
  holiday: "No BSE session today: the last completed session's buying ranks.",
};

/**
 * What the ribbon says about the calendar, given the clock and the board.
 *
 * It no longer names the session the ranks came from: the freshness chip beside it does that, and
 * two chips naming the same date on one strip was one too many.
 *
 * The state comes from the board rather than being re-derived here: the server knows whether the
 * exchange actually printed a trade today, which is the only way to tell a holiday from an
 * ordinary Tuesday without shipping a holiday calendar to the browser and keeping it current. The
 * clock's job is narrower and is the half a static board cannot do - saying what day and second it
 * is in IST, which is the timezone every figure on this ribbon is quoted in.
 */
const SESSION_STATUS: Record<MostBoughtBoard["marketSession"], string> = {
  "pre-open": "Pre-open · opens 09:15 IST",
  live: "Open · live until 15:30 IST",
  closed: "Closed · ended 15:30 IST",
  holiday: "Closed · exchange holiday",
};

const SESSION_TONE: Record<MostBoughtBoard["marketSession"], string> = {
  "pre-open": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  closed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  holiday: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** `2026-08-14` -> `14 Aug 2026`. Returns null for a board that never named its session. */
function sessionDateLabel(sessionDate: string | null): string | null {
  if (!sessionDate) return null;
  const parsed = new Date(`${sessionDate}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

/**
 * An instant as a full IST date and time — `Wed, 20 Aug 2026, 09:15 AM IST`.
 *
 * Spelled out in full rather than as "in 4 hours", because the question this answers is "when will
 * what I am looking at stop being yesterday's", and a relative phrase makes a reader do the
 * arithmetic against a timezone that may not be their own. Null in, null out; an unparseable
 * instant is the same as none.
 */
export function instantLabel(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Which day's figures the ribbon is actually showing, and how it says so.
 *
 * The one thing a reader cannot tell by looking: a ribbon of rising stocks looks identical whether
 * those are this minute's prices or Friday's closes. The board decides — it is the only side that
 * knows whether a live quote was laid over the tape — and this turns that decision into the chip.
 *
 * "Yesterday" is never asserted from the date arithmetic: the chip names the session's own date, so
 * a board sitting on a Friday close over a long weekend reads correctly rather than claiming to be
 * one day old.
 */
export function freshnessChip(board: MostBoughtBoard): { label: string; tone: string; live: boolean } {
  if (board.freshness === "live") {
    return {
      label: `Live · today's prices, ${board.liveRows} of ${board.rows.length} quoted live`,
      tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
      live: true,
    };
  }

  const from = sessionDateLabel(board.dataDay);
  return {
    label: from ? `Stale · last completed session, ${from}` : "Stale · last completed BSE session",
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
    live: false,
  };
}

/** What the "next update" chip says, given what the board is currently showing. */
export function nextUpdateLabel(board: MostBoughtBoard): string {
  const at = instantLabel(board.nextUpdateAt);
  if (!at) return "Next update · when the exchange next opens";

  return board.freshness === "live"
    ? `Next refresh · ${at} IST (every ${Math.round(board.refreshMs / 1000)}s while open)`
    : `Next update · ${at} IST, when the market opens`;
}

/**
 * Why the exchange is shut, when it is - and nothing when it is not.
 *
 * A weekend is the one closure the browser can name on its own, so it is named: "closed today"
 * beside a Sunday date is a worse answer than "closed for the weekend". A holiday is only ever
 * reported on the board's authority, never guessed from the date.
 */
function closureNote(board: MostBoughtBoard, weekday: string, isWeekend: boolean): string | null {
  if (isWeekend) return `Weekend · BSE is shut on Saturday and Sunday, so there is no ${weekday} session`;
  if (board.marketSession === "holiday") return "Exchange holiday · the BSE did not trade today";
  return null;
}

/** Today's IST date, a ticking clock, and what the exchange is doing right now. */
function RibbonClock({ board }: { board: MostBoughtBoard }) {
  const tick = useClockTick();

  // Before the first tick - the server render and the hydration pass - there is no trustworthy
  // time to print. Showing one anyway is either a stale server clock or a hydration mismatch, so
  // the strip waits and the session chip alone carries the state.
  if (tick === 0) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal ${SESSION_TONE[board.marketSession]}`}>
        {SESSION_STATUS[board.marketSession]}
      </span>
    );
  }

  const moment = istMoment(tick);
  const closure = closureNote(board, moment.weekday, moment.isWeekend);

  return (
    <>
      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
        {moment.dayLabel}
      </span>
      <span
        className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black tabular-nums normal-case tracking-normal text-slate-900 dark:bg-slate-950/60 dark:text-white"
        // The seconds change every tick; announcing each one would make the ribbon unusable with a
        // screen reader, so the live region is off and the status chip beside it carries meaning.
        aria-live="off"
      >
        {moment.timeLabel} IST
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal ${SESSION_TONE[board.marketSession]}`}>
        {SESSION_STATUS[board.marketSession]}
      </span>
      {closure && (
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
          {closure}
        </span>
      )}
    </>
  );
}

function rankTone(rank: number): string {
  return RANK_TONES[(rank - 1) % RANK_TONES.length];
}

function shortName(name: string, symbol: string): string {
  const compact = name
    .replace(/\b(?:Limited|Ltd\.?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = compact || symbol;
  return base.length <= 24 ? base : `${base.slice(0, 21).trim()}...`;
}

function tradesLabel(row: MostBoughtRow): string {
  if (typeof row.trades !== "number" || !Number.isFinite(row.trades)) return "Trades -";
  return `${formatQuantity(row.trades)} trades`;
}

function brokerLabel(row: MostBoughtRow): string | null {
  if (row.brokerRank === null || row.brokerNames.length === 0) return null;
  return `#${row.brokerRank} on ${row.brokerNames[0]}`;
}

function cardTitle(row: MostBoughtRow): string {
  const broker = brokerLabel(row);
  return [
    `#${row.buyRank} most bought today: ${row.name} (${row.symbol})`,
    `buy score ${row.buyScore}/100`,
    tradesLabel(row),
    broker,
    ...row.signals.map((signal) => SIGNAL_LABEL[signal]),
  ]
    .filter(Boolean)
    .join(" · ");
}

function BuyCard({ row, duplicate, eager }: { row: MostBoughtRow; duplicate: boolean; eager: boolean }) {
  const broker = brokerLabel(row);

  return (
    <span
      className={`inline-grid min-h-[104px] w-fit max-w-[90vw] shrink-0 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-2xl border px-3 py-2.5 shadow-[0_14px_35px_-24px_rgba(15,23,42,0.65)] ring-1 ring-white/70 ${rankTone(row.buyRank)}`}
      title={cardTitle(row)}
      aria-hidden={duplicate}
    >
      <CompanyLogo symbol={row.symbol} size={46} eager={eager} preferReal />
      <span className="min-w-0 max-w-[190px]">
        <span className="block truncate text-[15px] leading-tight font-black tracking-normal">{shortName(row.name, row.symbol)}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-none font-black uppercase text-slate-500">{row.symbol}</span>
      </span>

      <span className="col-start-1 row-start-2 flex justify-center">
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-black tabular-nums text-slate-900 shadow-sm">
          #{row.buyRank}
        </span>
      </span>

      <span className="col-start-2 flex min-w-0 items-center gap-1.5">
        <SectorPill sector={row.sector} className="min-w-0 max-w-[108px] px-2 py-0.5 text-[9px]" />
        <span className="shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-700 shadow-sm">
          {formatRupee(row.price)}
        </span>
        <span
          className={`shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black tabular-nums shadow-sm ${
            (row.changePercent ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {formatSignedPercent(row.changePercent)}
        </span>
      </span>

      <span className="col-start-2 flex min-w-0 items-center gap-1.5 pt-0.5">
        <span className="shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
          Buy score {row.buyScore}
        </span>
        <span className="min-w-0 truncate rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
          {broker ?? tradesLabel(row)}
        </span>
        {row.live && (
          <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-700 shadow-sm">
            Live
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The buying ribbon, seeded by the server and kept current by polling.
 *
 * Rendered twice so the marquee loops without a seam; the second pass is hidden from assistive
 * technology rather than read out again. Empty in, nothing out — there is no invented fallback row.
 */
export function MostBoughtRibbon({ initial }: { initial?: MostBoughtBoard | null }) {
  const [board, setBoard] = useState<MostBoughtBoard | null>(initial ?? null);
  const lastGood = useRef<MostBoughtBoard | null>(initial ?? null);
  const pollMs = board?.refreshMs ?? REFRESH_MS;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store" });
        if (!response.ok) throw new Error(`Most-bought board responded with ${response.status}`);
        const next = (await response.json()) as MostBoughtBoard;
        if (!cancelled && next.rows.length > 0) {
          lastGood.current = next;
          setBoard(next);
        }
      } catch {
        // A failed poll is not a reason to empty the ribbon: the previous board is still the last
        // thing the exchange actually said.
        if (!cancelled) setBoard(lastGood.current);
      }
    };

    // Polling stops while the tab is in the background. A ribbon nobody is looking at does not
    // need re-ranking, and the work it saves — a request, a parse, a re-render of twenty-four
    // cards — is main-thread time that would otherwise be charged to whatever the reader *is*
    // looking at. The board is refreshed once on return, so it is never stale on screen.
    const tick = () => {
      if (!document.hidden) void load();
    };

    const timer = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
    // Re-armed when the server's cadence changes, which in practice means once — the first board to
    // arrive carries it. The ribbon promises the reader a next-refresh time on that number, so it
    // has to poll at it rather than at a copy of its own that could drift.
  }, [pollMs]);

  // Nothing to show yet — the server read missed its deadline and the first poll has not answered.
  // The space the ribbon will occupy is held open rather than left to collapse, because the rows
  // arriving into a zero-height slot would push the whole page down under the reader, which is a
  // layout shift the reader is charged for and a card that appears from nowhere.
  if (!board || board.rows.length === 0) {
    return (
      <div
        className="h-[136px] rounded-2xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-500/5"
        aria-hidden="true"
      />
    );
  }

  const rows = board.rows;
  const freshness = freshnessChip(board);

  return (
    <div
      className="hover-pause-marquee overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
      aria-label="Most bought BSE stocks today, ranked; ribbon rotates continuously, hover to pause"
    >
      <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
        Most bought today
        {/* Which day's figures these are, first — before the clock and before the session note.
            Everything else on this strip describes the exchange; this one describes the cards. */}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black normal-case tracking-normal ${freshness.tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${freshness.live ? "animate-live-blink bg-emerald-500" : "bg-amber-500"}`} />
          {freshness.label}
        </span>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
          {nextUpdateLabel(board)}
        </span>
        <RibbonClock board={board} />
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
          {SESSION_NOTE[board.marketSession]}
        </span>
      </p>
      <div className="flex w-max animate-hero-ribbon-marquee gap-3 text-[12px] font-semibold whitespace-nowrap">
        {[0, 1].map((pass) =>
          rows.map((row) => (
            <BuyCard key={`${pass}-${row.symbol}`} row={row} duplicate={pass === 1} eager={pass === 0 && row.buyRank <= 3} />
          )),
        )}
      </div>
    </div>
  );
}
