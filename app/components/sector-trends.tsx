"use client";

import { useMemo } from "react";
import { AiBoardRead } from "./ai-board-read";
import { chipFor, formatSignedPercent, toneFor } from "./market-format";
import { MarketSection, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed } from "./market-section";
import type { BoardBrief } from "../lib/board-read";

export type SectorTrend = {
  symbol: string;
  name: string;
  last: number | null;
  change: number | null;
  changePercent: number | null;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  peRatio: number | null;
  changePercent30d: number | null;
  changePercent365d: number | null;
  yearHigh: number | null;
  yearLow: number | null;
};

export type SectorBoard = { sectors: SectorTrend[]; live: boolean };

/** Index levels carry no rupee sign — they are point values, not prices. */
export function formatLevel(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Bar width for a sector's move, scaled against the strongest move on the board so the leader
 * fills the bar and everything else is read relative to it. Falls back to 0 when there is no
 * spread to scale against.
 */
export function barWidth(value: number | null, largest: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || largest <= 0) return 0;
  return Math.min(100, (Math.abs(value) / largest) * 100);
}

/**
 * The board as figures the AI desk can read: how wide the rotation was, and which indices sat at
 * each end of it. Only what is already on screen goes in.
 */
export function sectorBrief(sectors: SectorTrend[]): BoardBrief | null {
  if (sectors.length === 0) return null;

  const advancing = sectors.filter((sector) => (sector.changePercent ?? 0) > 0).length;
  const leader = sectors[0];
  const laggard = sectors[sectors.length - 1];

  return {
    subject: "Every NSE sectoral index, ranked by today's move",
    question: "Which way did money rotate today, and how broad was the move?",
    facts: [
      { label: "Sectors advancing", value: `${advancing} of ${sectors.length}` },
      { label: "Leading sector", value: `${leader.name} ${formatSignedPercent(leader.changePercent)}` },
      { label: "Lagging sector", value: `${laggard.name} ${formatSignedPercent(laggard.changePercent)}` },
      { label: "Spread, best to worst", value: `${((leader.changePercent ?? 0) - (laggard.changePercent ?? 0)).toFixed(2)} pts` },
    ],
    highlights: sectors
      .slice(0, 4)
      .map(
        (sector) =>
          `${sector.name}: ${formatSignedPercent(sector.changePercent)} today, ${formatSignedPercent(sector.changePercent30d)} over a month, ${formatSignedPercent(sector.changePercent365d)} over a year`,
      ),
  };
}

export function breadthShare(advances: number | null, declines: number | null): number | null {
  if (typeof advances !== "number" || typeof declines !== "number") return null;
  const total = advances + declines;
  if (total <= 0) return null;
  return (advances / total) * 100;
}

function SectorRow({ sector, largest }: { sector: SectorTrend; largest: number }) {
  const width = barWidth(sector.changePercent, largest);
  const up = (sector.changePercent ?? 0) >= 0;
  const share = breadthShare(sector.advances, sector.declines);

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{sector.name}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{formatLevel(sector.last)}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${chipFor(sector.changePercent)}`}>
            {formatSignedPercent(sector.changePercent)}
          </span>
          <p className={`mt-1 text-[11px] font-semibold tabular-nums ${toneFor(sector.change)}`}>
            {formatLevel(sector.change)} pts
          </p>
        </div>
      </div>

      {/* Bars grow from the centre line so gainers and losers read as opposite directions rather
          than as different lengths of the same thing. */}
      <div className="relative mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <span className="absolute left-1/2 top-0 h-2 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
        <span
          className={`absolute top-0 h-2 ${up ? "left-1/2 rounded-r-full bg-emerald-500" : "right-1/2 rounded-l-full bg-rose-500"}`}
          style={{ width: `${width / 2}%` }}
          aria-hidden="true"
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[11px] sm:grid-cols-4 dark:border-slate-800">
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Advances</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{sector.advances ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Declines</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rose-600 dark:text-rose-400">{sector.declines ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">1 month</dt>
          <dd className={`mt-0.5 font-semibold tabular-nums ${toneFor(sector.changePercent30d)}`}>
            {formatSignedPercent(sector.changePercent30d)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">1 year</dt>
          <dd className={`mt-0.5 font-semibold tabular-nums ${toneFor(sector.changePercent365d)}`}>
            {formatSignedPercent(sector.changePercent365d)}
          </dd>
        </div>
      </dl>

      {share !== null && (
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="tabular-nums">{share.toFixed(0)}%</span> of the index&apos;s stocks are advancing
        </p>
      )}
    </li>
  );
}

/**
 * Sector performance from NSE's own sectoral indices, sorted strongest to weakest.
 *
 * These are the official cap-weighted benchmarks rather than an average of our tracked stocks, so
 * "NIFTY IT +1.2%" here means the same thing it means on any other terminal.
 */
export function SectorTrends() {
  const { data, loading, error } = useMarketFeed<SectorBoard>("/api/market/sectors");
  const sectors = useMemo(() => data?.sectors ?? [], [data]);

  const largest = sectors.reduce((max, sector) => Math.max(max, Math.abs(sector.changePercent ?? 0)), 0);
  const leader = sectors[0];
  const laggard = sectors[sectors.length - 1];
  const brief = useMemo(() => sectorBrief(sectors), [sectors]);

  return (
    <MarketSection
      id="sectors"
      eyebrow="Sectors trending today"
      eyebrowClass="text-sky-600 dark:text-sky-400"
      title="Which sectors moved, and by how much"
      blurb="Every NSE sectoral index ranked by today's price change, with the advance/decline split inside each one and how it has fared over a month and a year."
      aside={
        <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400">
          {sectors.length} sectoral indices
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && leader && laggard && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Leading sector</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white">{leader.name}</p>
            <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatSignedPercent(leader.changePercent)}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Lagging sector</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white">{laggard.name}</p>
            <p className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatSignedPercent(laggard.changePercent)}
            </p>
          </div>
        </div>
      )}

      <AiBoardRead feature="sectors" brief={brief} />

      {!loading && sectors.length > 0 && (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {sectors.map((sector) => (
            <SectorRow key={sector.symbol} sector={sector} largest={largest} />
          ))}
        </ul>
      )}

      {!loading && sectors.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          NSE hasn&apos;t published sectoral index levels yet today.
        </p>
      )}

      <SectionFootnote>
        Official NSE sectoral indices, cap-weighted · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
