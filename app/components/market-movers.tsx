"use client";

import { useState } from "react";
import { CapTierPill } from "./market-badges";
import type { CapTier } from "../lib/indian-stocks";

export type Mover = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  price: number | null;
  changePercent: number;
};

export type CapMovers = { gainers: Mover[]; losers: Mover[]; tracked: number };

const CAP_TIERS: CapTier[] = ["Large", "Mid", "Small"];

// Each sector gets a stable colour so the same industry reads the same way in every list, and a
// cluster of one colour is visible at a glance. Hashing the name keeps this working as the
// tracked universe grows, without a hand-maintained sector-to-colour table.
const SECTOR_TONES = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
];

export function sectorTone(sector: string): string {
  let hash = 0;
  for (let i = 0; i < sector.length; i++) hash = (hash * 31 + sector.charCodeAt(i)) % 100003;
  return SECTOR_TONES[hash % SECTOR_TONES.length];
}

export function formatPrice(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MoverRow({ mover, rank, direction }: { mover: Mover; rank: number; direction: "up" | "down" }) {
  const tone = direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    // Each stock is its own ribbon — bordered and raised off the panel, with a gap between rows —
    // so one company's figures can't be misread as the next one's.
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{mover.symbol}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{mover.name}</p>
        <span className={`mt-1 inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(mover.sector)}`}>
          {mover.sector}
        </span>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatPrice(mover.price)}</p>
        <p className={`text-xs font-semibold tabular-nums ${tone}`}>
          {direction === "up" ? "▲" : "▼"} {Math.abs(mover.changePercent).toFixed(2)}%
        </p>
      </div>
    </li>
  );
}

function MoverList({ title, movers, direction }: { title: string; movers: Mover[]; direction: "up" | "down" }) {
  const accent = direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
      <p className={`px-2 text-xs font-bold uppercase tracking-wide ${accent}`}>{title}</p>

      {movers.length === 0 ? (
        <p className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400">
          No {direction === "up" ? "advancing" : "declining"} stocks in this tier right now.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {movers.map((mover, index) => (
            <MoverRow key={mover.symbol} mover={mover} rank={index + 1} direction={direction} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Top five gainers and losers within each market-cap tier. Ranking is per tier rather than
 * across the whole universe, so large caps aren't buried by small caps' naturally wider swings.
 */
export function MarketMovers({ movers, className = "" }: { movers: Record<CapTier, CapMovers>; className?: string }) {
  const [tier, setTier] = useState<CapTier>("Large");
  // Tolerates a missing tier (or a missing map entirely) so a partial payload degrades to empty
  // lists instead of taking the whole market-pulse section down with it.
  const active = movers?.[tier] ?? { gainers: [], losers: [], tracked: 0 };

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Top movers by market cap</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ranked within {tier} Cap · {active.tracked} stocks tracked
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Market cap tier"
          className="flex shrink-0 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60"
        >
          {CAP_TIERS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === tier}
              onClick={() => setTier(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                option === tier
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {option} Cap
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <CapTierPill tier={tier} />
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Colours group stocks by sector</span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <MoverList title="Top 5 gainers" movers={active.gainers} direction="up" />
        <MoverList title="Top 5 losers" movers={active.losers} direction="down" />
      </div>
    </div>
  );
}
