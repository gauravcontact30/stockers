"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { CompanyLogo } from "./company-logo";
import { StockExplorer } from "./stock-explorer";
import { useStockPerformance } from "./use-stock-performance";
import { indianStocks } from "../lib/indian-stocks";

/**
 * A watchlist the reader actually owns.
 *
 * The old card listed four hard-coded tickers with invented sentiment labels — nothing could be
 * added, nothing removed, and "Bullish · +2.4%" was not measured from anything. This one is the
 * reader's own list, kept in their browser, with the returns pulled from the same performance
 * endpoint every other board uses.
 */

const STORAGE_KEY = "stockers-watchlist";
/** Enough to be useful without turning the sidebar into a second board. */
export const MAX_WATCHED = 12;

/** The list as stored, filtered to symbols the catalogue still knows and capped. */
export function parseWatchlist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const known = new Set(indianStocks.map((stock) => stock.symbol));
    return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && known.has(entry)))].slice(
      0,
      MAX_WATCHED,
    );
  } catch {
    // A hand-edited or half-written entry is not worth surfacing; an empty list is recoverable.
    return [];
  }
}

/** The default list, so a first-time reader sees the card working rather than an empty box. */
export const STARTER_WATCHLIST = ["RELIANCE", "HDFCBANK", "TCS", "INFY"];

// ---------------------------------------------------------------------------
// The stored list, as an external store
// ---------------------------------------------------------------------------
// Reading localStorage during render would diverge from the server; copying it into state in an
// effect is a cascading render. `useSyncExternalStore` is neither: the server snapshot is null,
// the client snapshot is whatever is in storage, and a write notifies every card on the page.

const watchers = new Set<() => void>();

function subscribeToWatchlist(listener: () => void) {
  watchers.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    watchers.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readWatchlist(): string | null {
  // A first-time reader gets the starter list rather than an empty card, and it is written down
  // so removing from it sticks.
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored;
  const starter = JSON.stringify(STARTER_WATCHLIST);
  window.localStorage.setItem(STORAGE_KEY, starter);
  return starter;
}

/* istanbul ignore next -- only called while server-rendering, which jsdom never does. */
const readWatchlistOnServer = (): string | null => null;

function notifyWatchlist() {
  watchers.forEach((listener) => listener());
}

function formatPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toneFor(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-400 dark:text-slate-500";
  return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

/**
 * One watched stock: what it is, what it costs, and how it has done over three windows.
 *
 * Each row asks for its own returns; the hook batches every symbol raised in the same tick into
 * one request, so a list of twelve is still a single call.
 */
export function WatchRow({ symbol, onRemove }: { symbol: string; onRemove: (symbol: string) => void }) {
  const meta = indianStocks.find((stock) => stock.symbol === symbol);
  const { performance, loading } = useStockPerformance(symbol);

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-emerald-500/40">
      <div className="flex items-start gap-2.5">
        <CompanyLogo symbol={symbol} size={30} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{symbol}</span>
            <span className="shrink-0 font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-white">
              {loading ? "…" : formatPrice(performance?.price ?? null)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{meta?.name ?? "Unlisted"}</span>
            <span className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${toneFor(performance?.oneDay ?? null)}`}>
              {loading ? "" : formatPercent(performance?.oneDay ?? null)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(symbol)}
          aria-label={`Remove ${symbol} from watchlist`}
          className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-400 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-500"
        >
          ✕
        </button>
      </div>

      {/* Three windows rather than one: a day tells you almost nothing on its own. */}
      <dl className="mt-2 grid grid-cols-3 gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-800">
        {(
          [
            ["1M", performance?.oneMonth ?? null],
            ["6M", performance?.sixMonth ?? null],
            ["1Y", performance?.oneYear ?? null],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="text-center">
            <dt className="text-[9px] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">{label}</dt>
            <dd className={`font-mono text-[11px] font-bold tabular-nums ${toneFor(value)}`}>
              {loading ? "…" : formatPercent(value)}
            </dd>
          </div>
        ))}
      </dl>

      {meta && (
        <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          {meta.sector} · {meta.capTier} cap
        </p>
      )}
    </li>
  );
}

export function WatchlistCard() {
  // The list is read through an external store rather than copied into state in an effect: the
  // server has no localStorage, and `getServerSnapshot` returning null is what keeps the first
  // client render in agreement with the server before the real list arrives.
  const raw = useSyncExternalStore(subscribeToWatchlist, readWatchlist, readWatchlistOnServer);
  const [adding, setAdding] = useState(false);

  const watched = raw === null ? null : parseWatchlist(raw);

  const save = useCallback((next: string[]) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyWatchlist();
  }, []);

  const add = useCallback(
    (symbol: string) => {
      setAdding(false);
      const list = parseWatchlist(window.localStorage.getItem(STORAGE_KEY));
      if (list.includes(symbol) || list.length >= MAX_WATCHED) return;
      save([symbol, ...list]);
    },
    [save],
  );

  const remove = useCallback(
    (symbol: string) => save((watched ?? []).filter((entry) => entry !== symbol)),
    [save, watched],
  );

  const list = watched ?? [];
  const full = list.length >= MAX_WATCHED;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[0.3em] text-emerald-600 uppercase dark:text-emerald-400">Watchlist</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Your list, your stocks</h3>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          {list.length} / {MAX_WATCHED}
        </span>
      </div>

      {adding ? (
        <div className="mt-4">
          <StockExplorer onSelect={add} />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-2 text-xs font-semibold text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={full}
          className="mt-4 w-full rounded-full border border-dashed border-emerald-300 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10 dark:disabled:border-slate-700 dark:disabled:text-slate-600"
        >
          {full ? `Watchlist full — remove one to add another` : "+ Add a stock to watch"}
        </button>
      )}

      <ul className="mt-4 space-y-2.5">
        {list.map((symbol) => (
          <WatchRow key={symbol} symbol={symbol} onRemove={remove} />
        ))}
      </ul>

      {watched !== null && list.length === 0 && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Nothing on the list yet. Add a stock and its returns show up here every time you open the dashboard.
        </p>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Saved in this browser only · returns are measured from exchange closes, not estimated.
      </p>
    </section>
  );
}
