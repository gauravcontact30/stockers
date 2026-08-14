"use client";

import { useEffect, useState } from "react";
import { AppleModal } from "./apple-modal";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatCrore, formatRupee, formatSignedPercent, toneFor } from "./market-format";

// The windows the exchange archive measures, shortest first — the order a reader scans them in.
export const DETAIL_PERIODS = ["1w", "1m", "3m", "6m", "1y", "3y", "5y"] as const;
export const RETURN_PIE_PERIODS = ["1w", "1m", "6m", "1y", "3y", "5y", "overall"] as const;

export type TrajectoryPoint = { period: string; date: string | null; close: number };

export type DetailStock = {
  code: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  capTier: string | null;
  group: string;
  isin: string;
  rank: number | null;
  marketCapCr: number | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
  trades: number | null;
  returns: Record<string, number | null>;
  measuredFrom: Record<string, string | null>;
  trajectory: TrajectoryPoint[];
};

export type StockDetail = {
  stock: DetailStock;
  peers: DetailStock[];
  peerBasis: { category: string; capTier: string | null; period: string } | null;
  sessionDate: string | null;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
// Drawn as inline SVG rather than pulled from a charting library: this app ships three production
// dependencies, and a line and a bar are a few lines of path arithmetic. It also means the charts
// inherit the page's own colours and need no client-side runtime to appear.

/** Maps a series onto an 0-100 x 0-100 viewBox, which the SVG then scales to whatever width it has. */
export function plotPoints(values: number[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return "0,50 100,50";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      // A flat series has no span to scale against; drawing it down the middle is honest, whereas
      // dividing by zero would put it at the top or vanish it entirely.
      const y = span === 0 ? 50 : 100 - ((value - min) / span) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

const PIE_LABEL: Record<(typeof RETURN_PIE_PERIODS)[number], string> = {
  "1w": "1W",
  "1m": "1M",
  "6m": "6M",
  "1y": "1Y",
  "3y": "3Y",
  "5y": "5Y",
  overall: "Overall",
};

const PIE_GAIN_COLORS = ["#10b981", "#0ea5e9", "#14b8a6", "#84cc16", "#6366f1", "#f59e0b", "#059669"];
const PIE_LOSS_COLORS = ["#f43f5e", "#fb7185", "#e11d48", "#f97316", "#be123c", "#dc2626", "#a21caf"];

export type ReturnPieReading = {
  period: (typeof RETURN_PIE_PERIODS)[number];
  label: string;
  value: number | null;
  weight: number;
  color: string;
};

function overallFromTrajectory(stock: DetailStock): number | null {
  if (typeof stock.returns.overall === "number" && Number.isFinite(stock.returns.overall)) return stock.returns.overall;

  const first = stock.trajectory.find((point) => point.close > 0);
  const last = [...stock.trajectory].reverse().find((point) => point.close > 0) ?? null;
  if (!first || !last || first === last) return null;

  return ((last.close - first.close) / first.close) * 100;
}

export function returnPieReadings(stock: DetailStock): ReturnPieReading[] {
  return RETURN_PIE_PERIODS.map((period, index) => {
    const raw = period === "overall" ? overallFromTrajectory(stock) : stock.returns[period] ?? null;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;

    return {
      period,
      label: PIE_LABEL[period],
      value,
      weight: value === null ? 0 : Math.max(Math.abs(value), 0.2),
      color: value === null ? "#cbd5e1" : value >= 0 ? PIE_GAIN_COLORS[index] : PIE_LOSS_COLORS[index],
    };
  });
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function donutSlicePath(startAngle: number, endAngle: number): string {
  const cx = 72;
  const cy = 72;
  const outer = 66;
  const inner = 36;
  const end = endAngle - startAngle >= 360 ? startAngle + 359.99 : endAngle;
  const startOuter = polarPoint(cx, cy, outer, startAngle);
  const endOuter = polarPoint(cx, cy, outer, end);
  const startInner = polarPoint(cx, cy, inner, startAngle);
  const endInner = polarPoint(cx, cy, inner, end);
  const largeArc = end - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x.toFixed(3)} ${startOuter.y.toFixed(3)}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${endOuter.x.toFixed(3)} ${endOuter.y.toFixed(3)}`,
    `L ${endInner.x.toFixed(3)} ${endInner.y.toFixed(3)}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${startInner.x.toFixed(3)} ${startInner.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

export function returnPieSlices(readings: ReturnPieReading[]): {
  reading: ReturnPieReading;
  startAngle: number;
  endAngle: number;
  share: number;
  path: string;
}[] {
  const available = readings.filter((reading) => reading.value !== null && reading.weight > 0);
  const source = available.length > 0 ? available : readings.map((reading) => ({ ...reading, weight: 1 }));
  const total = source.reduce((sum, reading) => sum + reading.weight, 0);
  let cursor = 0;

  return source
    .map((reading) => {
      const startAngle = cursor;
      const share = reading.weight / total;
      cursor += share * 360;
      return {
        reading,
        startAngle,
        endAngle: cursor,
        share,
        path: donutSlicePath(startAngle, cursor),
      };
    });
}

/**
 * The company's own price path, from the oldest reference close the archive reaches to today.
 *
 * These are seven real session closes plus the live price, not a daily series — BSE publishes one
 * Bhavcopy per session and this app reads one per window, so the line joins eight measured points.
 * The caption says exactly that, because a smooth line invites the reader to assume more.
 */
function TrajectoryChart({ points }: { points: TrajectoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="rounded-2xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        The exchange archive does not reach far enough back to draw a price path for this scrip yet.
      </p>
    );
  }

  const closes = points.map((point) => point.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const rising = last >= first;
  const stroke = rising ? "#059669" : "#e11d48";
  const line = plotPoints(closes);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Price path · {points[0].date ?? "earliest"} → today
        </span>
        <span className={`text-xs font-bold tabular-nums ${toneFor(last - first)}`}>
          {formatRupee(first)} → {formatRupee(last)}
        </span>
      </figcaption>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Closing price from ${formatRupee(first)} to ${formatRupee(last)} across ${points.length} measured sessions`}
        className="h-32 w-full"
      >
        {/* Three guides rather than a full grid: enough to read height against, quiet enough not
            to compete with the line itself. */}
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.3" className="text-slate-200 dark:text-slate-800" />
        ))}
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      {/* The x-axis is labelled by window, because the points are not evenly spaced in time. */}
      <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {points.map((point) => (
          <span key={point.period}>{point.period}</span>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
        Eight measured closes — one per lookback window from BSE&apos;s session archive, ending at the latest price. The
        line joins them; it is not a daily series.
      </p>
    </figure>
  );
}

/** Return distribution across the windows the reader asked to compare. */
function ReturnsPieChart({ stock }: { stock: DetailStock }) {
  const readings = returnPieReadings(stock);
  const [activePeriod, setActivePeriod] = useState<(typeof RETURN_PIE_PERIODS)[number]>("overall");
  const slices = returnPieSlices(readings);
  const strongest = readings
    .filter((reading) => reading.value !== null)
    .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))[0];
  const active = readings.find((reading) => reading.period === activePeriod) ?? strongest ?? readings[0];
  const activeSlice = slices.find((slice) => slice.reading.period === active.period);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_22px_70px_-52px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-950/45">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Return mix
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
            1W to Overall % return
          </h3>
        </div>
        {strongest && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums ${chipFor(strongest.value)}`}>
            {strongest.label} {formatSignedPercent(strongest.value)}
          </span>
        )}
      </figcaption>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[170px_1fr] sm:items-center">
        <div className="relative mx-auto h-40 w-40">
          <svg
            viewBox="0 0 144 144"
            role="img"
            aria-label={`Pie chart of returns for ${stock.ticker}, interactive: ${readings.map((reading) => `${reading.label} ${formatSignedPercent(reading.value)}`).join(", ")}`}
            className="h-full w-full drop-shadow-sm"
          >
            <circle cx="72" cy="72" r="67" fill="currentColor" className="text-slate-100 dark:text-slate-800" />
            {slices.map(({ reading, path }) => {
              const selected = reading.period === active.period;

              return (
                <path
                  key={reading.period}
                  d={path}
                  fill={reading.color}
                  stroke="white"
                  strokeWidth={selected ? 4 : 2}
                  opacity={selected ? 1 : 0.82}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${reading.label} return, ${formatSignedPercent(reading.value)}`}
                  className="cursor-pointer outline-none transition duration-200 hover:opacity-100 focus:opacity-100"
                  style={{ transform: selected ? "scale(1.035)" : "scale(1)", transformOrigin: "72px 72px" }}
                  onMouseEnter={() => setActivePeriod(reading.period)}
                  onFocus={() => setActivePeriod(reading.period)}
                  onClick={() => setActivePeriod(reading.period)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActivePeriod(reading.period);
                    }
                  }}
                />
              );
            })}
            <circle cx="72" cy="72" r="34" fill="white" className="dark:fill-slate-950" />
            <circle cx="72" cy="72" r="34" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/80 dark:text-white/10" />
          </svg>

          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{active.label}</span>
              <span className={`mt-0.5 block text-sm font-black tabular-nums ${toneFor(active.value)}`}>
                {formatSignedPercent(active.value)}
              </span>
              {activeSlice && (
                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {(activeSlice.share * 100).toFixed(1)}% slice
                </span>
              )}
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-1.5">
          {readings.map((reading) => (
            <li
              key={reading.period}
              className="min-w-0"
            >
              <button
                type="button"
                onMouseEnter={() => setActivePeriod(reading.period)}
                onFocus={() => setActivePeriod(reading.period)}
                onClick={() => setActivePeriod(reading.period)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-1.5 text-left transition ${
                  active.period === reading.period
                    ? "border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
                    : "border-slate-100 bg-slate-50/70 hover:border-slate-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: reading.color }} />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{reading.label}</span>
                </span>
                <span className={`text-xs font-black tabular-nums ${toneFor(reading.value)}`}>
                  {formatSignedPercent(reading.value)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
        Select a slice or row to inspect that window. Slice size uses absolute move size, so gains and losses are both
        visible. Overall is measured from the oldest available archive close to today&apos;s latest price.
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * The comparison, one metric per row.
 *
 * Rows are metrics and columns are companies, so a reader compares across a row — which is the
 * question being asked ("who has the best one-year return?"), rather than reading four separate
 * cards and holding the numbers in their head.
 */
export function ComparisonTable({ stock, peers }: { stock: DetailStock; peers: DetailStock[] }) {
  const columns = [stock, ...peers];

  const rows: { label: string; cell: (s: DetailStock) => string; tone?: (s: DetailStock) => string }[] = [
    { label: "Price", cell: (s) => formatRupee(s.price) },
    { label: "Today", cell: (s) => formatSignedPercent(s.changePercent), tone: (s) => toneFor(s.changePercent) },
    ...DETAIL_PERIODS.map((period) => ({
      label: `${period} return`,
      cell: (s: DetailStock) => (s.returns[period] === null || s.returns[period] === undefined ? "—" : formatSignedPercent(s.returns[period])),
      tone: (s: DetailStock) => toneFor(s.returns[period]),
    })),
    { label: "Market cap", cell: (s) => (s.marketCapCr === null ? "—" : formatCrore(s.marketCapCr * 1e7)) },
    { label: "Cap tier", cell: (s) => s.capTier ?? "—" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <caption className="sr-only">
          {stock.ticker} compared with the top performers in {stock.sector ?? "its category"}, one metric per row
        </caption>
        <thead className="bg-slate-50 dark:bg-slate-900">
          <tr>
            <th scope="col" className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Metric
            </th>
            {columns.map((column, index) => (
              <th
                key={column.code}
                scope="col"
                className={`px-2.5 py-2 text-right text-[11px] font-bold ${
                  index === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {column.ticker}
                {index === 0 && <span className="ml-1 text-[9px] font-semibold uppercase text-slate-400">this</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-slate-200 dark:border-slate-800">
              <th scope="row" className="px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-500 dark:text-slate-400">
                {row.label}
              </th>
              {columns.map((column) => (
                <td
                  key={column.code}
                  className={`px-2.5 py-1.5 text-right text-xs font-semibold tabular-nums ${row.tone ? row.tone(column) : "text-slate-800 dark:text-slate-200"}`}
                >
                  {row.cell(column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

/** One class of owner, as the shareholding endpoint reports it. */
type OwnerSlice = {
  key: string;
  label: string;
  percent: number;
  holders?: number | null;
  /** The classes inside the class — "Indian promoters", "Central government", and so on. */
  detail?: { label: string; percent: number; holders?: number | null }[];
};

type OwnershipPayload = { company?: string; quarter?: string; groups?: OwnerSlice[]; error?: string };

/**
 * A colour per owner class, and which of them are called out.
 *
 * Promoters and government are `lead`: the two the question "who is behind this company" is really
 * about. A promoter stake is control, and a government stake usually means policy is a shareholder
 * — both change how the same price move should be read, and neither should have to be picked out
 * of a list of seven identical grey bars.
 */
const OWNER_CHROME: Record<string, { bar: string; chip: string; lead: boolean }> = {
  promoters: { bar: "bg-emerald-500 dark:bg-emerald-400", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200", lead: true },
  government: { bar: "bg-amber-500 dark:bg-amber-400", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", lead: true },
  fii: { bar: "bg-sky-500 dark:bg-sky-400", chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200", lead: false },
  dii: { bar: "bg-violet-500 dark:bg-violet-400", chip: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200", lead: false },
  bodies: { bar: "bg-teal-500 dark:bg-teal-400", chip: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200", lead: false },
  retail: { bar: "bg-slate-400 dark:bg-slate-500", chip: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200", lead: false },
  others: { bar: "bg-slate-300 dark:bg-slate-600", chip: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200", lead: false },
};

const OWNER_FALLBACK = { bar: "bg-slate-300 dark:bg-slate-600", chip: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200", lead: false };

/**
 * Who holds the company, and how much of it.
 *
 * Promoters, foreign portfolio investors, domestic institutions, government and individual
 * shareholders, straight from the company's own quarterly filing through the same
 * `/api/market/shareholding` endpoint the ownership board reads. Nothing here is inferred from
 * price or volume, and a class that holds nothing is left out rather than drawn as a zero-width
 * wedge — a filing reporting 0% government holding is reporting an absence.
 *
 * Fetched when the sheet opens rather than with the board behind it: a page of five rows would
 * otherwise pull five filings nobody had asked to see.
 */
function OwnershipSection({ symbol, sector }: { symbol: string; sector: string | null }) {
  const [owners, setOwners] = useState<OwnerSlice[] | null>(null);
  const [quarter, setQuarter] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // No state is reset here, and none needs to be: the caller keys this on the ticker, so opening a
  // second company remounts the section with fresh state rather than showing the first company's
  // register while the new filing is still in flight.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/market/shareholding?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as OwnershipPayload;
        if (!response.ok) throw new Error(body.error || "no filing");
        return body;
      })
      .then((body) => {
        setOwners((body.groups ?? []).filter((slice) => slice.percent > 0));
        setQuarter(body.quarter ?? null);
      })
      .catch(() => {
        // Not every scrip on a 4,900-company exchange has a readable filing, and a missing one is
        // not an error in the sheet around it — the rest of the panel is still worth reading.
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, [symbol]);

  // Control first, then the money that follows it, then everybody else. Percent order alone would
  // put a 45% retail float above a 30% promoter holding, which is the wrong lead for a company.
  const ordered = [...(owners ?? [])].sort((a, b) => {
    const lead = Number((OWNER_CHROME[b.key] ?? OWNER_FALLBACK).lead) - Number((OWNER_CHROME[a.key] ?? OWNER_FALLBACK).lead);
    return lead || b.percent - a.percent;
  });

  const leaders = ordered.filter((owner) => (OWNER_CHROME[owner.key] ?? OWNER_FALLBACK).lead);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_22px_70px_-56px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-950/45">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Who owns it{quarter ? ` · as filed for ${quarter}` : ""}
      </h3>
      <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        Every class on the register, from the company&apos;s own quarterly filing
        {sector ? <> — a {sector.toLowerCase()} company</> : null}. Promoters and government are
        called out because those two are control rather than a position.
      </p>

      {failed ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          No shareholding filing could be read for this company.
        </p>
      ) : owners === null ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Reading the filing…</p>
      ) : ordered.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          This company&apos;s latest filing does not break its register down.
        </p>
      ) : (
        <>
          {leaders.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {leaders.map((owner) => (
                <span
                  key={`lead-${owner.key}`}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${(OWNER_CHROME[owner.key] ?? OWNER_FALLBACK).chip}`}
                >
                  {owner.label} {owner.percent.toFixed(2)}%
                </span>
              ))}
            </div>
          )}

          <ul className="mt-2 flex flex-col gap-2">
            {ordered.map((owner) => {
              const chrome = OWNER_CHROME[owner.key] ?? OWNER_FALLBACK;

              return (
                <li key={owner.key}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-32 shrink-0 truncate text-[11px] ${chrome.lead ? "font-bold text-slate-900 dark:text-white" : "font-semibold text-slate-700 dark:text-slate-300"}`}
                    >
                      {owner.label}
                    </span>
                    {/* The bar is the comparison; the number beside it is the fact. Neither on its
                        own answers "who holds most of this company" at a glance. */}
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className={`block h-full rounded-full ${chrome.bar}`} style={{ width: `${Math.min(100, owner.percent)}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {owner.percent.toFixed(2)}%
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-[10px] tabular-nums text-slate-400 sm:block dark:text-slate-500">
                      {owner.holders ? `${owner.holders.toLocaleString("en-IN")} holders` : ""}
                    </span>
                  </div>

                  {/* The classes inside the class: Indian and foreign promoters, central and state
                      government, and so on. "Who is investing how much" is not answered by a single
                      promoter line when two different promoters are behind it. */}
                  {(owner.detail ?? []).length > 0 && (
                    <ul className="mt-1 ml-2 flex flex-col gap-0.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                      {(owner.detail ?? []).map((part) => (
                        <li key={`${owner.key}-${part.label}`} className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[10px] text-slate-500 dark:text-slate-400">{part.label}</span>
                          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                            {part.percent.toFixed(2)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Everything about one company, opened by clicking it anywhere on the site.
 *
 * `symbol` drives the fetch; passing null closes the sheet. The request is re-run whenever the
 * symbol changes, so clicking a second stock while the first is open replaces the contents rather
 * than stacking another sheet.
 */
export function StockDetailModal({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(symbol));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setLoading(true);
      setError(null);
      setDetail(null);
    });

    fetch(`/api/market/stock-detail?q=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!live) return;
        if (!response.ok) {
          setError(data?.error ?? "That company could not be loaded.");
          return;
        }
        setDetail(data);
      })
      .catch(() => {
        if (live) setError("The exchange feed could not be reached just now.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    // Guards against a slow first request landing after the reader has clicked a different stock.
    return () => {
      live = false;
    };
  }, [symbol]);

  const stock = detail?.stock;

  const header = stock ? (
    <div className="flex min-w-0 items-center gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <CompanyLogo symbol={stock.ticker} size={34} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">BSE stock detail</p>
        <p className="mt-0.5 truncate text-lg font-black text-slate-950 dark:text-white">{stock.ticker}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{stock.name}</p>
      </div>
      <div className="ml-auto shrink-0 text-right">
        <p className="text-lg font-black tabular-nums text-slate-950 dark:text-white">{formatRupee(stock.price)}</p>
        <span className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(stock.changePercent)}`}>
          {formatSignedPercent(stock.changePercent)}
        </span>
      </div>
    </div>
  ) : (
    <p className="text-sm font-semibold text-slate-900 dark:text-white">{symbol ?? "Stock"}</p>
  );

  return (
    <AppleModal open={symbol !== null} onClose={onClose} wide dense label={`${symbol ?? "Stock"} detail`} header={header}>
      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Reading the exchange…</p>}

      {error && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {detail && stock && (
        <div className="flex flex-col gap-3 rounded-[24px] bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 p-1 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/15">
          <div className="flex flex-wrap items-center gap-2 px-1">
            {stock.sector && (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
                {stock.sector}
              </span>
            )}
            {stock.capTier && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                {stock.capTier} cap
              </span>
            )}
            {detail.sessionDate && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                BSE session {detail.sessionDate}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TrajectoryChart points={stock.trajectory} />
            <ReturnsPieChart stock={stock} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_22px_70px_-56px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-950/45">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Against the top performers in its category
            </h3>
            {detail.peerBasis && detail.peers.length > 0 && (
              <p className="mt-1 mb-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                The three strongest one-year performers in{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{detail.peerBasis.category}</span>
                {detail.peerBasis.capTier ? (
                  <> among {detail.peerBasis.capTier.toLowerCase()}-cap companies, so the comparison is like for like.</>
                ) : (
                  <> across every cap tier — its own tier does not yet have three classified companies to rank.</>
                )}
              </p>
            )}

            {detail.peers.length > 0 ? (
              <ComparisonTable stock={stock} peers={detail.peers} />
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail.note}</p>
            )}
          </section>

          {/* Who actually holds the company, under what it has been doing. A reader who has just
              seen a stock move asks two questions in a row — how has it performed, and who owns it
              — and answering the second one used to mean a separate sheet reached from a different
              board. */}
          <OwnershipSection key={stock.ticker} symbol={stock.ticker} sector={stock.sector} />

          <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
            Every figure here is BSE&apos;s own published data for the session shown — quotes from the exchange tape,
            returns measured against its session archive. Nothing is modelled or estimated, and a window the archive
            cannot reach is left blank rather than filled in. Not investment advice.
          </p>
        </div>
      )}
    </AppleModal>
  );
}
