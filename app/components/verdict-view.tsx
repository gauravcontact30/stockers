"use client";

import { CompanyLogo } from "./company-logo";
import { chipFor, formatRupee, formatSignedPercent, sectorTone, toneFor } from "./market-format";

export type Stance = "Buy" | "Hold" | "Sell";

export type StockVerdict = {
  symbol: string;
  name: string;
  sector: string | null;
  capTier: "Large" | "Mid" | "Small" | null;
  price: number | null;
  oneDay: number | null;
  oneWeek: number | null;
  oneMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  score: number;
  stance: Stance;
  rationale: string;
  source: "ai" | "heuristic";
};

const STANCE_STYLES: Record<Stance, string> = {
  Buy: "bg-emerald-600 text-white",
  Hold: "bg-amber-500 text-white",
  Sell: "bg-rose-600 text-white",
};

export const STANCE_LABELS: Record<Stance, string> = {
  Buy: "Outperform",
  Hold: "Hold",
  Sell: "Underperform",
};

export function StanceBadge({ stance, size = "md" }: { stance: Stance; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-bold tracking-wide ${STANCE_STYLES[stance]} ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      }`}
    >
      {STANCE_LABELS[stance].toUpperCase()}
    </span>
  );
}

export function CapBadge({ tier }: { tier: StockVerdict["capTier"] }) {
  if (!tier) return null;
  return (
    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      {tier} cap
    </span>
  );
}

/** The 0-100 momentum score as a bar, so peers can be eyeballed against each other. */
export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <span
          className={`block h-full rounded-full ${score >= 62 ? "bg-emerald-500" : score < 42 ? "bg-rose-500" : "bg-amber-500"}`}
          style={{ width: `${score}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{score}</span>
    </div>
  );
}

const PERIODS: { key: keyof Pick<StockVerdict, "oneDay" | "oneWeek" | "oneMonth" | "sixMonth" | "oneYear">; label: string }[] = [
  { key: "oneDay", label: "1D" },
  { key: "oneWeek", label: "1W" },
  { key: "oneMonth", label: "1M" },
  { key: "sixMonth", label: "6M" },
  { key: "oneYear", label: "1Y" },
];

const RANK_TONES = [
  "border-sky-200 bg-sky-50 text-sky-700 shadow-sky-200/60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-200/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  "border-amber-200 bg-amber-50 text-amber-700 shadow-amber-200/60 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  "border-violet-200 bg-violet-50 text-violet-700 shadow-violet-200/60 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  "border-rose-200 bg-rose-50 text-rose-700 shadow-rose-200/60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
];

function rankTone(rank: number): string {
  return RANK_TONES[(rank - 1) % RANK_TONES.length];
}

/**
 * One stock per card, full width.
 *
 * A table is the right shape for two or three stocks side by side, but a peer group of four with
 * five return windows, a score, a call and a sentence of reasoning each becomes a wall of figures.
 * As cards, every company reads as one self-contained brief.
 */
function VerdictCard({ stock, rank, note }: { stock: StockVerdict; rank: number; note?: string | null }) {
  const noteTone =
    note === "Leads the group"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white transition dark:bg-slate-950/40 ${
        note
          ? "border-emerald-300 shadow-[0_18px_40px_-28px_rgba(5,150,105,0.7)] dark:border-emerald-500/40"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      {/* Flexible columns prevent long company names or sector chips from pushing into metrics. */}
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)_minmax(160px,auto)] xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <CompanyLogo symbol={stock.symbol} size={48} className="shadow-sm ring-4 ring-white dark:ring-slate-950" />
            <span
              aria-label={`Rank ${rank}`}
              className={`flex h-7 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-bold tabular-nums shadow-sm ${rankTone(rank)}`}
            >
              {rank}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 break-words text-lg font-bold tracking-tight text-slate-950 dark:text-white">{stock.symbol}</p>
              <CapBadge tier={stock.capTier} />
            </div>
            <p className="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">{stock.name}</p>
            <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5">
              {stock.sector && (
                <span className={`max-w-full whitespace-normal break-words rounded-full px-2.5 py-1 text-[11px] font-semibold ${sectorTone(stock.sector)}`}>
                  {stock.sector}
                </span>
              )}
              {note && (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${noteTone}`}>
                  {note}
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2">
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Price</dt>
            <dd className="mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {formatRupee(stock.price)}
            </dd>
          </div>

          {PERIODS.map((period) => (
            <div key={period.key} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {period.label}
              </dt>
              <dd className={`mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums ${toneFor(stock[period.key])}`}>
                {formatSignedPercent(stock[period.key])}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 xl:flex-col xl:items-end xl:gap-2 dark:border-slate-800 dark:bg-slate-900/60">
          <StanceBadge stance={stock.stance} />
          <ScoreBar score={stock.score} />
        </div>
      </div>

      <p className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        {stock.rationale}
      </p>
    </li>
  );
}

/** A peer group as cards, strongest first. */
export function VerdictCards({ stocks, leader, laggard }: { stocks: StockVerdict[]; leader?: string | null; laggard?: string | null }) {
  const ordered = [...stocks].sort((a, b) => b.score - a.score);

  return (
    <ul className="space-y-3">
      {ordered.map((stock, index) => (
        <VerdictCard
          key={stock.symbol}
          stock={stock}
          rank={index + 1}
          note={stock.symbol === leader ? "Leads the group" : stock.symbol === laggard ? "Trails the group" : null}
        />
      ))}
    </ul>
  );
}

/** The compact form, for the per-section panel where there is no room for a table. */
export function VerdictStrip({ stocks }: { stocks: StockVerdict[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {stocks.map((stock) => (
        <li
          key={stock.symbol}
          className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <CompanyLogo symbol={stock.symbol} size={28} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{stock.symbol}</p>
                  <CapBadge tier={stock.capTier} />
                </div>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{stock.name}</span>
              </div>
            </div>
            <StanceBadge stance={stock.stance} size="sm" />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${chipFor(stock.oneMonth)}`}>
              1M {formatSignedPercent(stock.oneMonth)}
            </span>
            <ScoreBar score={stock.score} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{stock.rationale}</p>
        </li>
      ))}
    </ul>
  );
}

export function SourceNote({ source }: { source: "ai" | "heuristic" }) {
  return (
    <>
      {source === "ai" ? "Rationale written by AI agent" : "Rationale composed from the returns (no AI key configured)"} - calls
      are derived from measured performance, not opinion - not investment advice.
    </>
  );
}
