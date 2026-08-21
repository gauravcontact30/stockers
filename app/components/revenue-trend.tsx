"use client";

import { useId, useMemo, useState } from "react";
import { compactPaise, formatPaise, type RevenuePoint } from "../lib/payments-format";

/**
 * Takings over time, as columns.
 *
 * Columns rather than a line because these are discrete periods with real gaps in them — a day
 * nobody paid is a gap, and a line drawn across it invents a slope between two Tuesdays. One
 * series, so one hue and no legend: the caption already says what is plotted.
 *
 * Laid out in CSS rather than as a fixed-viewBox SVG, which is the shape the rest of this app's
 * charts take. A donut is square and scales cleanly; a time axis is not, and an SVG sized by
 * `viewBox` alone either letterboxes on a wide card or squashes the axis band into nothing on a
 * phone. Percentage heights against a fixed plot height keep the bars honest at every width, and
 * the bars get to be real `<button>`s — which is where hover, focus and keyboard come from for
 * free, the same trade the pie chart's legend makes.
 *
 * Every value here is reachable three ways: the tooltip, each bar's accessible name, and the table
 * underneath. Nothing is gated behind a pointer.
 */

/** Bars this wide read as columns; wider and they become blocks. */
const MAX_BAR = 28;
/** At most this many x-axis ticks, whatever the series length. */
const MAX_TICKS = 7;
/** Roughly how many horizontal gridlines to aim for above the zero rule. */
const GRID_LINES = 4;

export type TrendRange = {
  id: string;
  /** What the control says — "Daily", "Monthly". */
  label: string;
  /** What the caption says once chosen — "the last 30 days". */
  window: string;
  points: RevenuePoint[];
};

/**
 * Where the axis stops, and the round numbers on the way up.
 *
 * The step is snapped to 1/2/2.5/5 × a power of ten so the ticks read ₹0 / ₹25K / ₹50K rather than
 * ₹0 / ₹23.4K / ₹46.8K, and the top is the first multiple of that step at or above the tallest
 * column — not a fixed number of steps, which would leave a chart's tallest bar stranded at 60% of
 * the plot whenever the peak fell just past a round number.
 */
export function axisScale(maxPaise: number): { top: number; steps: number[] } {
  if (maxPaise <= 0) return { top: 0, steps: [] };

  const rupees = maxPaise / 100;
  const raw = rupees / GRID_LINES;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const step = Math.max(1, (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10) * magnitude);

  const lines = Math.ceil(rupees / step);
  return {
    top: Math.round(lines * step * 100),
    steps: Array.from({ length: lines + 1 }, (_, line) => Math.round(line * step * 100)),
  };
}

/** Which points get an x-axis label: evenly spaced, and always the newest one. */
export function tickIndexes(length: number): Set<number> {
  if (length === 0) return new Set();

  const stride = Math.max(1, Math.ceil(length / MAX_TICKS));
  const marks = new Set<number>();
  // Walked backwards from the newest point, so "today" is always labelled and the spacing falls
  // where it may at the old end — the opposite leaves the freshest column anonymous.
  for (let index = length - 1; index >= 0; index -= stride) marks.add(index);
  return marks;
}

