"use client";

import { useId, useMemo, useState } from "react";

/**
 * An interactive donut, for part-to-whole.
 *
 * Built as inline SVG rather than pulled from a charting library, for the same reason this project
 * talks to Supabase over `fetch`: it has three production dependencies and a chart is a few hundred
 * lines of arithmetic. A library here would be the largest thing in the bundle.
 *
 * ---------------------------------------------------------------------------
 * What a donut is and is not good for
 * ---------------------------------------------------------------------------
 *
 * It answers "how is this split" at a glance. It is poor at comparing two slices of similar size —
 * the eye cannot rank arcs the way it ranks bar lengths — so every chart drawn from this component
 * ships the same numbers as text: a percentage on each slice big enough to hold one, a legend
 * carrying the exact count, and a sortable table of the whole series underneath. Nothing here is
 * readable only by hovering, and nothing is readable only by colour.
 *
 * Six slices maximum. Past that, adjacent hues blur and the arcs get too thin to aim at, so the
 * tail folds into a grey "Other" that the legend names and the table itemises. Grey deliberately:
 * "everything else" is not an entity and must not look like one.
 *
 * ---------------------------------------------------------------------------
 * Interaction
 * ---------------------------------------------------------------------------
 *
 * Hover or focus a slice — or its legend row, which is a real button — and that slice lifts, the
 * centre switches from the total to that slice's own figures, and the rest recede. Clicking pins
 * that state so it survives the pointer leaving; clicking again, or pressing Escape, releases it.
 * The legend is the keyboard path: SVG focus handling is inconsistent across browsers, and a row of
 * ordinary buttons gets arrow keys, focus rings and screen-reader labelling for free.
 */

/** One slice. `key` identifies the entity and decides its colour, so a filter never repaints. */
export type Slice = {
  key: string;
  label: string;
  value: number;
  /** Secondary figure shown under the label — "12 people", say. Optional. */
  meta?: string;
};

/**
 * The categorical order, by CSS variable.
 *
 * Read from custom properties rather than hard-coded so the light and dark steps swap with the
 * theme in one place — see the palette block in `app/globals.css`, which is also where the
 * colourblind-safety measurements live.
 */
const SERIES_VARS = ["--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-5", "--viz-6"] as const;
const OTHER_VAR = "--viz-other";

/** Past this the arcs get too thin to aim at and adjacent hues stop separating. */
export const MAX_SLICES = 6;

const SIZE = 240;
const CENTRE = SIZE / 2;
const OUTER = 100;
const INNER = 62;
/** How far a hovered slice pushes out. Enough to read as a lift, small enough not to reflow. */
const LIFT = 6;
/**
 * The gap between slices, in radians at the outer edge.
 *
 * A 2px surface gap, not a stroke: a border drawn around a mark is ink doing a spacer's job, and at
 * this radius two pixels is about 0.02rad.
 */
const PAD = 2 / OUTER;

/** A slice too thin to hold a percentage without the text overflowing its own arc. */
const LABEL_MIN_SHARE = 0.08;

export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

/**
 * The series, capped and folded.
 *
 * Sorted by value so the tail that gets folded is genuinely the tail. Zero and negative values are
 * dropped rather than drawn: a slice of no size is not renderable, and a negative share of a whole
 * is not a thing a donut can honestly say.
 */
export function foldSlices(slices: Slice[], max = MAX_SLICES): Slice[] {
  const usable = slices.filter((slice) => Number.isFinite(slice.value) && slice.value > 0);
  const sorted = [...usable].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;

  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);

  return [
    ...head,
    {
      key: "__other__",
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, slice) => sum + slice.value, 0),
      meta: tail
        .slice(0, 3)
        .map((slice) => slice.label)
        .join(", "),
    },
  ];
}

/** A point on the circle. SVG angles start at 3 o'clock, so everything is rotated a quarter turn. */
function pointAt(angle: number, radius: number, offset = 0): [number, number] {
  const turned = angle - Math.PI / 2;
  return [CENTRE + Math.cos(turned) * radius + Math.cos(turned) * offset, CENTRE + Math.sin(turned) * radius + Math.sin(turned) * offset];
}

/**
 * The path for one arc segment of the ring.
 *
 * A full-circle segment is special-cased: an arc whose start and end coincide draws nothing at all
 * in SVG, so a series with exactly one slice would render an empty chart. It is drawn as two
 * half-circles instead.
 */
