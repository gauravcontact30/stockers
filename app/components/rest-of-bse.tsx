"use client";

import { useCallback, useEffect, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CategoryIcon } from "./category-icon";
import { CompanyLogo } from "./company-logo";
import { sectorTone } from "./market-format";
import {
  REST_TABS,
  briefFor,
  categoriesBoard,
  etfsBoard,
  metalsBoard,
  moversBoard,
  sectorsBoard,
  formatPercentSigned,
  type BoardGroup,
  type BoardRow,
  type Drill,
  type RestBoard,
  type TabKey,
} from "../lib/rest-of-bse";

/** Rows per page anywhere the section shows stock/fund detail rows. */
const PAGE_SIZE = 5;
const GROUP_PAGE_SIZE = 5;
const DRILL_PAGE_SIZE = 5;
type DrillDirection = "gainers" | "losers";
type TierFilter = "all" | "large" | "mid" | "small";
type PeriodFilter = "1d" | "1w" | "3m" | "6m" | "1y" | "3y" | "5y" | "overall";

type StockFilters = {
  q: string;
  tier: TierFilter;
  period: PeriodFilter;
  min: string;
};

type StockSuggestion = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  scripCode: string;
  price: number | null;
  changePercent: number | null;
};

const DEFAULT_FILTERS: StockFilters = { q: "", tier: "all", period: "1d", min: "" };
const TIER_OPTIONS: { key: TierFilter; label: string }[] = [
  { key: "all", label: "All caps" },
  { key: "large", label: "Large cap" },
  { key: "mid", label: "Mid cap" },
  { key: "small", label: "Small cap" },
];
const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: "1d", label: "Today" },
  { key: "1w", label: "1 week" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "3y", label: "3 years" },
  { key: "5y", label: "5 years" },
  { key: "overall", label: "Overall" },
];

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Fetches whichever board is open, and only that one.
 *
 * Six boards across four upstream feeds is a lot to pull for a section a reader may never open, so
 * nothing is fetched until a tab is selected and each answer is kept once it arrives. Paging the
 * two mover boards re-fetches only that board.
 */
