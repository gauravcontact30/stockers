"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * One table, everywhere.
 *
 * Every tabular surface in the app had grown its own answer to the same four questions — how do I
 * find a row, how do I narrow the list, how do I get back to the whole list, and what happens when
 * there are four hundred rows. Most answered none of them. This answers all four once: a typeahead
 * search that suggests values actually present in the data, dropdown filters, one button that puts
 * everything back, sortable columns and pagination.
 *
 * Generic over the row type and driven by a column list, so adopting it is describing the columns
 * rather than rewriting the markup. The caller keeps ownership of how a cell looks — `cell` returns
 * whatever it likes — and hands over only the mechanics.
 *
 * On the suggestions: they are drawn from the rows on screen, not from a dictionary. A suggestion
 * that returns no rows is worse than no suggestion, so the only things offered are values that are
 * genuinely in the column — which also means the list gets more useful as the data grows, rather
 * than staler.
 */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * The value this column sorts on. Omit to make the column unsortable — which is right for a
   * column of buttons or a rendered bar, where "sorted" would not mean anything.
   */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right";
  /** Extra classes on the cell, for width or wrapping. */
  className?: string;
};

export type TableFilter<T> = {
  key: string;
  label: string;
  /** The choices. "All" is prepended for you and is always the cleared state. */
  options: { value: string; label: string }[];
  /** True when the row belongs under this choice. Never called for the cleared state. */
  test: (row: T, value: string) => boolean;
};

export type SortState = { column: string; direction: "asc" | "desc" } | null;

/** How many suggestions the typeahead offers. More than this and it stops being a shortcut. */
const MAX_SUGGESTIONS = 8;

const TABLE_WRAP = "overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800";
const THEAD = "bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-950/50 dark:text-slate-400";
const TH = "px-4 py-3 font-bold";
const FIELD =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-rose-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

/**
 * The values worth offering for a query, best first.
 *
 * A value that starts with what has been typed ranks above one that merely contains it — somebody
 * typing "rel" means RELIANCE, not "Unrelated Industries". Case-insensitive, de-duplicated, and
 * capped so the list stays a shortcut rather than a second table.
 */
export function suggestionsFor(values: string[], query: string, limit = MAX_SUGGESTIONS): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const starts: string[] = [];
  const contains: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = value.trim();
    if (!text) continue;

    const lower = text.toLowerCase();
    if (seen.has(lower) || lower === needle) continue;

    if (lower.startsWith(needle)) {
      seen.add(lower);
      starts.push(text);
    } else if (lower.includes(needle)) {
      seen.add(lower);
      contains.push(text);
    }

    if (starts.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}

