"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CompanyLogo } from "./company-logo";

export type Suggestion = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  scripCode: string;
  price: number | null;
  changePercent: number | null;
};

/** Long enough that a fast typist makes one request, short enough that the list feels immediate. */
const DEBOUNCE_MS = 180;
const LIMIT = 24;

export function formatPrice(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChange(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/**
 * The search box for a listed company, as a dropdown over the whole exchange.
 *
 * It stays a plain text input underneath — the ticker is typed, not only picked, because a name
 * the catalogue spells differently should still be analysable. The list is a suggestion layer on
 * top of that, fetched from /api/stocks/suggest so the browser never carries the ~255 KB
 * catalogue, and every row carries the company's own logo and its last traded price so a choice
 * between two similar names can be made without leaving the box.
 */
export function StockCombobox({
  value,
  onChange,
  onSelect,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired when a row is chosen, after the input has been set to that symbol. */
  onSelect?: (symbol: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // A selection sets the input to the symbol it chose, which would otherwise look exactly like a
  // keystroke and immediately re-open the list it just closed.
  const [query, setQuery] = useState(value);
  // The row that was picked, so the field can carry that company's logo, name and last price
  // rather than only its ticker.
  const [chosen, setChosen] = useState<Suggestion | null>(null);

  const wrapper = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Held only while the box still shows what was picked. Typing over it, or the parent setting
  // another ticker (a row clicked in the market table does exactly that), drops it without an
  // effect having to chase the change.
  const selected = chosen && chosen.symbol === value ? chosen : null;

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/stocks/suggest?q=${encodeURIComponent(query.trim())}&limit=${LIMIT}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const data = (await response.json()) as { suggestions?: Suggestion[]; total?: number };
        setSuggestions(data.suggestions ?? []);
        setTotal(data.total ?? data.suggestions?.length ?? 0);
        setActive(0);
      } catch {
        // An unreachable feed leaves the box working as the plain input it was.
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  // Keeps the highlighted row inside the scroll box when the keyboard moves it. The list is only
  // in the DOM while the box is open, and scrollIntoView is absent in jsdom — neither is worth a
  // crash, so both are optional rather than asserted.
  useEffect(() => {
    const row = list.current?.children[active];
    if (row instanceof HTMLElement) row.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const update = (next: string) => {
    setQuery(next);
    onChange(next);
    setOpen(true);
  };

  const choose = (suggestion: Suggestion) => {
    setQuery(suggestion.symbol);
    setChosen(suggestion);
    onChange(suggestion.symbol);
    setOpen(false);
    onSelect?.(suggestion.symbol);
  };

  const clear = () => {
    setQuery("");
    setChosen(null);
    onChange("");
    setOpen(true);
    field.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open) {
        setOpen(true);
        return;
      }
      if (!suggestions.length) return;

      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
      return;
    }

    // Enter picks the highlighted row rather than submitting the form around it; with the list
    // closed it falls through and the form submits as usual.
    if (event.key === "Enter" && open && suggestions[active]) {
      event.preventDefault();
      choose(suggestions[active]);
    }
  };

  return (
    <div ref={wrapper} className={`relative ${className}`}>
      {/* The field is a row, not a bare input: once a company is picked it carries that company's
          logo, name and last traded price beside the ticker, so what was chosen is legible without
          re-opening the list. The focus ring sits on the row via focus-within, which is why the
          input itself is transparent and unringed. */}
      <div
        className={`flex min-h-[58px] items-center gap-3 rounded-3xl border bg-slate-50 px-3 shadow-sm transition focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/25 dark:bg-slate-950 dark:focus-within:border-emerald-500/60 ${
          selected ? "border-emerald-200 dark:border-emerald-500/40" : "border-slate-200 dark:border-slate-700"
        }`}
      >
        {selected ? (
          <CompanyLogo symbol={selected.symbol} size={36} />
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true" className="ml-1 h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500">
            <path
              d="M9 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm4.2 9.7 3.3 3.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}

        <span className="min-w-0 flex-1">
          <input
            ref={field}
            value={value}
            onChange={(event) => update(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className={`w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500 ${
              selected ? "text-sm font-bold uppercase tracking-wide" : "py-3"
            }`}
          />
          {selected && (
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
              {selected.name} · {selected.sector}
            </span>
          )}
        </span>

        {selected && (
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
              {formatPrice(selected.price)}
            </span>
            {selected.changePercent !== null && (
              <span
                className={`block text-xs font-semibold tabular-nums ${
                  selected.changePercent >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatChange(selected.changePercent)}
              </span>
            )}
          </span>
        )}

        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            title="Clear search"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
              <path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_70px_-30px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {query.trim() ? "BSE listed matches" : "Popular BSE stocks"}
            </p>
            <p className="text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {loading ? "Searching…" : total > suggestions.length ? `${suggestions.length} of ${total}` : `${total}`}
            </p>
          </div>

          {/* The list scrolls on its own: the whole exchange is searchable, so the answer to a
              two-letter query is longer than any panel should grow to. */}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
          >
            {suggestions.map((suggestion, index) => {
              const up = (suggestion.changePercent ?? 0) >= 0;
              return (
                <li key={suggestion.symbol} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    // mousedown fires before the input's blur, so the row is chosen rather than
                    // lost to the outside-click handler closing the list first.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(suggestion)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      index === active ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-transparent"
                    }`}
                  >
                    <CompanyLogo symbol={suggestion.symbol} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {suggestion.name}
                        </span>
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {suggestion.symbol}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {suggestion.sector} · {suggestion.capTier} cap
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatPrice(suggestion.price)}
                      </span>
                      {suggestion.changePercent !== null && (
                        <span
                          className={`block text-xs font-semibold tabular-nums ${
                            up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {formatChange(suggestion.changePercent)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}

            {!suggestions.length && (
              <li className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {loading ? "Searching the exchange…" : `Nothing listed matches "${query.trim()}".`}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
