"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { indianStocks, sectors } from "../lib/indian-stocks";

export type PickerOption = { symbol: string; name: string; sector: string; capTier: "Large" | "Mid" | "Small" };

export type PickerGroup = { sector: string; stocks: PickerOption[] };

/**
 * The full universe grouped by sector, in the order the sector list defines rather than
 * alphabetically, so related industries stay next to each other in the menu.
 */
export const pickerGroups: PickerGroup[] = sectors
  .map((sector) => ({
    sector: sector.name,
    stocks: indianStocks
      .filter((stock) => stock.sector === sector.name)
      .map((stock) => ({ symbol: stock.symbol, name: stock.name, sector: stock.sector, capTier: stock.capTier })),
  }))
  .filter((group) => group.stocks.length > 0);

export function filterGroups(groups: PickerGroup[], query: string, exclude: string[] = []): PickerGroup[] {
  const term = query.trim().toLowerCase();

  return groups
    .map((group) => ({
      sector: group.sector,
      stocks: group.stocks.filter((stock) => {
        // A stock already chosen in another slot is dropped: comparing a stock with itself
        // produces a table with nothing to say.
        if (exclude.includes(stock.symbol)) return false;
        if (!term) return true;
        return (
          stock.symbol.toLowerCase().includes(term) ||
          stock.name.toLowerCase().includes(term) ||
          group.sector.toLowerCase().includes(term)
        );
      }),
    }))
    .filter((group) => group.stocks.length > 0);
}

export function findOption(symbol: string | null): PickerOption | null {
  if (!symbol) return null;
  for (const group of pickerGroups) {
    const match = group.stocks.find((stock) => stock.symbol === symbol);
    if (match) return match;
  }
  return null;
}

/**
 * A searchable, sector-grouped stock selector.
 *
 * A native `<select>` cannot be searched and a bare text input cannot be browsed; with 270-odd
 * names across 25 sectors a reader needs both — type to narrow, or open the list and scan the
 * sector they have in mind.
 */
export function StockPicker({
  label,
  value,
  onChange,
  exclude = [],
  placeholder = "Search or pick a stock",
}: {
  label: string;
  value: string | null;
  onChange: (symbol: string | null) => void;
  exclude?: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const container = useRef<HTMLDivElement>(null);

  const selected = findOption(value);
  // Keyed on the contents of `exclude` rather than the array itself: callers build that list
  // inline, so a fresh array arrives on every render and would re-filter all 270 names each time
  // — once per keystroke, with three pickers on screen.
  const excludeKey = exclude.join(",");
  const groups = useMemo(
    () => filterGroups(pickerGroups, query, excludeKey ? excludeKey.split(",") : []),
    [query, excludeKey],
  );
  const matches = groups.reduce((count, group) => count + group.stocks.length, 0);

  useEffect(() => {
    if (!open) return;

    // Clicking anywhere else closes the menu — three of these sit side by side, and leaving one
    // open while another is used would cover the results.
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (symbol: string) => {
    onChange(symbol);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={container} className="relative">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-[11px] font-semibold text-slate-400 underline-offset-2 transition hover:text-rose-600 hover:underline dark:text-slate-500 dark:hover:text-rose-400"
          >
            Clear
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`mt-1.5 flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition ${
          selected
            ? "border-violet-300 bg-violet-50/60 dark:border-violet-500/40 dark:bg-violet-500/10"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600"
        }`}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{selected.symbol}</span>
            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
              {selected.name} · {selected.sector} · {selected.capTier} cap
            </span>
          </span>
        ) : (
          <span className="text-sm text-slate-400 dark:text-slate-500">{placeholder}</span>
        )}
        <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, symbol or sector"
              aria-label={`Search stocks for ${label}`}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <ul role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-1.5">
            {groups.map((group) => (
              <li key={group.sector}>
                <p className="sticky top-0 bg-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                  {group.sector}
                </p>
                <ul>
                  {group.stocks.map((stock) => (
                    <li key={stock.symbol}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={stock.symbol === value}
                        onClick={() => choose(stock.symbol)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-violet-50 dark:hover:bg-violet-500/10 ${
                          stock.symbol === value ? "bg-violet-50 dark:bg-violet-500/10" : ""
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{stock.symbol}</span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{stock.name}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {stock.capTier}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}

            {matches === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No stock matches “{query}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
