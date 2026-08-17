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
import { formatQuantity, formatRupee, formatSignedPercent } from "./market-format";
import { SectorPill } from "./sector-pill";

const ENDPOINT = "/api/market/most-bought";
/** The board's own cache is 30s; polling faster than it would only re-fetch the same rows. */
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

    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

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

  return (
    <div
      className="hover-pause-marquee overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
      aria-label="Most bought BSE stocks today, ranked; ribbon rotates continuously, hover to pause"
    >
      <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
        Most bought today
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