export function RevenueTrend({
  ranges,
  empty = "No payment has been recorded in this window.",
}: {
  ranges: TrendRange[];
  empty?: string;
}) {
  const captionId = useId();
  const [rangeId, setRangeId] = useState(ranges[0]?.id ?? "");
  /** Hover and focus share this; a bar is "active" either way. */
  const [active, setActive] = useState<number | null>(null);

  const range = ranges.find((candidate) => candidate.id === rangeId) ?? ranges[0];
  const chosenId = range ? range.id : "";
  const points = useMemo(() => range?.points ?? [], [range]);

  const { total, peak, scale, ticks, peakIndex } = useMemo(() => {
    const sum = points.reduce((running, point) => running + point.paise, 0);
    const highest = points.reduce((running, point) => Math.max(running, point.paise), 0);

    return {
      total: sum,
      peak: highest,
      scale: axisScale(highest),
      ticks: tickIndexes(points.length),
      peakIndex: highest > 0 ? points.findIndex((point) => point.paise === highest) : -1,
    };
  }, [points]);

  const control =
    ranges.length > 1 ? (
      <div role="group" aria-label="Trend period" className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
        {ranges.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === chosenId}
            onClick={() => {
              setRangeId(candidate.id);
              setActive(null);
            }}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
              candidate.id === chosenId
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </div>
    ) : null;

  if (!range || total <= 0) {
    return (
      <div className="flex flex-col gap-3">
        {control && <div className="flex justify-end">{control}</div>}
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {empty}
        </p>
      </div>
    );
  }

  const { top, steps } = scale;
  // Resolved once, so the readout below is one nullable value rather than an index and a lookup
  // that have to be re-narrowed at every use.
  const tooltip = active === null ? null : { point: points[active], offset: ((active + 0.5) / points.length) * 100 };

  return (
    <figure className="m-0 flex flex-col gap-3">
      {/* The one control row, above everything it scopes. It changes the grain of this trend — day
          against calendar month — and nothing else on the page reads from it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <figcaption id={captionId} className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Revenue collected, {range.window}
        </figcaption>
        {control}
      </div>

      <div className="relative pl-12 sm:pl-14">
        {/* A group rather than an `img`: the columns are real buttons underneath, so a screen
            reader walks the series period by period instead of hearing one flattened summary. */}
        <div className="relative h-44 sm:h-52" role="group" aria-labelledby={captionId} onMouseLeave={() => setActive(null)}>
          {/* Hairline grid, one shade off the surface, with the ticks it carries hung in the
              gutter to its left. Solid: a dashed rule reads as a threshold. */}
          {steps.map((value, line) => (
            <div
              key={value}
              className="pointer-events-none absolute inset-x-0 border-t"
              style={{ bottom: `${(value / top) * 100}%`, borderColor: "var(--viz-grid)" }}
            >
              <span
                className="absolute right-[calc(100%+0.5rem)] -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums"
                style={{ color: "var(--viz-muted)" }}
              >
                {line === 0 ? "₹0" : compactPaise(value)}
              </span>
            </div>
          ))}

          <div className="absolute inset-0 flex items-end gap-0.5">
            {points.map((point, index) => {
              const share = point.paise / top;
              const isActive = active === index;
              // Everything recedes only once something is chosen, so the resting state is the whole
              // series at full strength rather than a chart that looks half switched off.
              const dimmed = active !== null && !isActive;

              return (
                <button
                  key={point.key}
                  type="button"
                  // The hit area is the whole column band, not the mark: a day worth ₹200 is three
                  // pixels tall and would otherwise be unhoverable.
                  className="relative h-full min-w-0 flex-1 cursor-default rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setActive(null);
                  }}
                  aria-label={`${point.label}: ${formatPaise(point.paise)} from ${point.count} payment${point.count === 1 ? "" : "s"}`}
                >
                  {point.paise > 0 && (
                    <span
                      // 4px rounded cap, square where it meets the baseline: the bar grows out of
                      // the axis rather than floating above it.
                      className="absolute inset-x-0 bottom-0 mx-auto block rounded-t-sm transition-opacity"
                      style={{
                        height: `${Math.max(share * 100, 1.5)}%`,
                        maxWidth: `${MAX_BAR}px`,
                        background: "var(--viz-1)",
                        opacity: dimmed ? 0.28 : 1,
                      }}
                    />
                  )}
                  {/* One direct label, on the tallest column, and only while nothing is chosen —
                      a value over every bar is noise, and the tooltip covers the rest. */}
                  {index === peakIndex && active === null && (
                    <span
                      className="pointer-events-none absolute inset-x-0 whitespace-nowrap text-center text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300"
                      style={{ bottom: `calc(${Math.max(share * 100, 1.5)}% + 4px)` }}
                    >
                      {compactPaise(point.paise)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tooltip && (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-52 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-lg dark:border-slate-700 dark:bg-slate-950"
              // Clamped to the plot so the newest column's readout does not hang off the card.
              style={{ left: `clamp(4rem, ${tooltip.offset}%, calc(100% - 4rem))` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{tooltip.point.label}</p>
              <p className="text-base font-bold text-slate-900 dark:text-white">{formatPaise(tooltip.point.paise)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {tooltip.point.count} payment{tooltip.point.count === 1 ? "" : "s"} · {Math.round((tooltip.point.paise / total) * 100)}% of the window
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-0.5">
          {points.map((point, index) => (
            <span
              key={point.key}
              className={`min-w-0 flex-1 truncate text-center text-[10px] font-semibold tabular-nums ${
                ticks.has(index) ? "" : "invisible"
              }`}
              style={{ color: "var(--viz-muted)" }}
              aria-hidden="true"
            >
              {point.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-bold text-slate-900 dark:text-white">{formatPaise(total)}</span> across {range.window} · peak{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{formatPaise(peak)}</span>
        </p>
        <p className="tabular-nums">Average {formatPaise(Math.round(total / Math.max(1, points.length)))} per period</p>
      </div>

      {/* The table twin. Every figure above is in here as text, so nothing depends on colour, on a
          pointer, or on reading a bar height off an axis. */}
      <details className="group">
        <summary className="cursor-pointer list-none text-[11px] font-bold text-rose-600 hover:underline dark:text-rose-300">
          <span className="group-open:hidden">Show these numbers as a table</span>
          <span className="hidden group-open:inline">Hide the table</span>
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Revenue collected, {range.window}</caption>
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">
                  Period
                </th>
                <th scope="col" className="px-3 py-2 text-right font-bold">
                  Collected
                </th>
                <th scope="col" className="px-3 py-2 text-right font-bold">
                  Payments
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...points].reverse().map((point) => (
                <tr key={point.key}>
                  <th scope="row" className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200">
                    {point.label}
                  </th>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formatPaise(point.paise)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
