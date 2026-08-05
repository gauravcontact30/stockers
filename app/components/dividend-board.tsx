"use client";

import { useState } from "react";
import { formatDayDate, formatRupee, sectorTone } from "./market-format";
import { MarketSection, PillTabs, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed } from "./market-section";

export type Dividend = {
  symbol: string;
  company: string;
  sector: string;
  subject: string;
  kind: string;
  amount: number | null;
  faceValue: number | null;
  percentOfFaceValue: number | null;
  exDate: string | null;
  recordDate: string | null;
  month: string | null;
  upcoming: boolean;
};

export type DividendSector = {
  sector: string;
  dividends: Dividend[];
  upcomingCount: number;
  totalAmount: number;
};

export type DividendBoardData = {
  sectors: DividendSector[];
  total: number;
  upcomingTotal: number;
  today: string;
  live: boolean;
};

const KIND_TONE: Record<string, string> = {
  Interim: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Final: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Special: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Dividend: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function kindTone(kind: string): string {
  return KIND_TONE[kind] ?? KIND_TONE.Dividend;
}

/**
 * Indian companies traditionally declare a dividend as a percentage of face value, which is why
 * "500% dividend" on a ₹2 face value means ₹10 a share. Both are shown so neither misleads.
 */
export function faceValueLabel(percentOfFaceValue: number | null, faceValue: number | null): string | null {
  if (percentOfFaceValue === null || faceValue === null) return null;
  return `${percentOfFaceValue.toFixed(0)}% of ₹${faceValue} face value`;
}

function DividendRow({ dividend }: { dividend: Dividend }) {
  const faceLabel = faceValueLabel(dividend.percentOfFaceValue, dividend.faceValue);

  return (
    <li
      className={`rounded-2xl border p-4 transition ${
        dividend.upcoming
          ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 dark:border-emerald-500/25 dark:bg-emerald-500/5"
          : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{dividend.symbol}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{dividend.company}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
            {dividend.amount === null ? "—" : formatRupee(dividend.amount)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">per share</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindTone(dividend.kind)}`}>{dividend.kind}</span>
        {dividend.month && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {dividend.month}
          </span>
        )}
        {dividend.upcoming ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            UPCOMING
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            EX-DATE PASSED
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[11px] dark:border-slate-800">
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Ex-date</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatDayDate(dividend.exDate)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Record date</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {formatDayDate(dividend.recordDate)}
          </dd>
        </div>
      </dl>

      {faceLabel && <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">{faceLabel}</p>}
    </li>
  );
}

/**
 * Declared dividends grouped by sector, from NSE's corporate-actions feed.
 *
 * The ex-date is the one that matters and is therefore the sort key: buy on or after it and the
 * dividend goes to the seller, not to you.
 */
export function DividendBoard() {
  const { data, loading, error } = useMarketFeed<DividendBoardData>("/api/market/dividends");
  const [active, setActive] = useState<string | null>(null);

  const sectors = data?.sectors ?? [];
  const selected = sectors.find((sector) => sector.sector === active) ?? sectors[0];

  return (
    <MarketSection
      id="dividends"
      eyebrow="Stock dividends"
      eyebrowClass="text-teal-600 dark:text-teal-400"
      title="Declared dividends, sector by sector"
      blurb="Every dividend on NSE's corporate-actions calendar, grouped by sector, with the amount per share, the month and the ex-date you must own the stock before to receive it."
      aside={
        <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-400">
          {data?.upcomingTotal ?? 0} still capturable
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && sectors.length > 0 && selected && (
        <>
          <div className="mt-5">
            <PillTabs
              label="Sector"
              value={selected.sector}
              onChange={setActive}
              options={sectors.map((sector) => ({ key: sector.sector, label: sector.sector, count: sector.dividends.length }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sectorTone(selected.sector)}`}>
              {selected.sector}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{selected.upcomingCount}</span> of{" "}
              <span className="tabular-nums">{selected.dividends.length}</span> still ahead of their ex-date
            </p>
          </div>

          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {selected.dividends.map((dividend) => (
              <DividendRow key={`${dividend.symbol}-${dividend.exDate}-${dividend.subject}`} dividend={dividend} />
            ))}
          </ul>
        </>
      )}

      {!loading && sectors.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          No dividends on NSE&apos;s corporate-actions calendar for the current window.
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 text-xs text-teal-900 dark:border-teal-500/25 dark:bg-teal-500/5 dark:text-teal-200">
        <p className="font-semibold">Reading a dividend</p>
        <p className="mt-1.5">
          You must hold the stock <span className="font-semibold">before</span> the ex-date to receive the payout. Buy on the
          ex-date itself and the dividend goes to the seller. The price also typically falls by roughly the dividend amount
          on that date, so a dividend is not free money — it is part of the stock&apos;s value paid out in cash.
        </p>
      </div>

      <SectionFootnote>
        Declared dividends from NSE India&apos;s corporate-actions calendar · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