/** Compares two sort values, nulls last whichever way the column is pointing. */
export function compareValues(a: string | number | null, b: string | number | null, direction: "asc" | "desc"): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;

  const factor = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return factor * (a - b);
  return factor * String(a).localeCompare(String(b));
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  filters = [],
  searchFields,
  searchPlaceholder = "Search",
  searchLabel = "Search rows",
  pageSize = 10,
  caption,
  empty = "Nothing matches these filters.",
  minWidth = 720,
  initialSort = null,
  toolbarExtra,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  filters?: TableFilter<T>[];
  /** The strings a row is searchable by. Also the pool the typeahead suggests from. */
  searchFields?: (row: T) => (string | null | undefined)[];
  searchPlaceholder?: string;
  searchLabel?: string;
  pageSize?: number;
  caption: string;
  empty?: string;
  minWidth?: number;
  initialSort?: SortState;
  /** Anything else that belongs in the controls row — a period toggle, say. */
  toolbarExtra?: ReactNode;
  /**
   * Extra classes for one row, by its position on the current page.
   *
   * The index is the position in the rendered page, not in the underlying list, so a striping or
   * tinting rule stays in the same order down the screen as the reader pages through.
   */
  rowClassName?: (row: T, index: number) => string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const dirty = query.trim() !== "" || Object.values(choices).some(Boolean);

  // Every distinct searchable string in the data, for the typeahead. Recomputed only when the rows
  // themselves change, not on every keystroke — the query filters this list, it does not rebuild it.
  const pool = useMemo(() => {
    if (!searchFields) return [];
    const values: string[] = [];
    for (const row of rows) {
      for (const field of searchFields(row)) if (field) values.push(field);
    }
    return values;
  }, [rows, searchFields]);

  const suggestions = useMemo(() => suggestionsFor(pool, query), [pool, query]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      for (const filter of filters) {
        const chosen = choices[filter.key];
        // "" is the cleared state and matches everything, so `test` never sees it.
        if (chosen && !filter.test(row, chosen)) return false;
      }

      if (!needle || !searchFields) return true;
      return searchFields(row).some((field) => field && field.toLowerCase().includes(needle));
    });
  }, [rows, filters, choices, query, searchFields]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((entry) => entry.key === sort.column);
    if (!column?.sortValue) return filtered;

    return [...filtered].sort((a, b) => compareValues(column.sortValue!(a), column.sortValue!(b), sort.direction));
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Clamped rather than trusted: a filter that shrinks the results while the reader is on page four
  // must land them on the last page that exists, not on an empty one.
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);

  // Closing on an outside click rather than on blur: blur fires before the click that chose a
  // suggestion lands, which would dismiss the list and swallow the selection.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const search = (value: string) => {
    setQuery(value);
    setPage(1);
    setHighlighted(-1);
    setOpen(value.trim() !== "");
  };

  const accept = (value: string) => {
    setQuery(value);
    setOpen(false);
    setHighlighted(-1);
    setPage(1);
  };

  const clear = () => {
    setQuery("");
    setChoices({});
    setPage(1);
    setOpen(false);
  };

  const onSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setPage(1);
    setSort((currentSort) =>
      currentSort?.column === column.key
        ? currentSort.direction === "desc"
          ? { column: column.key, direction: "asc" }
          : // Third click clears the sort and returns the rows to the order they arrived in, which
            // is usually meaningful (newest first) and otherwise unreachable once sorted.
            null
        : { column: column.key, direction: "desc" },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {(searchFields || filters.length > 0 || toolbarExtra) && (
        <div className="flex flex-wrap items-end gap-2">
          {searchFields && (
            <div ref={boxRef} className="relative min-w-[200px] flex-1">
              <label className="sr-only" htmlFor={`${listId}-input`}>
                {searchLabel}
              </label>
              <input
                id={`${listId}-input`}
                type="text"
                role="combobox"
                aria-expanded={open && suggestions.length > 0}
                aria-controls={`${listId}-list`}
                aria-autocomplete="list"
                aria-activedescendant={highlighted >= 0 ? `${listId}-option-${highlighted}` : undefined}
                autoComplete="off"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => search(event.target.value)}
                onFocus={() => setOpen(query.trim() !== "")}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setOpen(false);
                    return;
                  }
                  if (!open || suggestions.length === 0) return;

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlighted((index) => (index + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlighted((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
                  } else if (event.key === "Enter" && highlighted >= 0) {
                    event.preventDefault();
                    accept(suggestions[highlighted]);
                  }
                }}
                className={`${FIELD} w-full`}
              />

              {open && suggestions.length > 0 && (
                <ul
                  id={`${listId}-list`}
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  {suggestions.map((suggestion, index) => (
                    <li key={suggestion} id={`${listId}-option-${index}`} role="option" aria-selected={index === highlighted}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => accept(suggestion)}
                        className={`block w-full px-3 py-1.5 text-left text-sm transition ${
                          index === highlighted
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {filters.map((filter) => (
            <label key={filter.key} className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {filter.label}
              </span>
              <select
                value={choices[filter.key] ?? ""}
                onChange={(event) => {
                  setPage(1);
                  setChoices((currentChoices) => ({ ...currentChoices, [filter.key]: event.target.value }));
                }}
                className={FIELD}
              >
                <option value="">All</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {toolbarExtra}

          {/* Shown only when there is something to clear — a button that does nothing is furniture. */}
          {dirty && (
            <button
              type="button"
              onClick={clear}
              className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {empty}
        </p>
      ) : (
        <>
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
              <caption className="sr-only">{caption}</caption>
              <thead className={THEAD}>
                <tr>
                  {columns.map((column) => {
                    const sorted_ = sort?.column === column.key;

                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={sorted_ ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                        className={`${TH} ${column.align === "right" ? "text-right" : ""}`}
                      >
                        {column.sortValue ? (
                          <button
                            type="button"
                            onClick={() => onSort(column)}
                            className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider transition hover:text-rose-700 dark:hover:text-rose-300 ${
                              sorted_ ? "text-rose-700 dark:text-rose-300" : ""
                            }`}
                          >
                            {column.header}
                            <span aria-hidden="true" className="text-[9px]">
                              {sorted_ ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={rowKey(row)}
                    className={`border-t border-slate-200 transition-colors dark:border-slate-800 ${rowClassName?.(row, index) ?? ""}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 text-slate-600 dark:text-slate-400 ${column.align === "right" ? "text-right" : ""} ${column.className ?? ""}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, sorted.length)} of{" "}
              {sorted.length.toLocaleString("en-IN")}
              {sorted.length !== rows.length ? ` (filtered from ${rows.length.toLocaleString("en-IN")})` : ""}
            </p>

            {pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={current <= 1}
                  onClick={() => setPage(current - 1)}
                  className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Previous
                </button>
                <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  Page {current} of {pages}
                </span>
                <button
                  type="button"
                  disabled={current >= pages}
                  onClick={() => setPage(current + 1)}
                  className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