export function arcPath(start: number, end: number, offset: number): string {
  const sweep = end - start;

  if (sweep >= Math.PI * 2 - 0.0001) {
    const [ox1, oy1] = pointAt(0, OUTER, offset);
    const [ox2, oy2] = pointAt(Math.PI, OUTER, offset);
    const [ix1, iy1] = pointAt(0, INNER, offset);
    const [ix2, iy2] = pointAt(Math.PI, INNER, offset);
    return [
      `M ${ox1} ${oy1}`,
      `A ${OUTER} ${OUTER} 0 1 1 ${ox2} ${oy2}`,
      `A ${OUTER} ${OUTER} 0 1 1 ${ox1} ${oy1}`,
      `M ${ix1} ${iy1}`,
      `A ${INNER} ${INNER} 0 1 0 ${ix2} ${iy2}`,
      `A ${INNER} ${INNER} 0 1 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
  }

  const large = sweep > Math.PI ? 1 : 0;
  const [sx, sy] = pointAt(start, OUTER, offset);
  const [ex, ey] = pointAt(end, OUTER, offset);
  const [isx, isy] = pointAt(end, INNER, offset);
  const [iex, iey] = pointAt(start, INNER, offset);

  return [
    `M ${sx} ${sy}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${ex} ${ey}`,
    `L ${isx} ${isy}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${iex} ${iey}`,
    "Z",
  ].join(" ");
}

type Wedge = Slice & { start: number; end: number; share: number; colour: string; index: number };

/** The slices as geometry: where each arc begins and ends, and which colour slot it holds. */
export function layout(slices: Slice[]): { wedges: Wedge[]; total: number } {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return { wedges: [], total: 0 };

  let cursor = 0;
  const wedges = slices.map((slice, index) => {
    const share = slice.value / total;
    const start = cursor;
    const end = cursor + share * Math.PI * 2;
    cursor = end;

    return {
      ...slice,
      start,
      end,
      share,
      // The fold always takes the last colour, whatever position it lands in.
      colour: slice.key === "__other__" ? `var(${OTHER_VAR})` : `var(${SERIES_VARS[index % SERIES_VARS.length]})`,
      index,
    };
  });

  return { wedges, total };
}

export function PieChart({
  slices,
  total: totalLabel,
  unit,
  empty = "Nothing recorded in this window yet.",
}: {
  slices: Slice[];
  /** What the centre says when nothing is selected — "Page views", say. */
  total: string;
  /** The noun for one count: "views", "opens", "people". */
  unit: string;
  empty?: string;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  /** A pinned slice survives the pointer leaving; hover is transient. */
  const [pinned, setPinned] = useState<string | null>(null);

  const folded = useMemo(() => foldSlices(slices), [slices]);
  const { wedges, total } = useMemo(() => layout(folded), [folded]);

  if (wedges.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {empty}
      </p>
    );
  }

  const activeKey = hovered ?? pinned;
  const active = wedges.find((wedge) => wedge.key === activeKey) ?? null;

  const select = (key: string) => setPinned((current) => (current === key ? null : key));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[200px] w-[200px]"
          role="img"
          aria-labelledby={titleId}
          onMouseLeave={() => setHovered(null)}
        >
          <title id={titleId}>
            {totalLabel}: {wedges.map((wedge) => `${wedge.label} ${Math.round(wedge.share * 100)}%`).join(", ")}
          </title>

          {wedges.map((wedge) => {
            const isActive = activeKey === wedge.key;
            // Everything recedes only once something is actually chosen, so the default state is
            // the whole series at full strength rather than a chart that looks half switched off.
            const dimmed = activeKey !== null && !isActive;

            return (
              <g key={wedge.key}>
                <path
                  d={arcPath(wedge.start + PAD / 2, Math.max(wedge.start + PAD / 2, wedge.end - PAD / 2), isActive ? LIFT : 0)}
                  fill={wedge.colour}
                  opacity={dimmed ? 0.28 : 1}
                  className="cursor-pointer transition-[opacity,d] duration-150"
                  onMouseEnter={() => setHovered(wedge.key)}
                  onClick={() => select(wedge.key)}
                />
              </g>
            );
          })}

          {/* A percentage on every slice wide enough to hold one. The rest are carried by the
              legend and the table — a number crammed onto a 3° arc is unreadable either way. */}
          {wedges.map((wedge) => {
            if (wedge.share < LABEL_MIN_SHARE) return null;
            const isActive = activeKey === wedge.key;
            const [x, y] = pointAt((wedge.start + wedge.end) / 2, (OUTER + INNER) / 2, isActive ? LIFT : 0);

            return (
              <text
                key={wedge.key}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none text-[13px] font-bold tabular-nums"
                fill="#ffffff"
                opacity={activeKey !== null && !isActive ? 0.4 : 1}
              >
                {Math.round(wedge.share * 100)}%
              </text>
            );
          })}

          {/* The centre is the readout: the total until something is chosen, then that slice. */}
          <text
            x={CENTRE}
            y={CENTRE - 8}
            textAnchor="middle"
            className="select-none text-[26px] font-bold"
            fill="currentColor"
          >
            {formatCount(active ? active.value : total)}
          </text>
          <text
            x={CENTRE}
            y={CENTRE + 14}
            textAnchor="middle"
            className="select-none text-[11px] font-semibold"
            fill="var(--viz-muted)"
          >
            {active ? `${Math.round(active.share * 100)}% ${unit}` : `${unit} total`}
          </text>
        </svg>
      </div>

      {/* The legend is the keyboard path and the exact-value channel at once. Buttons rather than
          list items: hovering and focusing them drives the same state the arcs do. */}
      <ul className="flex min-w-0 flex-1 flex-col gap-0.5 self-stretch">
        {wedges.map((wedge) => {
          const isActive = activeKey === wedge.key;

          return (
            <li key={wedge.key}>
              <button
                type="button"
                aria-pressed={pinned === wedge.key}
                onMouseEnter={() => setHovered(wedge.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(wedge.key)}
                onBlur={() => setHovered(null)}
                onClick={() => select(wedge.key)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPinned(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                  isActive ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: wedge.colour }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {wedge.label}
                  {wedge.meta && <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">· {wedge.meta}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatCount(wedge.value)}
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {Math.round(wedge.share * 100)}%
                </span>
              </button>
            </li>
          );
        })}

        {pinned && (
          <li>
            <button
              type="button"
              onClick={() => setPinned(null)}
              className="mt-1 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
            >
              Clear selection
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
