"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { StockCombobox } from "./stock-combobox";

export type TopPerformer = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  price: number | null;
  changePercent: number | null;
  periodReturn: number;
};

type PeriodKey = "1y" | "3y" | "5y" | "max";
type Direction = "gainers" | "losers";

/**
 * What came back for one set of controls — including a failed request, so it is not retried blind.
 *
 * Exported so the server wrapper in ./streamed-top-performers can build one and hand it over as
 * this board's opening value; `key` is what ties it to the controls it answers.
 */
export type Board = {
  key: string;
  stocks: TopPerformer[];
  total: number;
  page: number;
  pages: number;
  asOf: string | null;
  failed: boolean;
};

const PAGE_SIZE = 5;

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "Overall" },
];

/** How each window reads in a sentence, so the heading says what the tab means. */
const CAPTION: Record<PeriodKey, string> = {
  "1y": "the last one year",
  "3y": "the last three years",
  "5y": "the last five years",
  max: "the whole listed history",
};

const TABS: { key: Direction; label: string }[] = [
  { key: "gainers", label: "Top Gainers" },
  { key: "losers", label: "Top Losers" },
];

/**
 * A return, read the way the size of it deserves.
 *
 * Over the whole listed history the honest figure for a name like CG Power is +571,228%, which is
 * a number nobody parses. Past ten-fold it is shown as the multiple it is — 5,713x — and below
 * that as the percentage everyone expects.
 */
export function formatReturn(value: number): string {
  if (value >= 1000) return `${(value / 100 + 1).toLocaleString("en-IN", { maximumFractionDigits: 0 })}x`;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatPrice(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * The names that moved most on the exchange, either way, over a window the reader picks.
 *
 * It sits where the lookup's result goes before anything has been looked up: an empty panel taught
 * nobody anything, and "what actually compounded, and what broke" is the question a visitor
 * arrives with. Every row is a real company — its own logo, its sector and cap tier as pills.
 *
 * The search box above it suggests across every BSE-listed company, and searching one answers for
 * that company whatever it did: the 50% bar and the gainers/losers split shape the unfiltered
 * ranking, not a name typed in. A company outside the tracked catalogue has no cached return, so
 * its history is fetched on the spot rather than the row being dropped — see ../lib/top-performers.
 */
export function TopPerformers({ prefetched }: { prefetched?: Board | null } = {}) {
  const [direction, setDirection] = useState<Direction>("gainers");
  const [period, setPeriod] = useState<PeriodKey>("1y");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // One piece of state carrying which request it answers, so "loading" is the gap between the
  // controls asked for and the board on screen rather than a flag to keep in step with them.
  //
  // Seeded from the server when the page was rendered with this board's opening view already in
  // hand — see ./streamed-top-performers. The `key` on it is what makes that safe: it is only
  // treated as the answer while the controls still match the ones it was resolved for.
  const [board, setBoard] = useState<Board | null>(prefetched ?? null);

  const term = query.trim();
  const key = `${direction}|${period}|${term.toLowerCase()}|${page}`;

  // The server's payload, held so it can be spent exactly once. Without this, a reader who changed
  // a tab and came back to the opening controls would skip the refetch and be shown figures from
  // whenever the page was rendered rather than from now.
  const unspent = useRef(prefetched?.key ?? null);

  useEffect(() => {
    if (unspent.current === key) {
      unspent.current = null;
      return;
    }

    const controller = new AbortController();

    const url = `/api/market/top-performers?direction=${direction}&period=${period}&page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(term)}`;
    // Typing is debounced so a search is one request rather than one per keystroke; pressing a
    // tab or a period is not, because that is a single deliberate act.
    const timer = window.setTimeout(
      () => {
        fetch(url, { signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("Top performers unavailable");
            return (await response.json()) as {
              stocks?: TopPerformer[];
              total?: number;
              page?: number;
              pages?: number;
              asOfDate?: string | null;
            };
          })
          .then((data) =>
            setBoard({
              key,
              stocks: data.stocks ?? [],
              total: data.total ?? 0,
              page: data.page ?? 1,
              pages: data.pages ?? 1,
              asOf: data.asOfDate ?? null,
              failed: false,
            }),
          )
          .catch(() => {
            // An aborted request is the next set of controls arriving, not a failure to report.
            if (controller.signal.aborted) return;
            setBoard({ key, stocks: [], total: 0, page: 1, pages: 1, asOf: null, failed: true });
          });
      },
      term ? 220 : 0,
    );

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [direction, period, page, term, key]);

  const settled = board?.key === key ? board : null;
  const loading = settled === null;
  const stocks = settled?.stocks ?? [];
  const pages = settled?.pages ?? 1;
  const total = settled?.total ?? 0;
  const gaining = direction === "gainers";

  // Every control resets the paging: page 4 of the gainers is not page 4 of anything else.
  const pick = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => pick(setDirection)(tab.key)}
              aria-pressed={tab.key === direction}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                tab.key === direction
                  ? tab.key === "gainers"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => pick(setPeriod)(item.key)}
              aria-pressed={item.key === period}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                item.key === period
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* What the board is showing, which a search changes: the 50% bar is a device for keeping an
          unfiltered ranking readable, and it does not apply to a company asked for by name. */}
      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
        {term
          ? `Measured returns for "${term}" over ${CAPTION[period]}`
          : `${gaining ? "Up" : "Down"} more than 50% over ${CAPTION[period]}`}
      </p>

      {/* The same box the research desk uses: it suggests across every BSE-listed company, with
          each company's own logo and its live price, and carries its own clear button. */}
      <div className="mt-3">
        <StockCombobox
          value={query}
          onChange={pick(setQuery)}
          placeholder="Search any BSE-listed company"
        />
      </div>

      {loading && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && settled.failed && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400">
          Performance history could not be reached just now. Try another period, or check back shortly.
        </p>
      )}

      {!loading && !settled.failed && stocks.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
          {term
            ? `No listed company matching "${term}" has a measured return over ${CAPTION[period]}. Newly listed and rarely traded scrips have no history to measure over that window.`
            : `No tracked company is ${gaining ? "up" : "down"} more than 50% over ${CAPTION[period]}.`}
        </p>
      )}

      {!loading && !settled.failed && stocks.length > 0 && (
        <>
          <ul className="mt-4 space-y-2">
            {stocks.map((stock, index) => {
              const up = stock.periodReturn >= 0;
              return (
                <li
                  key={stock.symbol}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.8)] transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
                >
                  {/* Rank across the whole board, not the page, so paging keeps counting up. It
                      sits beside the logo rather than on it: a badge over a company's own mark
                      covers the thing the row is there to show. */}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                      up
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    }`}
                  >
                    #{(settled.page - 1) * PAGE_SIZE + index + 1}
                  </span>

                  <CompanyLogo symbol={stock.symbol} size={40} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{stock.name}</span>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {stock.symbol}
                      </span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        {stock.sector}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                        {stock.capTier} cap
                      </span>
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-base font-bold tabular-nums ${
                        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatReturn(stock.periodReturn)}
                    </span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatPrice(stock.price)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {term ? `${total} matching "${term}"` : `${total} ${gaining ? "above" : "below"} 50%`}
              {settled.asOf ? ` · as of ${settled.asOf}` : ""} · past performance is not a prediction.
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => current - 1)}
                disabled={settled.page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
                aria-label="Previous page"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
                  <path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="min-w-16 text-center text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {settled.page} / {pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={settled.page >= pages}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
                aria-label="Next page"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
                  <path d="m8 5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
