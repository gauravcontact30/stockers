"use client";

import { useMemo } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatCrore, formatQuantity, formatRupee, formatSignedPercent, sectorTone } from "./market-format";
import { MarketSection, Pager, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed, usePaged } from "./market-section";
import type { MostTradedBoard, TradedStock } from "./most-traded";
import type { BoardBrief } from "../lib/board-read";

const PAGE_SIZE = 12;

/** The leveraged-universe board, as figures. */
export function mtfBrief(stocks: TradedStock[], universeSize: number): BoardBrief | null {
  if (stocks.length === 0) return null;

  const rising = stocks.filter((stock) => (stock.changePercent ?? 0) > 0).length;

  return {
    subject: "NSE's most-traded stocks that qualify for margin trading",
    question: "Which of these is the trend actually behind, given leverage magnifies whichever way it goes?",
    facts: [
      { label: "Eligible universe", value: `${universeSize} stocks` },
      { label: "On today's board", value: String(stocks.length) },
      { label: "Trading higher", value: `${rising} of ${stocks.length}` },
    ],
    highlights: stocks
      .slice(0, 4)
      .map(
        (stock) =>
          `${stock.symbol} (${stock.sector ?? "unclassified"}): ${formatSignedPercent(stock.changePercent)} today on ${formatCrore(stock.turnover)} traded`,
      ),
  };
}

function MtfRow({ stock, rank }: { stock: TradedStock; rank: number }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:border-amber-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-amber-500/40">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        {rank}
      </span>

      <CompanyLogo symbol={stock.symbol} size={34} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{stock.symbol}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{stock.name}</p>
        {stock.sector && (
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(stock.sector)}`}>
            {stock.sector}
          </span>
        )}
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Turnover</p>
        <p className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatCrore(stock.turnover)}</p>
        <p className="mt-0.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{formatQuantity(stock.volume)} sh</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(stock.lastPrice)}</p>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(stock.changePercent)}`}>
          {formatSignedPercent(stock.changePercent)}
        </span>
      </div>
    </li>
  );
}

/**
 * Most-traded stocks restricted to the MTF-eligible universe.
 *
 * What this is NOT: a broker's MTF book. How much of a stock was bought *on margin* is private
 * order flow that no exchange or broker publishes. What it IS: NSE's exchange-wide most-active
 * list filtered to the derivatives universe brokers fund on MTF — both halves real, and the
 * section says so rather than implying access to margin data it doesn't have.
 */
export function MtfTraded() {
  const { data, loading, error } = useMarketFeed<MostTradedBoard>("/api/market/most-traded");
  const stocks = useMemo(() => data?.mtf ?? [], [data]);
  const paged = usePaged(stocks, PAGE_SIZE, "mtf");
  const brief = useMemo(() => mtfBrief(stocks, data?.mtfUniverseSize ?? 0), [stocks, data?.mtfUniverseSize]);

  return (
    <MarketSection
      id="mtf"
      eyebrow="MTF watch"
      eyebrowClass="text-amber-600 dark:text-amber-400"
      title="Most traded among MTF-eligible stocks"
      blurb="Margin Trading Facility lets you buy now and pay part later, with the broker funding the rest against the shares as collateral. These are today's most heavily traded names that qualify for it."
      aside={
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          {data?.mtfUniverseSize ?? 0} eligible stocks
        </div>
      }
    >
      <AiBoardRead feature="mtf" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={5} height="h-20" />}

      {!loading && stocks.length > 0 && (
        <>
          <ul className="mt-5 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {paged.slice.map((stock, index) => (
              <MtfRow key={stock.symbol} stock={stock} rank={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit="eligible stocks" />
        </>
      )}

      {!loading && stocks.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          No MTF-eligible stocks in today&apos;s most-active list yet.
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-200">
        <p className="font-semibold">How MTF works, and what it costs</p>
        <ul className="mt-2 space-y-1.5">
          <li>
            <span className="font-semibold">You put up a margin</span> — typically 20-50% of the trade — and the broker funds
            the rest, holding the shares as collateral.
          </li>
          <li>
            <span className="font-semibold">Interest accrues daily</span> on the funded amount, usually around 12-18% a year,
            so MTF is priced for short holds, not long ones.
          </li>
          <li>
            <span className="font-semibold">Losses are leveraged too.</span> If the collateral falls in value the broker issues
            a margin call and can square off the position without waiting for you.
          </li>
          <li>
            <span className="font-semibold">Only approved stocks qualify.</span> SEBI restricts MTF to Group-1 securities;
            eligibility and leverage vary by broker.
          </li>
        </ul>
      </div>

      <SectionFootnote>
        Eligibility is NSE&apos;s derivatives universe; trading data is NSE&apos;s exchange-wide most-active feed. How much of
        each stock was actually bought on margin is private broker data that is not published anywhere, so this is the
        most-traded eligible stocks — not a measure of MTF positions · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
