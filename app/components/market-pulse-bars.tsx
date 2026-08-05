"use client";

type BarSpec = {
  key: "advancing" | "declining";
  label: string;
  count: number;
  share: number;
  fill: string;
  glow: string;
  text: string;
};

function bar(spec: BarSpec, live: boolean) {
  // Floor the drawn height so a bar that is genuinely at zero is still visible as an empty
  // column rather than vanishing, which would read as "no data" instead of "none advancing".
  const height = Math.max(spec.share, 2);

  return (
    <div key={spec.key} className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative flex h-20 w-full items-end overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/70">
        <div
          className={`relative w-full rounded-lg transition-[height] duration-700 ease-out ${live ? spec.fill : "bg-slate-300 dark:bg-slate-700"}`}
          style={{ height: `${height}%` }}
        >
          {live && <span className={`absolute inset-0 rounded-lg ${spec.glow} animate-pulse-bar`} />}
        </div>
      </div>
      <p className={`text-xs font-semibold tabular-nums ${live ? spec.text : "text-slate-400 dark:text-slate-500"}`}>
        {spec.count}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{spec.label}</p>
    </div>
  );
}

/**
 * Two vertical bars showing how much of the tracked universe is advancing versus declining.
 *
 * Bar heights are the real advance/decline split and only move when the feed refreshes — the
 * per-second animation is a liveness cue, not simulated price movement. While the market is
 * shut both bars go grey and stop animating.
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
  const decisive = advancing + declining;
  const advanceShare = decisive === 0 ? 0 : (advancing / decisive) * 100;

  const bars: BarSpec[] = [
    {
      key: "advancing",
      label: "Up",
      count: advancing,
      share: advanceShare,
      fill: "bg-emerald-500",
      glow: "bg-emerald-300",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "declining",
      label: "Down",
      count: declining,
      share: decisive === 0 ? 0 : 100 - advanceShare,
      fill: "bg-rose-500",
      glow: "bg-rose-300",
      text: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${className}`}
      aria-label={`${advancing} stocks advancing, ${declining} declining`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Advance / decline</p>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide ${live ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}
        >
          {live ? "Live" : "Off"}
        </span>
      </div>

      <div className="mt-3 flex items-end gap-3">{bars.map((spec) => bar(spec, live))}</div>

      <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">{unchanged} flat</p>
    </div>
  );
}
