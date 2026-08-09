"use client";

import { formatRupee, sectorTone } from "./market-format";
import { CapTierPill } from "./market-badges";
import { CompanyLogo } from "./company-logo";
import { StockDetailTrigger } from "./stock-detail-provider";
import type { Mover } from "./market-movers";

/** One labelled detail, value under label — the unit each row is built from. */
function Detail({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-0.5 min-w-0">{children}</dd>
    </div>
  );
}

/**
 * One mover per full-width row.
 *
 * Three tiles across a column left every field fighting for a sliver of width — sector names
 * clipped, the move squeezed against them. Given the whole width, one stock per row, each field
 * gets room and its own label, and the three rows read down the page in rank order.
 */
function MoverRow({ mover, rank, direction }: { mover: Mover; rank: number; direction: "up" | "down" }) {
  const up = direction === "up";

  return (
    <li
      className={`rounded-2xl border p-4 transition ${
        up
          ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-950"
          : "border-rose-200 bg-gradient-to-r from-rose-50 to-white dark:border-rose-500/30 dark:from-rose-500/10 dark:to-slate-950"
      }`}
    >
      <div className="flex flex-col gap-x-6 gap-y-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:w-60 sm:shrink-0">
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white ${
              up ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {rank}
          </span>
          <CompanyLogo symbol={mover.symbol} size={28} />

          <StockDetailTrigger symbol={mover.symbol}>
            <p className="truncate text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">{mover.symbol}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{mover.name}</p>
          </StockDetailTrigger>
        </div>

        <dl className="flex flex-1 flex-wrap items-start gap-x-8 gap-y-3 border-slate-200/70 sm:border-l sm:pl-6 dark:border-slate-800">
          <Detail label="Sector">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(mover.sector)}`}>
              {mover.sector}
            </span>
          </Detail>

          <Detail label="Market cap">
            <CapTierPill tier={mover.capTier} />
          </Detail>

          <Detail label="Price">
            <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {formatRupee(mover.price)}
            </span>
          </Detail>
        </dl>

        <Detail label="Day change" className="sm:w-28 sm:shrink-0 sm:text-right">
          <span
            className={`whitespace-nowrap text-xl font-bold tabular-nums ${
              up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {up ? "+" : "-"}
            {Math.abs(mover.changePercent).toFixed(2)}%
          </span>
        </Detail>
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
    <div className="space-y-6">
      {[
        { key: "up" as const, title: "Top 3 gainers", rows: gainers, tone: "text-emerald-600 dark:text-emerald-400" },
        { key: "down" as const, title: "Top 3 losers", rows: losers, tone: "text-rose-600 dark:text-rose-400" },
      ].map((group) => (
        <div key={group.key}>
          <p className={`text-xs font-bold uppercase tracking-wide ${group.tone}`}>{group.title}</p>
          {group.rows.length > 0 ? (
            <ul className="mt-2 space-y-2">
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
