"use client";

import { formatRupee, sectorTone } from "./market-format";
import { CapTierPill } from "./market-badges";
import { CompanyLogo } from "./company-logo";
import { StockDetailTrigger } from "./stock-detail-provider";
import type { Mover } from "./market-movers";

/**
 * One mover per full-width row.
 *
 * Quieter than it was on purpose. Every row used to be washed in a coloured gradient and every
 * field carried its own uppercase label — "Sector", "Market cap", "Price" — above values that
 * already announce what they are: a sector pill, a cap tier, a rupee figure. Three redundant
 * labels per row across six rows is thirty-six words of chrome around eighteen facts. The colour
 * now lives in a single edge stripe and in the move itself, which is the one number a reader came
 * for, so direction still reads instantly from across the page without tinting the whole card.
 */
function MoverRow({ mover, rank, direction }: { mover: Mover; rank: number; direction: "up" | "down" }) {
  const up = direction === "up";

  return (
    <li className="relative overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-[0_10px_28px_-20px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${up ? "bg-emerald-500" : "bg-rose-500"}`} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 pl-4 pr-3">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            up
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
          }`}
        >
          {rank}
        </span>

        <CompanyLogo symbol={mover.symbol} size={30} />

        {/* The identity gets the flexible width; everything after it is sized to its content. */}
        <StockDetailTrigger symbol={mover.symbol}>
          <p className="truncate text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
            {mover.symbol}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{mover.name}</p>
        </StockDetailTrigger>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(mover.sector)}`}>
            {mover.sector}
          </span>
          <CapTierPill tier={mover.capTier} />
        </div>

        <span className="ml-auto shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900 dark:text-white">
          {formatRupee(mover.price)}
        </span>

        <span
          className={`flex w-24 shrink-0 items-center justify-end gap-1 whitespace-nowrap text-base font-bold tabular-nums ${
            up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          <span aria-hidden="true" className="text-[10px]">{up ? "▲" : "▼"}</span>
          {up ? "+" : "-"}
          {Math.abs(mover.changePercent).toFixed(2)}%
        </span>
      </div>
    </li>
  );
}

/**
 * The day's three sharpest moves in each direction, across every cap tier.
 *
 * The per-tier lists below answer "what moved among large caps"; this answers the blunter question
 * a reader asks first — what moved most today, full stop.
 */
export function TopMoversStrip({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <div className="space-y-5">
      {[
        { key: "up" as const, title: "Top 3 Gainers - Today", rows: gainers, tone: "text-emerald-600 dark:text-emerald-400" },
        { key: "down" as const, title: "Top 3 Losers - Today", rows: losers, tone: "text-rose-600 dark:text-rose-400" },
      ].map((group) => (
        <div key={group.key}>
          {/* Title on a rule that runs to the edge: it separates the two lists without needing a
              box around each, which is what kept them from reading as one tidy block. */}
          <div className="flex items-center gap-3">
            <p className={`shrink-0 text-xs font-bold uppercase tracking-wide ${group.tone}`}>{group.title}</p>
            <span aria-hidden="true" className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          {group.rows.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {group.rows.map((mover, index) => (
                <MoverRow key={mover.symbol} mover={mover} rank={index + 1} direction={group.key} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nothing {group.key === "up" ? "advanced" : "declined"} in the tracked universe today.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