function normaliseMin(value: string): string {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

function filtersKey(filters: StockFilters): string {
  return `${filters.q.trim()}|${filters.tier}|${filters.period}|${normaliseMin(filters.min)}`;
}

export function buildMoverUrl(direction: DrillDirection, page: number, filters: StockFilters = DEFAULT_FILTERS): string {
  const params = new URLSearchParams({
    direction,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const q = filters.q.trim();
  const min = normaliseMin(filters.min);
  if (q) params.set("q", q);
  if (filters.tier !== "all") params.set("tier", filters.tier);
  if (filters.period !== "1d") params.set("period", filters.period);
  if (min) params.set("min", min);
  return `/api/market/bse/movers?${params.toString()}`;
}

export async function loadBoard(tab: TabKey, page: number, filters: StockFilters = DEFAULT_FILTERS): Promise<RestBoard> {
  if (tab === "gainers" || tab === "losers") {
    const payload = await json<Parameters<typeof moversBoard>[0]>(buildMoverUrl(tab, page, filters));
    return moversBoard(payload, tab);
  }

  if (tab === "sectors") return sectorsBoard(await json<Parameters<typeof sectorsBoard>[0]>("/api/market/bse/sectors"));
  if (tab === "categories") return categoriesBoard(await json<Parameters<typeof categoriesBoard>[0]>("/api/market/bse"));
  if (tab === "etfs") return etfsBoard(await json<Parameters<typeof etfsBoard>[0]>("/api/market/etf-board"));

  // Metals reads two feeds: the bullion funds and the exchange's metals industry group.
  const [etfs, sectors] = await Promise.all([
    json<Parameters<typeof metalsBoard>[0]>("/api/market/etf-board"),
    json<Parameters<typeof metalsBoard>[1]>("/api/market/bse/sectors"),
  ]);
  return metalsBoard(etfs, sectors);
}

export function buildDrillUrl(drill: Drill, direction: DrillDirection, page: number): string {
  const params = new URLSearchParams({
    direction,
    page: String(page),
    pageSize: String(DRILL_PAGE_SIZE),
  });
  params.set(drill.kind, drill.value);
  return `/api/market/bse/movers?${params.toString()}`;
}

export async function loadDrill(drill: Drill, direction: DrillDirection, page: number): Promise<RestBoard> {
  const payload = await json<Parameters<typeof moversBoard>[0]>(buildDrillUrl(drill, direction, page));
  return moversBoard(payload, direction);
}

function drillKey(drill: Drill): string {
  return `${drill.kind}:${drill.value}`;
}

function toneFor(change: number | null): string {
  if (typeof change !== "number" || !Number.isFinite(change)) return "text-slate-500 dark:text-slate-400";
  if (change > 0) return "text-emerald-600 dark:text-emerald-400";
  if (change < 0) return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

function filtersActive(filters: StockFilters): boolean {
  return Boolean(filters.q.trim()) || filters.tier !== "all" || filters.period !== "1d" || Boolean(normaliseMin(filters.min));
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <label className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="cursor-pointer bg-transparent py-1 text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} className="text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MiniGlyph({
  kind,
  className = "h-4 w-4",
}: {
  kind: "cap" | "etf" | "gold" | "silver" | "metals";
  className?: string;
}) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {kind === "cap" && (
        <>
          <path d="M4 19h16M6 16V9m6 7V5m6 11v-4" {...stroke} />
          <path d="M4 9l8-5 8 5" {...stroke} />
        </>
      )}
      {kind === "etf" && (
        <>
          <rect x="4" y="5" width="6" height="6" rx="1.5" {...stroke} />
          <rect x="14" y="5" width="6" height="6" rx="1.5" {...stroke} />
          <rect x="4" y="15" width="6" height="4" rx="1.2" {...stroke} />
          <rect x="14" y="15" width="6" height="4" rx="1.2" {...stroke} />
        </>
      )}
      {kind === "gold" && (
        <>
          <circle cx="12" cy="12" r="7" {...stroke} />
          <path d="M9 10.5h6M9 13.5h4.5" {...stroke} />
        </>
      )}
      {kind === "silver" && (
        <>
          <path d="M5 9h14l-2 8H7L5 9Z" {...stroke} />
          <path d="M8 9l1.5-4h5L16 9" {...stroke} />
        </>
      )}
      {kind === "metals" && (
        <>
          <path d="M5 19 15 9M4 8c3-3 7-4 10-3M20 14c-3 3-7 4-10 3" {...stroke} />
          <path d="m14 6 4 4" {...stroke} />
        </>
      )}
    </svg>
  );
}

function groupGlyph(name: string): "gold" | "silver" | "metals" | "etf" | null {
  const value = name.toLowerCase();
  if (value.includes("gold")) return "gold";
  if (value.includes("silver")) return "silver";
  if (value.includes("metal") || value.includes("mining")) return "metals";
  if (value.includes("etf") || value.includes("fund")) return "etf";
  return null;
}

function RowIcon({ row }: { row: BoardRow }) {
  if (row.symbol) return <CompanyLogo symbol={row.symbol} size={28} />;

  if (row.drill?.kind === "category") {
    return (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sectorTone(row.title)}`}>
        <CategoryIcon category={row.title} className="h-4 w-4" />
      </span>
    );
  }

  if (row.drill?.kind === "tier") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
        <MiniGlyph kind="cap" />
      </span>
    );
  }

  const glyph = groupGlyph(row.title);
  if (glyph) {
    const tone =
      glyph === "gold"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : glyph === "silver"
          ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
          : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300";
    return (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <MiniGlyph kind={glyph} />
      </span>
    );
  }

  return null;
}

function StockFilterBar({
  filters,
  onFilters,
}: {
  filters: StockFilters;
  onFilters: (next: StockFilters) => void;
}) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const query = filters.q.trim();

  useEffect(() => {
    let cancelled = false;
    if (!focused || query.length < 2) {
      setSuggestions([]);
      return;
    }

    json<{ suggestions: StockSuggestion[] }>(`/api/stocks/suggest?q=${encodeURIComponent(query)}&limit=6`)
      .then((payload) => {
        if (!cancelled) setSuggestions(payload.suggestions);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [focused, query]);

  const update = (patch: Partial<StockFilters>) => onFilters({ ...filters, ...patch });
  const clearSearch = () => update({ q: "" });
  const clearAll = () => onFilters(DEFAULT_FILTERS);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-64 flex-1">
          <label className="sr-only" htmlFor="rest-bse-search">
            Search BSE stocks
          </label>
          <input
            id="rest-bse-search"
            type="search"
            value={filters.q}
            onChange={(event) => update({ q: event.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder="Search symbol, name, code or ISIN"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            autoComplete="off"
          />
          {focused && suggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Stock suggestions"
              className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.symbol}-${suggestion.scripCode}`}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onFilters({ ...filters, q: suggestion.symbol });
                    setSuggestions([]);
                    setFocused(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{suggestion.symbol}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{suggestion.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{suggestion.capTier}</span>
                    <span className={`block text-[10px] font-bold tabular-nums ${toneFor(suggestion.changePercent)}`}>
                      {formatPercentSigned(suggestion.changePercent)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Tier" value={filters.tier} options={TIER_OPTIONS} onChange={(tier) => update({ tier })} />
          <FilterSelect label="Period" value={filters.period} options={PERIOD_OPTIONS} onChange={(period) => update({ period })} />
          <label className="flex h-9 w-32 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Min</span>
            <input
              value={filters.min}
              onChange={(event) => update({ min: event.target.value })}
              inputMode="decimal"
              placeholder="%"
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={clearSearch}
            disabled={!filters.q.trim()}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            Clear search
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!filtersActive(filters)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>
  );
}

function RowContent({ row }: { row: BoardRow }) {
  const change = row.changePercent;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;

  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${up ? "bg-emerald-500" : down ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-700"}`}
      />

      <RowIcon row={row} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{row.title}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{row.subtitle}</p>
        {row.pills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.pills.map((pill) => (
              <span
                key={pill}
                className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {pill}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{row.value}</p>
        <p className={`text-xs font-semibold tabular-nums ${toneFor(change)}`}>{formatPercentSigned(change)}</p>
      </div>
    </>
  );
}

function Row({
  row,
  open,
  onToggle,
}: {
  row: BoardRow;
  open: boolean;
  onToggle: (drill: Drill) => void;
}) {
  if (!row.drill) {
    return (
      <li className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
        <RowContent row={row} />
      </li>
    );
  }

  return (
    <li className="relative overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <button
        type="button"
        onClick={() => onToggle(row.drill!)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-2.5 pl-3 pr-3 text-left"
      >
        <RowContent row={row} />
        <span className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {open ? "Hide stocks" : "View stocks"}
        </span>
      </button>
      {open && <DrillPanel drill={row.drill} />}
    </li>
  );
}

function useDrillBoard(drill: Drill, direction: DrillDirection) {
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<RestBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = drillKey(drill);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadDrill(drill, direction, page)
      .then((next) => {
        if (cancelled) return;
        setBoard(next);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load these stocks right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [drill, direction, page, key]);

  return {
    board,
    error,
    loading,
    page,
    setPage,
    rows: board?.groups.flatMap((group) => group.rows) ?? [],
    paging: board?.paging,
  };
}

function MatrixValue({ label, value, tone = "text-slate-900 dark:text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className={`truncate text-sm font-black tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  );
}

function PerformanceChart({ gainers, losers }: { gainers: BoardRow[]; losers: BoardRow[] }) {
  const rows = [...gainers.slice(0, 5), ...losers.slice(0, 5)];
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.changePercent ?? 0)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Performance chart</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Top visible moves</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>Up</span>
          <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
          <span>Down</span>
        </div>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No priced stocks in this slice yet.</p>
        ) : (
          rows.map((row, index) => {
            const change = row.changePercent ?? 0;
            const width = `${Math.max(6, (Math.abs(change) / max) * 100)}%`;
            return (
              <div
                key={`${row.id}-${index}-${change}`}
                className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {row.symbol ? <CompanyLogo symbol={row.symbol} size={24} /> : <RowIcon row={row} />}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-900 dark:text-white">{row.subtitle || row.title}</p>
                      <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{row.title}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${change >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">{row.value}</p>
                  <p className={`text-[11px] font-black tabular-nums ${toneFor(change)}`}>{formatPercentSigned(change)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DrillStockRow({ row, rank }: { row: BoardRow; rank: number }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
      <span className="w-5 shrink-0 text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">{rank}</span>
      {row.symbol ? <CompanyLogo symbol={row.symbol} size={28} /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{row.title}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{row.subtitle}</p>
        {row.pills.length > 0 && (
          <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{row.pills.join(" · ")}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{row.value}</p>
        <p className={`text-[11px] font-bold tabular-nums ${toneFor(row.changePercent)}`}>{formatPercentSigned(row.changePercent)}</p>
      </div>
    </li>
  );
}

function DrillColumn({
  title,
  direction,
  state,
}: {
  title: string;
  direction: DrillDirection;
  state: ReturnType<typeof useDrillBoard>;
}) {
  const gaining = direction === "gainers";
  const from = state.paging && state.rows.length ? (state.paging.page - 1) * DRILL_PAGE_SIZE + 1 : 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className={`text-xs font-black uppercase tracking-wide ${gaining ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {title}
        </h4>
        {state.paging && (
          <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {state.paging.total.toLocaleString("en-IN")} in all
          </p>
        )}
      </div>

      {state.loading && !state.board && <p className="text-xs text-slate-500 dark:text-slate-400">Loading stocks...</p>}
      {state.error && <p className="text-xs text-rose-600 dark:text-rose-400">{state.error}</p>}

      {!state.loading && state.rows.length === 0 && !state.error && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nothing in this group closed {gaining ? "higher" : "lower"} this session.
        </p>
      )}

      {state.rows.length > 0 && (
        <ul className="space-y-1.5">
          {state.rows.map((row, index) => (
            <DrillStockRow key={row.id} row={row} rank={from + index} />
          ))}
        </ul>
      )}

      {state.paging && state.paging.pages > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => state.setPage((current) => Math.max(1, current - 1))}
            disabled={state.paging.page <= 1}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Previous
          </button>
          <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            Page {state.paging.page.toLocaleString("en-IN")} of {state.paging.pages.toLocaleString("en-IN")}
          </p>
          <button
            type="button"
            onClick={() => state.setPage((current) => Math.min(state.paging!.pages, current + 1))}
            disabled={state.paging.page >= state.paging.pages}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function InlinePager({
  page,
  pages,
  from,
  to,
  total,
  unit,
  onPage,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  unit: string;
  onPage: (next: number) => void;
}) {
  if (pages <= 1) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
      >
        Previous
      </button>
      <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        Showing {from.toLocaleString("en-IN")}-{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} {unit} · Page{" "}
        {page.toLocaleString("en-IN")} of {pages.toLocaleString("en-IN")}
      </p>
      <button
        type="button"
        onClick={() => onPage(Math.min(pages, page + 1))}
        disabled={page >= pages}
        className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
      >
        Next
      </button>
    </div>
  );
}

function DrillPanel({ drill }: { drill: Drill }) {
  const gainers = useDrillBoard(drill, "gainers");
  const losers = useDrillBoard(drill, "losers");
  const performers = gainers.paging?.total ?? 0;
  const nonPerformers = losers.paging?.total ?? 0;
  const total = performers + nonPerformers;
  const performerShare = total > 0 ? (performers / total) * 100 : 0;

  return (
    <div className="border-t border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900 dark:text-white">{drill.label} stocks</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Performers and Non Performers from the latest BSE session</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MatrixValue label="Stocks counted" value={total ? total.toLocaleString("en-IN") : "—"} />
        <MatrixValue label="Performers" value={performers.toLocaleString("en-IN")} tone="text-emerald-600 dark:text-emerald-400" />
        <MatrixValue label="Non Performers" value={nonPerformers.toLocaleString("en-IN")} tone="text-rose-600 dark:text-rose-400" />
        <MatrixValue label="Advance share" value={total ? `${performerShare.toFixed(0)}%` : "—"} />
      </div>

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          <span className="bg-emerald-500" style={{ width: `${performerShare}%` }} />
          <span className="bg-rose-500" style={{ width: `${100 - performerShare}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span>Performers</span>
          <span>Non Performers</span>
        </div>
      </div>

      <div className="mb-4">
        <PerformanceChart gainers={gainers.rows} losers={losers.rows} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DrillColumn title="Performers" direction="gainers" state={gainers} />
        <DrillColumn title="Non Performers" direction="losers" state={losers} />
      </div>
    </div>
  );
}

function Group({
  group,
  openDrill,
  onToggleDrill,
}: {
  group: BoardGroup;
  openDrill: string | null;
  onToggleDrill: (drill: Drill) => void;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(Math.ceil(group.rows.length / GROUP_PAGE_SIZE), 1);
  const safePage = Math.min(page, pages);
  const from = group.rows.length === 0 ? 0 : (safePage - 1) * GROUP_PAGE_SIZE + 1;
  const to = Math.min(group.rows.length, safePage * GROUP_PAGE_SIZE);
  const rows = group.rows.slice(from === 0 ? 0 : from - 1, to);

  useEffect(() => {
    setPage(1);
  }, [group.name, group.description, group.rows.length]);

  return (
    <div>
      {group.name && (
        <div className="mb-2 flex items-center gap-3">
          {groupGlyph(group.name) && (
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                groupGlyph(group.name) === "gold"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  : groupGlyph(group.name) === "silver"
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    : groupGlyph(group.name) === "metals"
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                      : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
              }`}
            >
              <MiniGlyph kind={groupGlyph(group.name)!} className="h-4 w-4" />
            </span>
          )}
          <p className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{group.name}</p>
          <span aria-hidden="true" className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>
      )}
      {group.description && <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{group.description}</p>}
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <Row key={row.id} row={row} open={row.drill ? openDrill === drillKey(row.drill) : false} onToggle={onToggleDrill} />
        ))}
      </ul>
      <InlinePager
        page={safePage}
        pages={pages}
        from={from}
        to={to}
        total={group.rows.length}
        unit={group.name.toLowerCase().includes("etf") ? "funds" : "rows"}
        onPage={setPage}
      />
    </div>
  );
}

/**
 * The rest of the BSE, board by board.
 *
 * The strip above this answers "what were the three sharpest moves today". A reader who wants more
 * than three had nowhere to go on this page: the rest of the exchange, its sectors, its cap tiers,
 * its funds and the metals complex all lived on other screens or not at all. Each is its own board
 * here, and each carries the AI read of its own figures.
 */
export function RestOfBse() {
  const [tab, setTab] = useState<TabKey>("gainers");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<StockFilters>(DEFAULT_FILTERS);
  const [boards, setBoards] = useState<Record<string, RestBoard>>({});
  const [error, setError] = useState<string | null>(null);
  const [openDrill, setOpenDrill] = useState<string | null>(null);
  /** Keyed so a slow answer for an abandoned tab can't paint over the one being viewed. */
  const [pending, setPending] = useState<string | null>(null);

  const stockTab = tab === "gainers" || tab === "losers";
  const key = `${tab}:${stockTab ? `${page}:${filtersKey(filters)}` : 0}`;
  const board = boards[key];

  useEffect(() => {
    let cancelled = false;
    setPending(key);

    loadBoard(tab, page, filters)
      .then((next) => {
        if (cancelled) return;
        setBoards((current) => ({ ...current, [key]: next }));
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this board. The exchange feed may not have published yet.");
      })
      .finally(() => {
        if (!cancelled) setPending(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, page, filters, key]);

  const select = useCallback((next: TabKey) => {
    setTab(next);
    setPage(1);
    setOpenDrill(null);
    setError(null);
  }, []);

  const toggleDrill = useCallback((drill: Drill) => {
    const next = drillKey(drill);
    setOpenDrill((current) => (current === next ? null : next));
  }, []);

  const changeFilters = useCallback((next: StockFilters) => {
    setFilters(next);
    setPage(1);
    setOpenDrill(null);
    setError(null);
  }, []);

  const loading = pending !== null && !board;
  const meta = REST_TABS.find((entry) => entry.key === tab)!;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Rest of the BSE</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.blurb}</p>
        </div>
        {board?.asOf && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">As of {board.asOf}</p>
        )}
      </div>

      <div role="tablist" aria-label="Rest of the BSE" className="mt-3 flex flex-wrap gap-1.5">
        {REST_TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry.key === tab}
            onClick={() => select(entry.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              entry.key === tab
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {stockTab && <StockFilterBar filters={filters} onFilters={changeFilters} />}

      {board && board.stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 lg:grid-cols-5 dark:border-slate-800">
          {board.stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {stat.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900 dark:text-white">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The read is asked for the board actually on screen, so it can never narrate a tab the
          reader has already moved off. */}
      {board && <AiBoardRead feature="market-pulse" brief={briefFor(tab, board)} />}

      {loading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading the board…</p>}
      {error && !board && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {board && (
        <div className="mt-4 space-y-5">
          {board.groups.map((group, index) => (
            <Group key={group.name || `group-${index}`} group={group} openDrill={openDrill} onToggleDrill={toggleDrill} />
          ))}
          {board.groups.every((group) => group.rows.length === 0) && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing to show on this board today.</p>
          )}
        </div>
      )}

      {board?.paging && board.paging.pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={board.paging.page <= 1}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Previous
          </button>
          <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            Page {board.paging.page.toLocaleString("en-IN")} of {board.paging.pages.toLocaleString("en-IN")} ·{" "}
            {board.paging.total.toLocaleString("en-IN")} stocks
          </p>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(board.paging!.pages, current + 1))}
            disabled={board.paging.page >= board.paging.pages}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
