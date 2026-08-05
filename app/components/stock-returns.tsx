"use client";

import { useStockPerformance } from "./use-stock-performance";

type PeriodKey = "oneDay" | "oneWeek" | "oneMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear" | "overall";

// The eight horizons a trader scans before opening a position, shortest first. "Overall" is the
// return since the stock's earliest listed close, so it has no fixed length.
const PERIODS: { key: PeriodKey; label: string; title: string }[] = [
  { key: "oneDay", label: "1D", title: "Return over the last trading session" },
  { key: "oneWeek", label: "1W", title: "Return over the last 7 days" },
  { key: "oneMonth", label: "1M", title: "Return over the last 1 month" },
  { key: "sixMonth", label: "6M", title: "Return over the last 6 months" },
  { key: "oneYear", label: "1Y", title: "Return over the last 1 year" },
  { key: "threeYear", label: "3Y", title: "Return over the last 3 years" },
  { key: "fiveYear", label: "5Y", title: "Return over the last 5 years" },
  { key: "overall", label: "Overall", title: "Return since the earliest available close" },
];

// Percentages span roughly -100% to several thousand percent (a 20-year compounder's "overall"),
// so precision is traded away as the magnitude grows to keep every cell the same width.
export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1000 ? 0 : magnitude >= 100 ? 1 : 2;
  return `${value >= 0 ? "+" : "-"}${magnitude.toFixed(digits)}%`;
}

export function formatRupees(value: number | null | undefined, currency = "INR"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const prefix = currency === "INR" ? "₹" : `${currency} `;
  return `${prefix}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function returnToneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-400 dark:text-slate-500";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

/**
 * The eight trailing returns for one symbol, computed server-side from Yahoo Finance price
 * history against the live last-traded price. Data is fetched through a shared batching hook,
 * so rendering this on every card of a section still costs a single network round-trip.
 */
// Eight cells across only reads well at full table width. Inside a card — roughly a third of
// the page — the same row squeezes each figure to a few pixels, so cards get two tidy rows of
// four instead. Both class strings are written out in full so Tailwind can see them.
const GRID_CLASS: Record<4 | 8, string> = {
  4: "grid grid-cols-4 gap-x-2 gap-y-2.5",
  8: "grid grid-cols-4 gap-x-2 gap-y-2.5 sm:grid-cols-8",
};

export function StockReturns({
  symbol,
  columns = 4,
  label,
  className = "",
}: {
  symbol: string;
  columns?: 4 | 8;
  label?: string;
  className?: string;
}) {
  const { performance, loading } = useStockPerformance(symbol);

  return (
    <div className={className}>
      {label && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
          {performance?.overallSince && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">since {performance.overallSince.slice(0, 4)}</p>
          )}
        </div>
      )}

      <div className={GRID_CLASS[columns]}>
        {PERIODS.map((period) => {
          const value = performance?.[period.key] ?? null;
          return (
            <div key={period.key} className="min-w-0 text-center" title={period.title}>
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {period.label}
              </p>
              {loading ? (
                <span className="mx-auto mt-1.5 block h-3 w-10 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              ) : (
                <p className={`mt-0.5 truncate text-xs font-semibold tabular-nums ${returnToneClass(value)}`}>{formatPercent(value)}</p>
              )}
            </div>
          );
        })}
      </div>

      {!label && performance?.overallSince && (
        <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">
          Overall · since {performance.overallSince.slice(0, 4)}
        </p>
      )}
    </div>
  );
}

/**
 * Live last-traded price with today's move, sourced from the same batched feed as the returns
 * so the two can never disagree. `fallbackPrice` covers the gap before the live quote lands
 * (sections such as top picks ship a price snapshot with their daily cache).
 */
export function LiveMarketValue({
  symbol,
  fallbackPrice = null,
  fallbackChangePercent = null,
  showChange = true,
  className = "",
}: {
  symbol: string;
  fallbackPrice?: number | null;
  fallbackChangePercent?: number | null;
  showChange?: boolean;
  className?: string;
}) {
  const { performance } = useStockPerformance(symbol);

  const price = performance?.price ?? fallbackPrice;
  const change = performance?.oneDay ?? fallbackChangePercent;

  return (
    <div className={`flex items-baseline justify-between gap-2 ${className}`}>
      <span className="font-semibold text-slate-900 tabular-nums dark:text-white">{formatRupees(price, performance?.currency)}</span>
      {showChange && <span className={`text-sm font-medium tabular-nums ${returnToneClass(change)}`}>{formatPercent(change)}</span>}
    </div>
  );
}
