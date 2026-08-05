"use client";

export type IndexQuote = {
  symbol: string;
  name: string;
  exchange: string;
  description: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  live: boolean;
  asOf: string | null;
};

/**
 * Index levels are point values, not prices, so they are deliberately formatted without a ₹ sign
 * — quoting "₹24,624.65" for the NIFTY would be plainly wrong.
 */
export function formatLevel(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Move in index points, always signed so a flat tape reads as "+0.00" rather than an absolute. */
export function formatPoints(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatChangePercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

/**
 * Where the current level sits inside today's range, as a 0-100 percentage — the marker position
 * for the day-range track. Returns null when the range can't be drawn honestly: any missing leg,
 * or a high that hasn't yet separated from the low (as happens moments after the open).
 */
export function rangePosition(price: number | null, low: number | null, high: number | null): number | null {
  if (typeof price !== "number" || typeof low !== "number" || typeof high !== "number") return null;
  if (!(high > low)) return null;

  const position = ((price - low) / (high - low)) * 100;
  // Yahoo's last trade can land a hair outside the day's high/low it reports in the same payload;
  // clamping keeps the marker on the track instead of overflowing it.
  return Math.min(100, Math.max(0, position));
}

function IndexCard({ index, live }: { index: IndexQuote; live: boolean }) {
  const change = index.change;
  const up = typeof change === "number" ? change >= 0 : null;

  const tone =
    up === null
      ? "text-slate-400 dark:text-slate-500"
      : up
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  const chip =
    up === null
      ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      : up
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400";

  const position = rangePosition(index.price, index.dayLow, index.dayHigh);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700"
      aria-label={`${index.name}, ${formatLevel(index.price)}, ${formatChangePercent(index.changePercent)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{index.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{index.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {index.exchange}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{formatLevel(index.price)}</p>
        {live && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-bar" />
            Live
          </span>
        )}
      </div>

      {/* The sign and the colour already carry direction, so there is no arrow here — "▼ -167.25"
          would state the same thing three times over. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className={`text-sm font-semibold tabular-nums ${tone}`}>{formatPoints(change)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${chip}`}>
          {formatChangePercent(index.changePercent)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">pts</span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-[11px] dark:border-slate-800">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Prev close</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatLevel(index.previousClose)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Day low</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatLevel(index.dayLow)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Day high</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatLevel(index.dayHigh)}</dd>
        </div>
      </dl>

      {position !== null && (
        <div className="mt-3">
          <div className="relative h-1.5 rounded-full bg-linear-to-r from-rose-200 via-slate-200 to-emerald-200 dark:from-rose-500/25 dark:via-slate-700 dark:to-emerald-500/25">
            <span
              className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 dark:bg-white"
              style={{ left: `${position}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Position in today&apos;s range</p>
        </div>
      )}
    </div>
  );
}

/**
 * The three headline benchmarks with their live level, points move and percentage move.
 *
 * Levels come from the same quote feed and cache as every other number in this section, so the
 * indices and the breadth beneath them are always as of the same moment.
 */
export function MarketIndices({
  indices,
  live,
  className = "",
}: {
  indices: IndexQuote[] | undefined;
  live: boolean;
  className?: string;
}) {
  // A payload without indices (an older cached response, or a feed that failed) drops the block
  // rather than rendering three empty cards.
  if (!indices || indices.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Benchmark indices</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Today&apos;s move in points and percent</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indices.map((index) => (
          <IndexCard key={index.symbol} index={index} live={live} />
        ))}
      </div>
    </div>
  );
}
