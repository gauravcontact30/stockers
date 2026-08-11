"use client";

import { useMemo, useState } from "react";

type OwnerGroup = "promoters" | "fii" | "dii" | "government" | "retail" | "bodies" | "others";
type InvestorSeriesKey = OwnerGroup | "public";

export type InvestorHoldingPoint = {
  key?: InvestorSeriesKey | string;
  label: string;
  percent: number;
};

export type PromoterQuarter = {
  quarter: string;
  promoter: number;
  publicHeld: number;
  investorTypes?: InvestorHoldingPoint[];
};

const WIDTH = 400;
const HEIGHT = 164;
const PAD = { top: 14, right: 10, bottom: 26, left: 34 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const PIE_SIZE = 220;
const PIE_CENTER = PIE_SIZE / 2;
const PIE_RADIUS = 82;

const SERIES_ORDER: InvestorSeriesKey[] = ["promoters", "fii", "dii", "government", "retail", "bodies", "others", "public"];
const SERIES_META: Record<InvestorSeriesKey, { label: string; color: string; text: string; pale: string }> = {
  promoters: {
    label: "Promoters & insiders",
    color: "#8b5cf6",
    text: "text-violet-700 dark:text-violet-300",
    pale: "bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/25",
  },
  fii: {
    label: "Foreign institutional investors",
    color: "#0ea5e9",
    text: "text-sky-700 dark:text-sky-300",
    pale: "bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/25",
  },
  dii: {
    label: "Domestic institutional investors",
    color: "#10b981",
    text: "text-emerald-700 dark:text-emerald-300",
    pale: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25",
  },
  government: {
    label: "Government",
    color: "#f59e0b",
    text: "text-amber-700 dark:text-amber-300",
    pale: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
  },
  retail: {
    label: "Retail & individual investors",
    color: "#f43f5e",
    text: "text-rose-700 dark:text-rose-300",
    pale: "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/25",
  },
  bodies: {
    label: "Corporate bodies & trusts",
    color: "#64748b",
    text: "text-slate-700 dark:text-slate-300",
    pale: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
  },
  others: {
    label: "Unclassified in the filing",
    color: "#94a3b8",
    text: "text-slate-600 dark:text-slate-400",
    pale: "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800",
  },
  public: {
    label: "Public shareholders",
    color: "#06b6d4",
    text: "text-cyan-700 dark:text-cyan-300",
    pale: "bg-cyan-50 border-cyan-200 dark:bg-cyan-500/10 dark:border-cyan-500/25",
  },
};

export function shortQuarter(quarter: string): string {
  const parts = quarter.split("-");
  if (parts.length !== 3) return quarter;
  const [, month, year] = parts;
  const title = month.charAt(0) + month.slice(1).toLowerCase();
  return `${title} '${year.slice(-2)}`;
}

export function scaleFor(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 100 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high - low < 0.2) return { min: Math.max(0, low - 0.5), max: Math.min(100, high + 0.5) };
  const pad = (high - low) * 0.18;
  return { min: Math.max(0, low - pad), max: Math.min(100, high + pad) };
}

function seriesKey(point: InvestorHoldingPoint): InvestorSeriesKey {
  if (point.key && point.key in SERIES_META) return point.key as InvestorSeriesKey;
  return point.label.toLowerCase().includes("public") ? "public" : "others";
}

function holdingsFor(entry: PromoterQuarter) {
  const filed = (entry.investorTypes ?? []).filter((point) => Number.isFinite(point.percent) && point.percent > 0);
  if (filed.length === 0) {
    return [
      { key: "promoters" as const, label: SERIES_META.promoters.label, percent: entry.promoter },
      { key: "public" as const, label: SERIES_META.public.label, percent: entry.publicHeld },
    ].filter((point) => Number.isFinite(point.percent) && point.percent > 0);
  }

  const byKey = new Map<InvestorSeriesKey, { key: InvestorSeriesKey; label: string; percent: number }>();
  for (const point of filed) {
    const key = seriesKey(point);
    const existing = byKey.get(key);
    if (existing) existing.percent += point.percent;
    else byKey.set(key, { key, label: point.label || SERIES_META[key].label, percent: point.percent });
  }
  return [...byKey.values()]
    .map((point) => ({ ...point, percent: Math.round(point.percent * 100) / 100 }))
    .sort((a, b) => SERIES_ORDER.indexOf(a.key) - SERIES_ORDER.indexOf(b.key));
}

