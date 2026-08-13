"use client";

import { useEffect, useMemo, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { indianStocks, sectors, type CapTier, type StockMeta } from "../lib/indian-stocks";
import { track } from "../lib/track";

/**
 * A searchable, category-grouped picker over every company listed on the exchange.
 *
 * It reads from two places at once, and that is deliberate. The ~390 hand-classified names in
 * indian-stocks.ts are in the browser already, so they group and render the instant a key is
 * pressed. The other ~4,560 BSE scrips live behind /api/stocks/search — packed, the full exchange
 * is a quarter of a megabyte, which is not worth putting in every visitor's bundle to save a
 * request. Local results show first and are replaced the moment the exchange answers, so the box
 * never sits empty waiting on a network round trip.
 */

export const ALL_SECTORS = "All categories";

/** How many sectors and rows the dropdown draws at once. */
const MAX_GROUPS = 8;
const MAX_PER_GROUP = 6;

/** Long enough that typing a ticker is one request, short enough to feel immediate. */
const DEBOUNCE_MS = 180;

export type StockGroup = { sector: string; stocks: StockMeta[]; total: number };

const CAP_STYLE: Record<CapTier, string> = {
  Large: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Mid: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Small: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

/**
 * Every category the filter offers.
 *
 * All of them, now — the filter reaches the whole exchange, and BSE files listed companies under
 * every sector this app defines. It used to hide the ones with no hand-classified company behind
 * them, which today would hide categories that have hundreds of real listings in them.
 */
export const SECTOR_NAMES: string[] = sectors.map((sector) => sector.name);

/**
 * Matches for a query among the hand-classified names, bucketed by sector.
 *
 * A ticker match ranks above a company-name match within its group — someone typing "TCS" means
 * the ticker, not "Rashtriya Chemicals" for the letters buried in its name.
 */
export function groupBySector(query: string, sector: string): StockGroup[] {
  const term = query.trim().toLowerCase();

  const matches = indianStocks.filter((stock) => {
    if (sector !== ALL_SECTORS && stock.sector !== sector) return false;
    if (!term) return true;
    return stock.symbol.toLowerCase().includes(term) || stock.name.toLowerCase().includes(term);
  });

  const groups = new Map<string, StockMeta[]>();
  for (const stock of matches) {
    const bucket = groups.get(stock.sector);
    if (bucket) bucket.push(stock);
    else groups.set(stock.sector, [stock]);
  }

  return [...groups.entries()]
    .map(([name, stocks]) => ({
      sector: name,
      total: stocks.length,
      stocks: [...stocks]
        .sort((a, b) => rank(a, term) - rank(b, term) || a.symbol.localeCompare(b.symbol))
        .slice(0, MAX_PER_GROUP),
    }))
    .slice(0, MAX_GROUPS);
}

function rank(stock: StockMeta, term: string): number {
  if (!term) return 1;
  if (stock.symbol.toLowerCase().startsWith(term)) return 0;
  if (stock.symbol.toLowerCase().includes(term)) return 1;
  return 2;
}

/** Every match, not just the ones drawn — so the footer can say what is being held back. */
export function countMatches(groups: StockGroup[]): number {
  return groups.reduce((sum, group) => sum + group.total, 0);
}

type ExchangeGroup = { sector: string; total: number; stocks: { symbol: string; name: string; sector: string; capTier: CapTier }[] };
type ExchangeAnswer = { groups: ExchangeGroup[]; total: number };

/** What the two sources agree to look like once the exchange has answered. */
function adoptExchange(answer: ExchangeAnswer): StockGroup[] {
  return answer.groups.map((group) => ({
    sector: group.sector,
    total: group.total,
    stocks: group.stocks.map((stock) => ({
      symbol: stock.symbol,
      // Only ever drawn from, never fetched with — the picker reports a symbol and the analysis
      // route resolves it properly.
      yahooSymbol: `${stock.symbol}.NS`,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
    })),
  }));
}

/**
 * The whole exchange's answer for a query, or null while the local one is the best we have.
 *
 * Two things make this safe to render straight into the list: the answer is tagged with the query
 * it belongs to, so a slow reply for "inf" can never overwrite the results for "infy"; and a
 * failed request leaves it null, which falls back to the hand-classified catalogue rather than
 * emptying the dropdown.
 */
function useExchangeSearch(query: string, sector: string, active: boolean): StockGroup[] | null {
  const [answer, setAnswer] = useState<{ key: string; groups: StockGroup[] } | null>(null);
  const key = `${query.trim().toLowerCase()}|${sector}`;

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = `/api/stocks/search?q=${encodeURIComponent(query.trim())}&sector=${encodeURIComponent(sector)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        setAnswer({ key, groups: adoptExchange(await response.json()) });
      } catch {
        // Aborted, offline, or a bad payload — the local catalogue stays on screen either way.
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, query, sector, active]);

  return answer && answer.key === key ? answer.groups : null;
}

export function StockExplorer({ onSelect, selected }: { onSelect: (symbol: string) => void; selected?: string }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState(ALL_SECTORS);
  const [open, setOpen] = useState(false);

  const local = useMemo(() => groupBySector(query, sector), [query, sector]);
  const exchange = useExchangeSearch(query, sector, open);
  const groups = exchange ?? local;

  const shown = groups.reduce((sum, group) => sum + group.stocks.length, 0);
  const total = countMatches(groups);

  const choose = (stock: StockMeta) => {
    // Recorded on the choice rather than on the typing: a keystroke is not a search, and what
    // somebody was halfway through spelling is not something worth keeping.
    track("stock.search", stock.symbol);
    onSelect(stock.symbol);
    setQuery(stock.symbol);
    setOpen(false);
  };

  const filtered = query.trim() !== "" || sector !== ALL_SECTORS;

  return (
    /**
     * Focus containment, not a blur timer.
     *
     * The first version deferred the close by 120ms and hoped the click landed first. Opening the
     * native category select blurred the input, and the option list stayed up for as long as the
     * reader took to read it — so the popup unmounted mid-choice and the selection was lost.
     * Closing only when focus leaves this wrapper entirely has no race in it at all.
     */
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls="stock-explorer-popup"
        aria-label="Search any listed stock"
        placeholder="Search every listed stock by name or ticker — try “defence”, “HDFC”, “E2E”"
        className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />

      {open && (
        <div
          id="stock-explorer-popup"
          // One dropdown holds everything: the category filter, the clear, and the results
          // divided by category. Nothing about the search lives outside it.
          className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Category
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {total} {total === 1 ? "match" : "matches"}
              </span>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSector(ALL_SECTORS);
                  }}
                  className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/*
              A rail of our own chips rather than a native <select>. A browser draws that option
              list itself — system font, system blue highlight, no way to style it — so it never
              matched the rest of the panel. These are ordinary buttons, so they look like the
              product and every category is visible at a glance instead of hidden behind a click.
            */}
            <div
              role="group"
              aria-label="Filter by category"
              className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1"
            >
              {[ALL_SECTORS, ...SECTOR_NAMES].map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={sector === name}
                  onClick={() => setSector(name)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    sector === name
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/*
            Swallowing mousedown here keeps focus in the input, so no blur fires and the click on
            a result always lands. The previous version raced a 120ms blur timer against the
            click, which lost outright if the pointer was held down for longer than that.
          */}
          <div
            role="listbox"
            aria-label="Matching stocks"
            className="max-h-80 overflow-y-auto overscroll-contain p-2"
            onMouseDown={(event) => event.preventDefault()}
          >
            {groups.map((group) => (
              <div key={group.sector} role="group" aria-label={group.sector} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                  {group.sector}
                  {group.total > group.stocks.length && (
                    <span className="ml-1 font-medium normal-case">· {group.total} in all</span>
                  )}
                </p>

                {group.stocks.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    role="option"
                    aria-selected={stock.symbol === selected}
                    onClick={() => choose(stock)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-emerald-50 dark:hover:bg-emerald-500/10 ${
                      stock.symbol === selected ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                    }`}
                  >
                    <CompanyLogo symbol={stock.symbol} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{stock.symbol}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{stock.name}</span>
                    </span>
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline ${CAP_STYLE[stock.capTier]}`}>
                      {stock.capTier} cap
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {groups.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Nothing in the catalogue matches that. Try a ticker, or widen the category.
              </p>
            )}

            {total > shown && (
              <p className="border-t border-slate-100 px-2 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                Showing {shown} of {total} matches — keep typing, or pick a category to narrow it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
