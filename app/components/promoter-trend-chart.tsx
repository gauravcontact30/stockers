"use client";

import { useState } from "react";

export type PromoterQuarter = { quarter: string; promoter: number; publicHeld: number };

// The drawing box. Fixed units, scaled to the card by CSS, so the geometry below is plain
// arithmetic rather than anything that has to know how wide the card ended up.
const WIDTH = 400;
const HEIGHT = 150;
const PAD = { top: 14, right: 10, bottom: 26, left: 38 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** "30-JUN-2026" as the exchange files it, shortened to something that fits under a tick. */
export function shortQuarter(quarter: string): string {
  const parts = quarter.split("-");
  if (parts.length !== 3) return quarter;
  const [, month, year] = parts;
  const title = month.charAt(0) + month.slice(1).toLowerCase();
  return `${title} '${year.slice(-2)}`;
}

/**
 * The vertical scale.
 *
 * Deliberately *not* anchored at zero. A promoter stake is a number that moves in tenths of a
 * percent between quarters, and against a 0–100 axis every series in the market is a flat line at
 * whatever height the stake happens to sit — which is exactly what the bar chart this replaced
 * showed. Fitting the axis to the data is what makes a 50.1 → 50.4 drift visible. The axis is
 * labelled at both ends so nobody mistakes the resulting slope for a bigger move than it is.
 */
export function scaleFor(values: number[]): { min: number; max: number } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A stake that never moved would otherwise divide by a zero range.
  if (high - low < 0.2) return { min: Math.max(0, low - 0.5), max: Math.min(100, high + 0.5) };
  const pad = (high - low) * 0.18;
  return { min: Math.max(0, low - pad), max: Math.min(100, high + pad) };
}

export function PromoterTrendChart({ history }: { history: PromoterQuarter[] }) {
  /** Which quarter the reader has picked; null means "the most recent one". */
  const [picked, setPicked] = useState<number | null>(null);

  if (history.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        No earlier filings are available for this company yet.
      </p>
    );
  }

  const last = history.length - 1;
  // Clamped rather than trusted: the list can shrink under a picked index when the company changes.
  const active = Math.min(picked ?? last, last);
  const current = history[active];

  const { min, max } = scaleFor(history.map((entry) => entry.promoter));
  const x = (index: number) => (history.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (index / last) * PLOT_W);
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * PLOT_H;

  const points = history.map((entry, index) => `${x(index)},${y(entry.promoter)}`);
  const line = `M${points.join("L")}`;
  const area = `${line}L${x(last)},${PAD.top + PLOT_H}L${x(0)},${PAD.top + PLOT_H}Z`;

  const first = history[0];
  const netChange = history[last].promoter - first.promoter;
  const stepChange = active > 0 ? current.promoter - history[active - 1].promoter : null;
  const high = Math.max(...history.map((entry) => entry.promoter));
  const low = Math.min(...history.map((entry) => entry.promoter));

  const trendTone =
    netChange > 0.005
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      : netChange < -0.005
        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  const arrow = netChange > 0.005 ? "▲" : netChange < -0.005 ? "▼" : "■";

  return (
    <div className="mt-3">
      {/* The headline reads as a figure, not as a chart annotation: the stake now, how it moved
          across the filed window, and — once a reader picks a quarter — that quarter instead. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">
              {current.promoter.toFixed(2)}
            </span>
            <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">%</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            as of {shortQuarter(current.quarter)}
            {stepChange !== null && (
              <span className={stepChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                {" "}
                {stepChange >= 0 ? "+" : ""}
                {stepChange.toFixed(2)} pp vs previous quarter
              </span>
            )}
          </p>
        </div>

        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${trendTone}`}>
          <span aria-hidden="true">{arrow}</span>
          {netChange >= 0 ? "+" : ""}
          {netChange.toFixed(2)} pp over {history.length} quarters
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`Promoter holding from ${shortQuarter(first.quarter)} to ${shortQuarter(history[last].quarter)}, ${history[last].promoter.toFixed(2)} percent at the latest filing`}
      >
        <defs>
          <linearGradient id="promoter-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(139 92 246)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Three gridlines, labelled — the axis has to be readable for the zoomed scale to be honest. */}
        {[max, (max + min) / 2, min].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 6}
              y={y(value) + 3}
              textAnchor="end"
              className="fill-slate-400 text-[9px] tabular-nums dark:fill-slate-500"
            >
              {value.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#promoter-area)" />
        <path
          d={line}
          fill="none"
          className="stroke-violet-500"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* A vertical marker on the selected quarter, so the tooltip has something to point at. */}
        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={PAD.top + PLOT_H}
          className="stroke-violet-400/60"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {history.map((entry, index) => (
          <circle
            key={entry.quarter}
            cx={x(index)}
            cy={y(entry.promoter)}
            r={index === active ? 5 : 3}
            className={index === active ? "fill-violet-600 stroke-white dark:stroke-slate-900" : "fill-violet-500 stroke-white dark:stroke-slate-900"}
            strokeWidth="1.5"
          />
        ))}

        {history.map((entry, index) => (
          <text
            key={entry.quarter}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            className={`text-[9px] ${index === active ? "fill-slate-700 font-semibold dark:fill-slate-200" : "fill-slate-400 dark:fill-slate-500"}`}
          >
            {shortQuarter(entry.quarter)}
          </text>
        ))}

        {/* Hit targets last so they sit above everything and cover the full column height.
            Each is focusable, so the series can be stepped through from the keyboard too. */}
        {history.map((entry, index) => (
          <rect
            key={entry.quarter}
            x={x(index) - (history.length === 1 ? PLOT_W : PLOT_W / last) / 2}
            y={PAD.top}
            width={(history.length === 1 ? PLOT_W : PLOT_W / last)}
            height={PLOT_H}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${shortQuarter(entry.quarter)}: ${entry.promoter.toFixed(2)}% promoter holding`}
            className="cursor-pointer focus:outline-none"
            onMouseEnter={() => setPicked(index)}
            onFocus={() => setPicked(index)}
            onClick={() => setPicked(index)}
          />
        ))}
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        {[
          { label: "High", value: high },
          { label: "Low", value: low },
          { label: "Public float", value: current.publicHeld },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {stat.label}
            </p>
            <p className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
              {stat.value.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