function valueFor(entry: PromoterQuarter, key: InvestorSeriesKey): number {
  const holding = holdingsFor(entry).find((point) => point.key === key);
  if (holding) return holding.percent;
  if ((entry.investorTypes ?? []).some((point) => Number.isFinite(point.percent) && point.percent > 0)) return 0;
  if (key === "promoters" && Number.isFinite(entry.promoter)) return entry.promoter;
  if (key === "public" && Number.isFinite(entry.publicHeld)) return entry.publicHeld;
  return 0;
}

function pointOnPie(percent: number) {
  const angle = (percent / 100) * 360 - 90;
  const radians = (Math.PI / 180) * angle;
  return {
    x: PIE_CENTER + PIE_RADIUS * Math.cos(radians),
    y: PIE_CENTER + PIE_RADIUS * Math.sin(radians),
  };
}

function piePath(start: number, end: number) {
  const clampedEnd = Math.min(end, 99.999);
  const startPoint = pointOnPie(start);
  const endPoint = pointOnPie(clampedEnd);
  const largeArc = clampedEnd - start > 50 ? 1 : 0;
  return [
    `M ${PIE_CENTER} ${PIE_CENTER}`,
    `L ${startPoint.x} ${startPoint.y}`,
    `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`,
    "Z",
  ].join(" ");
}

function pieSlices(holdings: ReturnType<typeof holdingsFor>) {
  const total = holdings.reduce((sum, holding) => sum + holding.percent, 0);
  let cursor = 0;
  if (total <= 0) return [];

  return holdings.map((holding) => {
    const share = (holding.percent / total) * 100;
    const slice = { ...holding, start: cursor, end: cursor + share, share };
    cursor += share;
    return slice;
  });
}

