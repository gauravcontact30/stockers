"use client";

type Breadth = { advancing: number; declining: number; unchanged: number };

/**
 * The share of decisive moves that were advances, 0-100.
 *
 * Flat stocks are excluded deliberately: on a quiet day hundreds of untraded names would drag the
 * reading toward 50% and hide a tape that was, among the stocks that actually moved, strongly
 * one-sided.
 */
export function advanceShare({ advancing, declining }: Pick<Breadth, "advancing" | "declining">): number {
  const decisive = advancing + declining;
  return decisive === 0 ? 0 : (advancing / decisive) * 100;
}

/** Advances per decline — the ratio traders quote, capped for display when nothing is falling. */
export function advanceDeclineRatio({ advancing, declining }: Pick<Breadth, "advancing" | "declining">): number | null {
  if (declining === 0) return advancing === 0 ? null : Infinity;
  return advancing / declining;
}

export function formatRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  if (ratio === Infinity) return "All up";
  return `${ratio.toFixed(2)} : 1`;
}

/** A plain-language reading of how lopsided the tape is. */
export function breadthLabel(share: number): { label: string; tone: string } {
  if (share >= 70) return { label: "Broad rally", tone: "text-emerald-600 dark:text-emerald-400" };
  if (share >= 55) return { label: "Buyers ahead", tone: "text-emerald-600 dark:text-emerald-400" };
  if (share > 45) return { label: "Evenly split", tone: "text-amber-600 dark:text-amber-400" };
  if (share > 30) return { label: "Sellers ahead", tone: "text-rose-600 dark:text-rose-400" };
  return { label: "Broad selling", tone: "text-rose-600 dark:text-rose-400" };
}

function Segment({ share, className, title }: { share: number; className: string; title: string }) {
  if (share <= 0) return null;
  return <span className={`h-full transition-[width] duration-500 ease-out ${className}`} style={{ width: `${share}%` }} title={title} />;
}

/**
 * The advance/decline panel: a stacked bar of the whole tape, the ratio behind it, and the two
 * sides counted out.
 *
 * The bar is drawn from the real split and only moves when the feed refreshes; the pulsing is a
 * liveness cue, not simulated movement. While the market is shut everything goes grey and still.
 */
export function MarketPulseBars({
  advancing,
  declining,
  unchanged,
  live,
  className = "",
}: {
  advancing: number;
  declining: number;
  unchanged: number;
  live: boolean;
  className?: string;
}) {
  const total = advancing + declining + unchanged;
  const share = advanceShare({ advancing, declining });
  const reading = breadthLabel(share);
  const ratio = advanceDeclineRatio({ advancing, declining });

  const width = (count: number) => (total === 0 ? 0 : (count / total) * 100);

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${className}`}
      aria-label={`${advancing} stocks advancing, ${declining} declining, ${unchanged} unchanged`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Advance / decline</p>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${
            live ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-bar" />}
          {live ? "Live" : "Off"}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p className={`text-2xl font-semibold tabular-nums ${live ? reading.tone : "text-slate-400 dark:text-slate-500"}`}>
          {share.toFixed(1)}%
        </p>
        <p className={`text-xs font-semibold ${live ? reading.tone : "text-slate-400 dark:text-slate-500"}`}>{reading.label}</p>
      </div>

      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        {live ? (
          <>
            <Segment share={width(advancing)} className="bg-gradient-to-r from-emerald-400 to-emerald-600" title={`${advancing} advancing`} />
            <Segment share={width(unchanged)} className="bg-slate-300 dark:bg-slate-600" title={`${unchanged} unchanged`} />
            <Segment share={width(declining)} className="bg-gradient-to-r from-rose-600 to-rose-400" title={`${declining} declining`} />
          </>
        ) : (
          <span className="h-full w-full bg-slate-300 dark:bg-slate-700" />
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Up</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{advancing}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Flat</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">{unchanged}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Down</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{declining}</dd>
        </div>
      </dl>

      <p className="mt-2 border-t border-slate-200 pt-2 text-center text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        A/D ratio <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatRatio(ratio)}</span> ·{" "}
        {total} tracked
      </p>
    </div>
  );
}
