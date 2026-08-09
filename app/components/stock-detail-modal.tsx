"use client";

import { useEffect, useState } from "react";
import { AppleModal } from "./apple-modal";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatCrore, formatQuantity, formatRupee, formatSignedPercent, toneFor } from "./market-format";

// The windows the exchange archive measures, shortest first — the order a reader scans them in.
export const DETAIL_PERIODS = ["1w", "1m", "3m", "6m", "1y", "3y", "5y"] as const;

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
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
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
        className="h-40 w-full"
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

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        Eight measured closes — one per lookback window from BSE&apos;s session archive, ending at the latest price. The
        line joins them; it is not a daily series.
      </p>
    </figure>
  );
}

/** The same company's return over every window, as a bar per window. */
function ReturnsChart({ stock }: { stock: DetailStock }) {
  const readings = DETAIL_PERIODS.map((period) => ({ period, value: stock.returns[period] ?? null }));
  const widest = Math.max(...readings.map((reading) => Math.abs(reading.value ?? 0)), 1);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <figcaption className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Return by window
      </figcaption>

      <ul className="flex flex-col gap-1.5">
        {readings.map(({ period, value }) => {
          // Bars grow from a centre line so a loss reads as a loss at a glance, not as a short win.
          const share = value === null ? 0 : (Math.abs(value) / widest) * 50;
          const positive = (value ?? 0) >= 0;

          return (
            <li key={period} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{period}</span>
              <span className="relative h-4 min-w-0 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
                {value !== null && (
                  <span
                    className={`absolute inset-y-0.5 rounded ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                    style={positive ? { left: "50%", width: `${share}%` } : { right: "50%", width: `${share}%` }}
                  />
                )}
              </span>
              <span className={`w-16 shrink-0 text-right text-[11px] font-bold tabular-nums ${toneFor(value)}`}>
                {value === null ? "—" : formatSignedPercent(value)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
        Measured against BSE&apos;s close on {stock.measuredFrom["1y"] ?? "the reference session"} and equivalent
        sessions per window. A window the archive cannot reach shows a dash rather than a zero.
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Facts and comparison
// ---------------------------------------------------------------------------

/** Every field BSE publishes for the scrip, in the order a reader checks them. */
const FACTS: { label: string; value: (stock: DetailStock) => string | null }[] = [
  { label: "Open", value: (s) => (s.open === null ? null : formatRupee(s.open)) },
  { label: "Day high", value: (s) => (s.dayHigh === null ? null : formatRupee(s.dayHigh)) },
  { label: "Day low", value: (s) => (s.dayLow === null ? null : formatRupee(s.dayLow)) },
  { label: "Prev close", value: (s) => (s.previousClose === null ? null : formatRupee(s.previousClose)) },
  { label: "Volume", value: (s) => (s.volume === null ? null : formatQuantity(s.volume)) },
  // formatCrore takes a plain rupee amount and prints its own ₹, so a *Cr field is scaled back up
  // first — the same thing every other board does with these two.
  { label: "Turnover", value: (s) => (s.turnoverCr === null ? null : formatCrore(s.turnoverCr * 1e7)) },
  { label: "Trades", value: (s) => (s.trades === null ? null : formatQuantity(s.trades)) },
  { label: "Market cap", value: (s) => (s.marketCapCr === null ? null : formatCrore(s.marketCapCr * 1e7)) },
  { label: "Mcap rank", value: (s) => (s.rank === null ? null : `#${s.rank}`) },
  { label: "Scrip code", value: (s) => s.code },
  { label: "ISIN", value: (s) => s.isin || null },
  { label: "Group", value: (s) => s.group || null },
];

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
            <th scope="col" className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Metric
            </th>
            {columns.map((column, index) => (
              <th
                key={column.code}
                scope="col"
                className={`px-3 py-2.5 text-right text-[11px] font-bold ${
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
              <th scope="row" className="px-3 py-2 text-[11px] font-semibold whitespace-nowrap text-slate-500 dark:text-slate-400">
                {row.label}
              </th>
              {columns.map((column) => (
                <td
                  key={column.code}
                  className={`px-3 py-2 text-right text-xs font-semibold tabular-nums ${row.tone ? row.tone(column) : "text-slate-800 dark:text-slate-200"}`}
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

/**
 * Everything about one company, opened by clicking it anywhere on the site.
 *
 * `symbol` drives the fetch; passing null closes the sheet. The request is re-run whenever the
 * symbol changes, so clicking a second stock while the first is open replaces the contents rather
 * than stacking another sheet.
 */
export function StockDetailModal({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    let live = true;
    setLoading(true);
    setError(null);
    setDetail(null);

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
      <CompanyLogo symbol={stock.ticker} size={40} />
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-slate-900 dark:text-white">{stock.ticker}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{stock.name}</p>
      </div>
      <div className="ml-auto shrink-0 text-right">
        <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(stock.price)}</p>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(stock.changePercent)}`}>
          {formatSignedPercent(stock.changePercent)}
        </span>
      </div>
    </div>
  ) : (
    <p className="text-sm font-semibold text-slate-900 dark:text-white">{symbol ?? "Stock"}</p>
  );

  return (
    <AppleModal open={symbol !== null} onClose={onClose} label={`${symbol ?? "Stock"} detail`} header={header}>
      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Reading the exchange…</p>}

      {error && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {detail && stock && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {stock.sector && (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
                {stock.sector}
              </span>
            )}
            {stock.capTier && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {stock.capTier} cap
              </span>
            )}
            {detail.sessionDate && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">BSE session {detail.sessionDate}</span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrajectoryChart points={stock.trajectory} />
            <ReturnsChart stock={stock} />
          </div>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              The session, as the exchange published it
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {FACTS.map((fact) => {
                const value = fact.value(stock);
                // A field the feed did not carry is dropped rather than printed as a dash: an
                // absent ISIN is not a value, and a grid of dashes reads as a broken panel.
                if (value === null) return null;
                return (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{fact.label}</dt>
                    <dd className="truncate text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Against the top performers in its category
            </h3>
            {detail.peerBasis && detail.peers.length > 0 && (
              <p className="mt-1 mb-2 text-xs text-slate-500 dark:text-slate-400">
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

          <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
            Every figure here is BSE&apos;s own published data for the session shown — quotes from the exchange tape,
            returns measured against its session archive. Nothing is modelled or estimated, and a window the archive
            cannot reach is left blank rather than filled in. Not investment advice.
          </p>
        </div>
      )}
    </AppleModal>
  );
}