export function PromoterTrendChart({ history }: { history: PromoterQuarter[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<InvestorSeriesKey | null>(null);

  const normalized = useMemo(
    () =>
      history.map((entry) => ({
        ...entry,
        holdings: holdingsFor(entry),
      })),
    [history],
  );

  if (normalized.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        No earlier filings are available for this company yet.
      </p>
    );
  }

  const last = normalized.length - 1;
  const active = Math.min(picked ?? last, last);
  const current = normalized[active];
  const currentPromoter = valueFor(current, "promoters");
  const stepChange = active > 0 ? currentPromoter - valueFor(normalized[active - 1], "promoters") : null;

  const orderedHoldings = [...current.holdings].sort((a, b) => b.percent - a.percent);
  const slices = pieSlices(orderedHoldings);
  const topHolding = orderedHoldings[0];
  const visibleHoldings = orderedHoldings.slice(0, 5);
  const hiddenHoldings = Math.max(0, current.holdings.length - visibleHoldings.length);
  const featuredHolding = orderedHoldings.find((holding) => holding.key === highlighted) ?? topHolding;
  const stepTone =
    stepChange === null
      ? "text-slate-500 dark:text-slate-400"
      : stepChange >= 0
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-rose-700 dark:text-rose-300";

  return (
    <div className="mt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3 dark:border-violet-500/20 dark:bg-violet-500/10">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">Promoter stake</p>
          <p className="mt-1 text-2xl font-black leading-none tabular-nums text-slate-900 dark:text-white">{currentPromoter.toFixed(2)}%</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{shortQuarter(current.quarter)} filing</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 dark:border-sky-500/20 dark:bg-sky-500/10">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">QoQ change</p>
          <p className={`mt-1 text-2xl font-black leading-none tabular-nums ${stepTone}`}>
            {stepChange === null ? "First" : `${stepChange >= 0 ? "+" : ""}${stepChange.toFixed(2)} pp`}
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{stepChange === null ? "No prior filing" : "vs previous quarter"}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex flex-wrap gap-1.5">
          {normalized.map((entry, index) => (
            <button
              key={entry.quarter}
              type="button"
              onClick={() => {
                setPicked(index);
                setHighlighted(null);
              }}
              onFocus={() => {
                setPicked(index);
                setHighlighted(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold tabular-nums transition ${
                index === active
                  ? "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-violet-200 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-violet-300"
              }`}
            >
              {shortQuarter(entry.quarter)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="mx-auto w-full max-w-[420px]">
            <svg
              viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}
              className="w-full"
              role="img"
              aria-label={`${shortQuarter(current.quarter)} ownership pie chart, promoter holding ${currentPromoter.toFixed(2)} percent`}
            >
              <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} className="fill-slate-100 dark:fill-slate-900" />
              {slices.map((slice) => (
                <path
                  key={slice.key}
                  d={piePath(slice.start, slice.end)}
                  data-pie-slice={slice.key}
                  fill={SERIES_META[slice.key].color}
                  stroke="white"
                  strokeWidth="2"
                  opacity={!highlighted || highlighted === slice.key ? 1 : 0.38}
                  className="cursor-pointer transition-opacity"
                  tabIndex={0}
                  role="button"
                  aria-label={`${slice.label}: ${slice.percent.toFixed(2)} percent`}
                  onMouseEnter={() => setHighlighted(slice.key)}
                  onFocus={() => setHighlighted(slice.key)}
                  onClick={() => setHighlighted(slice.key)}
                />
              ))}
              <circle cx={PIE_CENTER} cy={PIE_CENTER} r="48" className="fill-white drop-shadow-sm dark:fill-slate-950" />
              <text x={PIE_CENTER} y={PIE_CENTER - 4} textAnchor="middle" className="fill-slate-900 text-xl font-black tabular-nums dark:fill-white">
                {featuredHolding ? `${featuredHolding.percent.toFixed(1)}%` : "-"}
              </text>
              <text x={PIE_CENTER} y={PIE_CENTER + 16} textAnchor="middle" className="fill-slate-500 text-[10px] font-bold uppercase tracking-[0.12em] dark:fill-slate-400">
                {featuredHolding ? SERIES_META[featuredHolding.key].label.split(" ")[0] : "Holding"}
              </text>
            </svg>
            <p className="mt-2 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Tap a slice or quarter to inspect the filing.
            </p>
          </div>

          <div role="status" className="mt-4 w-full min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {shortQuarter(current.quarter)} holder split
              </p>
              {topHolding && (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Largest <span className={SERIES_META[topHolding.key].text}>{topHolding.percent.toFixed(2)}%</span>
                </p>
              )}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {visibleHoldings.map((holding) => (
                <button
                  key={`${holding.key}-${holding.label}`}
                  type="button"
                  onMouseEnter={() => setHighlighted(holding.key)}
                  onFocus={() => setHighlighted(holding.key)}
                  onClick={() => setHighlighted(holding.key)}
                  className={`flex min-w-0 items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                    highlighted === holding.key
                      ? SERIES_META[holding.key].pale
                      : "border-slate-100 bg-slate-50 hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SERIES_META[holding.key].color }}
                    />
                    <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {holding.label}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${SERIES_META[holding.key].text}`}>
                    {holding.percent.toFixed(2)}%
                  </span>
                </button>
              ))}
              {hiddenHoldings > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
                  +{hiddenHoldings} other holder type{hiddenHoldings === 1 ? "" : "s"}
                </div>
              )}
            </div>
            {featuredHolding && (
              <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <span className={`font-bold ${SERIES_META[featuredHolding.key].text}`}>{featuredHolding.label}</span>{" "}
                holds {featuredHolding.percent.toFixed(2)}% in the selected quarter.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
