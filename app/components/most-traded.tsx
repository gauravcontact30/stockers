"use client";

import { useMemo, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CompanyLogo } from "./company-logo";
import {
  chipFor,
  formatCrore,
  formatQuantity,
  formatRupee,
  formatSignedPercent,
  sectorTone,
  toneFor,
} from "./market-format";
import {
  MarketSection,
  Pager,
  PillTabs,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  usePaged,
} from "./market-section";
import type { BoardBrief } from "../lib/board-read";

export type TradedStock = {
  symbol: string;
  name: string;
  sector: string | null;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  volume: number | null;
  turnover: number | null;
  mtfEligible: boolean;
};

export type MostTradedBoard = {
  byVolume: TradedStock[];
  byValue: TradedStock[];
  mtf: TradedStock[];
  mtfUniverseSize: number;
  live: boolean;
};

type RankKey = "byValue" | "byVolume";

/**
 * Where today's close sits between the 52-week low and high, 0-100. Returns null when either end
 * is missing or the band has no width, rather than drawing a meaningless full or empty bar.
 */
export function yearBandPosition(price: number | null, low: number | null, high: number | null): number | null {
  if (typeof price !== "number" || typeof low !== "number" || typeof high !== "number") return null;
  if (!(high > low)) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

export function TradedRow({ stock, rank }: { stock: TradedStock; rank: number }) {
  const band = yearBandPosition(stock.lastPrice, stock.yearLow, stock.yearHigh);

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {rank}
          </span>
          <CompanyLogo symbol={stock.symbol} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{stock.symbol}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{stock.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {stock.sector && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(stock.sector)}`}>
                  {stock.sector}
                </span>
              )}
              {stock.mtfEligible && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                  MTF
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(stock.lastPrice)}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(stock.changePercent)}`}>
            {formatSignedPercent(stock.changePercent)}
          </span>
          <p className={`mt-0.5 text-[11px] font-semibold tabular-nums ${toneFor(stock.change)}`}>
            {formatRupee(stock.change)}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[11px] sm:grid-cols-4 dark:border-slate-800">
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Turnover</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatCrore(stock.turnover)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Volume</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatQuantity(stock.volume)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Day range</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {formatRupee(stock.dayLow)} – {formatRupee(stock.dayHigh)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Prev close</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatRupee(stock.previousClose)}</dd>
        </div>
      </dl>

      {band !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span className="tabular-nums">52w low {formatRupee(stock.yearLow)}</span>
            <span className="tabular-nums">52w high {formatRupee(stock.yearHigh)}</span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
            <span
              className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 dark:bg-white"
              style={{ left: `${band}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </li>
  );
}

const RANK_OPTIONS: { key: RankKey; label: string }[] = [
  { key: "byValue", label: "By turnover (₹)" },
  { key: "byVolume", label: "By volume (shares)" },
];

// Two columns of six — a full screen of cards without the section running away down the page.
const PAGE_SIZE = 12;

/** What the turnover board says, in the figures already on screen. */
export function tradedBrief(stocks: TradedStock[], rank: RankKey): BoardBrief | null {
  if (stocks.length === 0) return null;

  const turnover = stocks.reduce((sum, stock) => sum + (stock.turnover ?? 0), 0);
  const advancing = stocks.filter((stock) => (stock.changePercent ?? 0) > 0).length;

  return {
    subject: `NSE's most actively traded stocks, ranked ${rank === "byValue" ? "by rupee turnover" : "by shares traded"}`,
    question: "Where did the day's money actually go, and was it buying or selling?",
    facts: [
      { label: "Stocks on the board", value: String(stocks.length) },
      { label: "Combined turnover", value: formatCrore(turnover) },
      { label: "Rising on heavy volume", value: `${advancing} of ${stocks.length}` },
    ],
    highlights: stocks
      .slice(0, 4)
      .map(
        (stock) =>
          `${stock.symbol} (${stock.sector ?? "unclassified"}): ${formatCrore(stock.turnover)} traded, ${formatSignedPercent(stock.changePercent)} on the day`,
      ),
  };
}

/**
 * The exchange-wide most-traded board.
 *
 * Groww's own "Most traded" list is its private order flow and has no public API, so this is
 * ranked from NSE's exchange-wide most-active feed instead — the same trades, counted across
 * every broker rather than one.
 */
export function MostTraded() {
  const { data, loading, error } = useMarketFeed<MostTradedBoard>("/api/market/most-traded");
  const [rank, setRank] = useState<RankKey>("byValue");

  const stocks = useMemo(() => data?.[rank] ?? [], [data, rank]);
  // Ranks carry on across pages: row one of page two is the 13th most traded, not the first.
  const paged = usePaged(stocks, PAGE_SIZE, rank);
  const brief = useMemo(() => tradedBrief(stocks, rank), [stocks, rank]);

  return (
    <MarketSection
      id="most-traded"
      eyebrow="Most traded"
      title="Where the money went today"
      blurb="The most heavily traded stocks on NSE, ranked either by the rupee value that changed hands or by the number of shares. Every figure is exchange-reported, not a broker's private list."
      aside={
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {stocks.length} most active
        </div>
      }
    >
      <div className="mt-5">
        <PillTabs options={RANK_OPTIONS} value={rank} onChange={setRank} label="Ranking method" />
      </div>

      <AiBoardRead feature="most-traded" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && stocks.length > 0 && (
        <>
          <ul className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {paged.slice.map((stock, index) => (
              <TradedRow key={stock.symbol} stock={stock} rank={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit="stocks" />
        </>
      )}

      {!loading && stocks.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          NSE hasn&apos;t published a most-active list yet today — it fills in once trading begins.
        </p>
      )}

      <SectionFootnote>
        Ranked from NSE&apos;s exchange-wide most-active securities feed. Groww does not publish its own most-traded list,
        so this covers trading across all brokers rather than any single one · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
