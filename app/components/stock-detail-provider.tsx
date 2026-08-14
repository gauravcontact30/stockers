"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { track } from "../lib/track";
import { useOnceOpen } from "./use-once-open";

/**
 * The detail sheet, loaded the first time a row is clicked.
 *
 * This provider wraps whole pages, so a static import put the sheet — and the charts, quote panel
 * and AI verdict inside it — into the bundle of every page that has a board on it, whether or not
 * anybody ever opened a company.
 */
const StockDetailModal = dynamic(() => import("./stock-detail-modal").then((module) => module.StockDetailModal));

/**
 * One stock-detail sheet for the whole app.
 *
 * Every board — movers, categories, directory, watchlist — wants the same panel when a row is
 * clicked. Mounting it once here and opening it by ticker means those boards need no modal state
 * of their own, and two sheets can never end up stacked on top of each other.
 */
type StockDetailValue = {
  /** Opens the sheet on one company, by ticker, scrip code or ISIN. */
  openStock: (symbol: string) => void;
  close: () => void;
  /** The company currently open, or null. */
  symbol: string | null;
};

const StockDetailContext = createContext<StockDetailValue | null>(null);

export function StockDetailProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const everOpened = useOnceOpen(symbol !== null);

  const openStock = useCallback((next: string) => setSymbol(next), []);
  const close = useCallback(() => setSymbol(null), []);

  const value = useMemo<StockDetailValue>(() => ({ openStock, close, symbol }), [openStock, close, symbol]);

  return (
    <StockDetailContext.Provider value={value}>
      {children}
      {everOpened && <StockDetailModal symbol={symbol} onClose={close} />}
    </StockDetailContext.Provider>
  );
}

/**
 * Rendered outside the provider — an isolated test, say — this is inert rather than throwing, so a
 * board that offers the click can still be rendered on its own.
 */
export function useStockDetail(): StockDetailValue {
  return useContext(StockDetailContext) ?? { openStock: () => {}, close: () => {}, symbol: null };
}

/**
 * A company name that opens its detail sheet.
 *
 * A button rather than a div with a handler: this is a real control, and it has to be reachable by
 * keyboard and announced as something that can be activated. `text-left` because a button centres
 * its content by default, which would break every row it sits in.
 */
export function StockDetailTrigger({
  symbol,
  className = "",
  children,
}: {
  symbol: string;
  className?: string;
  children: ReactNode;
}) {
  const { openStock } = useStockDetail();

  return (
    <button
      type="button"
      onClick={() => {
        // Which companies people actually look into is the single most useful thing the admin
        // dashboard can know about a stock app, and this is the one door every board opens it by.
        track("stock.open", symbol);
        openStock(symbol);
      }}
      aria-label={`Open details for ${symbol}`}
      className={`min-w-0 text-left transition hover:text-emerald-600 dark:hover:text-emerald-400 ${className}`}
    >
      {children}
    </button>
  );
}
