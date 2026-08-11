"use client";

import { useEffect, useMemo, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { TopPerformers } from "./top-performers";

type BseAccuracyMatch = {
  symbol: string;
  name: string;
  scripCode: string;
  yahooSymbol: string;
  sector: string;
  capTier: string;
  price?: number | null;
  changePercent?: number | null;
  sessionDate?: string | null;
};

type BseStockAccuracy = BseAccuracyMatch & {
  matrixAccuracy: number;
  exchangeDataCoverage: number;
  predictionConfidence: number | null;
  predictionStatus: "available" | "not-covered";
  predictionOutlook: string | null;
  predictionNote: string | null;
  predictionSource: string;
  predictionGeneratedAt?: string;
  price: number | null;
  changePercent: number | null;
  sessionDate: string | null;
  stats: { label: string; value: string | number | null }[];
  performance: { key: string; value: number | null; measuredFrom: string | null }[];
  comparison: {
    rank: number;
    isTarget: boolean;
    symbol: string;
    name: string;
    scripCode: string;
    sector: string | null;
    industry: string | null;
    capTier: string | null;
    price: number | null;
    changePercent: number | null;
    marketCapCr: number | null;
    returns: Record<string, number | null>;
    performance: { key: string; value: number | null; measuredFrom: string | null }[];
  }[];
  comparisonBasis: {
    category: string;
    capTier: string | null;
    period: string;
    rank: number;
    total: number;
  } | null;
  checks: { label: string; ok: boolean; detail: string; source: string }[];
};

type AccuracyResponse = {
  matches?: BseAccuracyMatch[];
  result?: BseStockAccuracy | null;
};

const EXAMPLES = [
  { symbol: "AUBANK", name: "AU Bank" },
  { symbol: "ANGELONE", name: "Angel One" },
  { symbol: "RELIANCE", name: "Reliance" },
  { symbol: "TCS", name: "TCS" },
  { symbol: "SBIN", name: "SBI" },
  { symbol: "ACCURACY", name: "Accuracy" },
];

const COMPETITOR_PAGE_SIZE = 5;
const RETURN_FILTERS = [
  { value: "1D", label: "1D return" },
  { value: "1W", label: "1W return" },
  { value: "1M", label: "1M return" },
  { value: "3M", label: "3M return" },
  { value: "6M", label: "6M return" },
  { value: "1Y", label: "1Y return" },
  { value: "3Y", label: "3Y return" },
  { value: "5Y", label: "5Y return" },
  { value: "Overall", label: "Overall return" },
] as const;

type ReturnFilterKey = (typeof RETURN_FILTERS)[number]["value"];

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatRupees(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: string | number | null) {
  if (typeof value === "string") return value || "-";
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: value % 1 === 0 ? 0 : 2 });
}

function formatStat(label: string, value: string | number | null) {
  if (value === null || value === "") return "-";
  if (label.toLowerCase().includes("turnover") || label.toLowerCase().includes("market cap")) return `${formatNumber(value)} cr`;
  return formatNumber(value);
}

const SESSION_STAT_LABELS = ["Open", "Day high", "Day low", "Prev close", "Volume", "Turnover cr", "Trades", "Market cap cr"];

const SESSION_STAT_TILES = [
  {
    accent: "bg-sky-500",
    tile: "border-sky-100 bg-sky-50/75 dark:border-sky-500/20 dark:bg-sky-500/10",
  },
  {
    accent: "bg-emerald-500",
    tile: "border-emerald-100 bg-emerald-50/75 dark:border-emerald-500/20 dark:bg-emerald-500/10",
  },
  {
    accent: "bg-rose-500",
    tile: "border-rose-100 bg-rose-50/75 dark:border-rose-500/20 dark:bg-rose-500/10",
  },
  {
    accent: "bg-amber-500",
    tile: "border-amber-100 bg-amber-50/75 dark:border-amber-500/20 dark:bg-amber-500/10",
  },
  {
    accent: "bg-violet-500",
    tile: "border-violet-100 bg-violet-50/75 dark:border-violet-500/20 dark:bg-violet-500/10",
  },
  {
    accent: "bg-cyan-500",
    tile: "border-cyan-100 bg-cyan-50/75 dark:border-cyan-500/20 dark:bg-cyan-500/10",
  },
  {
    accent: "bg-indigo-500",
    tile: "border-indigo-100 bg-indigo-50/75 dark:border-indigo-500/20 dark:bg-indigo-500/10",
  },
  {
    accent: "bg-lime-500",
    tile: "border-lime-100 bg-lime-50/75 dark:border-lime-500/20 dark:bg-lime-500/10",
  },
] as const;

function Meter({ value, label, tone }: { value: number | null; label: string; tone: string }) {
  const width = Math.max(0, Math.min(value ?? 0, 100));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{value === null ? "N/A" : `${value}%`}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function strongestReturn(items: BseStockAccuracy["performance"], direction: "best" | "weakest") {
  const measured = items.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (measured.length === 0) return null;
  return measured.sort((a, b) => (direction === "best" ? b.value! - a.value! : a.value! - b.value!))[0];
}

function PerformanceMatrix({ items }: { items: BseStockAccuracy["performance"] }) {
  const best = strongestReturn(items, "best");
  const weakest = strongestReturn(items, "weakest");
  const positive = items.filter((item) => typeof item.value === "number" && item.value >= 0).length;

  return (
    <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Performance matrix</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {positive} of {items.length} measured windows are positive.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            Best {best ? `${best.key} ${formatPercent(best.value)}` : "-"}
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Weakest {weakest ? `${weakest.key} ${formatPercent(weakest.value)}` : "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-2xl border p-3 ${
              item.value === null
                ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                : item.value >= 0
                  ? "border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                  : "border-rose-100 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.key}</p>
              <span className={`h-2 w-2 rounded-full ${item.value === null ? "bg-slate-300" : item.value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
            </div>
            <p className={`mt-2 text-base font-black tabular-nums ${item.value === null ? "text-slate-400" : item.value >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
              {formatPercent(item.value)}
            </p>
            <p className="mt-1 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.measuredFrom ?? "latest session"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: BseStockAccuracy["stats"] }) {
  const essentialStats = SESSION_STAT_LABELS.map((label) =>
    stats.find((item) => item.label.toLowerCase() === label.toLowerCase()),
  ).filter((item): item is BseStockAccuracy["stats"][number] => {
    if (!item) return false;
    return item.value !== null && item.value !== "";
  });

  if (essentialStats.length === 0) return null;
  return (
    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Session stats</p>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Latest BSE tape
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {essentialStats.map((item, index) => {
          const tone = SESSION_STAT_TILES[index % SESSION_STAT_TILES.length];
          return (
            <div key={item.label} className={`min-w-0 rounded-2xl border px-3 py-3 shadow-sm ${tone.tile}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</p>
                <span className={`h-2 w-2 rounded-full ${tone.accent}`} />
              </div>
              <p className="mt-3 min-w-0 truncate text-base font-black leading-none text-slate-900 dark:text-white">
                {formatStat(item.label, item.value)}
              </p>
              <div className={`mt-3 h-1 rounded-full ${tone.accent}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rankStickerClass(rank: number, active: boolean) {
  if (active) return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200";
  if (rank === 1) return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200";
  if (rank <= 3) return "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200";
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function downfallReason(row: BseStockAccuracy["comparison"][number]) {
  const day = row.changePercent;
  const oneYear = row.returns["1y"] ?? null;
  const sixMonth = row.returns["6m"] ?? null;

  if (typeof day === "number" && Number.isFinite(day) && day < 0) {
    return `Down ${Math.abs(day).toFixed(2)}% today; sellers controlled the latest BSE session.`;
  }
  if (typeof sixMonth === "number" && sixMonth < 0 && typeof oneYear === "number" && oneYear < 0) {
    return `Weak across 6M and 1Y; decline is not just a one-day move.`;
  }
  if (typeof oneYear === "number" && oneYear < 0) {
    return `One-year return is negative; the stock still trails its longer window.`;
  }
  return "No price-led downfall in the shown windows.";
}

function returnValue(row: BseStockAccuracy["comparison"][number], key: ReturnFilterKey) {
  return row.performance.find((point) => point.key === key)?.value ?? null;
}

function rankByReturn(rows: BseStockAccuracy["comparison"], key: ReturnFilterKey) {
  return new Map(
    [...rows]
      .sort((a, b) => {
        const left = returnValue(a, key);
        const right = returnValue(b, key);
        if (left === null && right === null) return a.rank - b.rank;
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left || a.rank - b.rank;
      })
      .map((row, index) => [row.scripCode, index + 1]),
  );
}

function CompetitorTable({ result }: { result: BseStockAccuracy }) {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("all");
  const [move, setMove] = useState("all");
  const [rankBand, setRankBand] = useState("all");
  const [returnWindow, setReturnWindow] = useState<ReturnFilterKey>("1Y");
  const [page, setPage] = useState(1);

  const tiers = useMemo(
    () => Array.from(new Set(result.comparison.map((row) => row.capTier).filter((value): value is string => Boolean(value)))),
    [result.comparison],
  );

  const ranked = useMemo(() => rankByReturn(result.comparison, returnWindow), [result.comparison, returnWindow]);
  const targetRank = result.comparison.find((row) => row.isTarget)?.scripCode;
  const targetWindowRank = targetRank ? (ranked.get(targetRank) ?? null) : null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return result.comparison
      .filter((row) => {
        const selectedReturn = returnValue(row, returnWindow);
        if (tier !== "all" && row.capTier !== tier) return false;
        if (move === "gainers" && (row.changePercent ?? 0) < 0) return false;
        if (move === "fallers" && (row.changePercent ?? 0) >= 0) return false;
        if (move === "selected-positive" && (selectedReturn ?? Number.NEGATIVE_INFINITY) < 0) return false;
        if (move === "selected-negative" && (selectedReturn ?? 0) >= 0) return false;
        if (move === "year-negative" && (row.returns["1y"] ?? 0) >= 0) return false;
        if (rankBand === "top3" && (ranked.get(row.scripCode) ?? Number.POSITIVE_INFINITY) > 3) return false;
        if (rankBand === "target" && !row.isTarget) return false;
        if (!term) return true;
        return row.symbol.toLowerCase().includes(term) || row.name.toLowerCase().includes(term) || row.scripCode.includes(term);
      })
      .sort((a, b) => (ranked.get(a.scripCode) ?? a.rank) - (ranked.get(b.scripCode) ?? b.rank));
  }, [move, rankBand, ranked, result.comparison, returnWindow, search, tier]);

  const suggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return result.comparison
      .filter((row) => row.symbol.toLowerCase().includes(term) || row.name.toLowerCase().includes(term))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5);
  }, [result.comparison, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / COMPETITOR_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * COMPETITOR_PAGE_SIZE, currentPage * COMPETITOR_PAGE_SIZE);
  const hasFilters = Boolean(search.trim()) || tier !== "all" || move !== "all" || rankBand !== "all";
  const currentStock = result.comparison.find((row) => row.isTarget) ?? null;

  useEffect(() => {
    setPage(1);
  }, [move, rankBand, returnWindow, search, tier]);

  if (result.comparison.length === 0) return null;

  return (
    <div className="mt-5">
      {currentStock && (
        <div className="mb-3 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <CompanyLogo symbol={currentStock.symbol} size={44} className="rounded-2xl" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                  Current stock rank
                </p>
                <h6 className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white">{currentStock.name}</h6>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {currentStock.symbol} / BSE {currentStock.scripCode}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank</p>
                <p className="mt-1 text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                  #{targetWindowRank ?? currentStock.rank}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</p>
                <p className="mt-1 text-sm font-black tabular-nums text-slate-900 dark:text-white">{formatRupees(currentStock.price)}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{returnWindow}</p>
                <p className={`mt-1 text-sm font-black tabular-nums ${(returnValue(currentStock, returnWindow) ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {formatPercent(returnValue(currentStock, returnWindow))}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Competitor rank</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {result.comparisonBasis
              ? `#${targetWindowRank ?? result.comparisonBasis.rank} of ${result.comparisonBasis.total} shown in ${result.comparisonBasis.category}`
              : "Same-category comparison"}
          </p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
          {returnWindow} return ranking
        </span>
      </div>

      <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <label className="relative min-w-0">
            <span className="sr-only">Search competitors</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search competitor, ticker or BSE code"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {suggestions.map((row) => (
                  <button
                    key={row.scripCode}
                    type="button"
                    onClick={() => setSearch(row.symbol)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sky-50 dark:hover:bg-sky-500/10"
                  >
                    <CompanyLogo symbol={row.symbol} size={24} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{row.symbol}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <select
            aria-label="Filter competitor return window"
            value={returnWindow}
            onChange={(event) => setReturnWindow(event.target.value as ReturnFilterKey)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {RETURN_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter competitor cap tier"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All tiers</option>
            {tiers.map((value) => (
              <option key={value} value={value}>
                {value} cap
              </option>
            ))}
          </select>

          <select
            aria-label="Filter competitor move"
            value={move}
            onChange={(event) => setMove(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All moves</option>
            <option value="gainers">Gainers today</option>
            <option value="fallers">Fallers today</option>
            <option value="selected-positive">Positive selected return</option>
            <option value="selected-negative">Negative selected return</option>
            <option value="year-negative">Negative 1Y</option>
          </select>

          <select
            aria-label="Filter competitor rank"
            value={rankBand}
            onChange={(event) => setRankBand(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All ranks</option>
            <option value="top3">Top 3 in selected return</option>
            <option value="target">This stock</option>
          </select>

          <button
            type="button"
            disabled={!hasFilters}
            onClick={() => {
              setSearch("");
              setTier("all");
              setMove("all");
              setRankBand("all");
              setReturnWindow("1Y");
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <th className="px-4 py-2">Rank</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">1D</th>
              <th className="px-4 py-2 text-right">{returnWindow}</th>
              <th className="px-4 py-2 text-right">Market cap</th>
              <th className="px-4 py-2">Downfall reason</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.scripCode} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${row.isTarget ? "bg-emerald-50/70 dark:bg-emerald-500/10" : ""}`}>
                <td className="px-4 py-3">
                  <span className={`inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-black tabular-nums shadow-sm ${rankStickerClass(ranked.get(row.scripCode) ?? row.rank, row.isTarget)}`}>
                    #{ranked.get(row.scripCode) ?? row.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyLogo symbol={row.symbol} size={34} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">
                        {row.symbol}
                        {row.isTarget && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">This stock</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {row.name} / BSE {row.scripCode} / {row.capTier ?? "Unclassified"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formatRupees(row.price)}</td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${(row.changePercent ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {formatPercent(row.changePercent)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${(returnValue(row, returnWindow) ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {formatPercent(returnValue(row, returnWindow))}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  {row.marketCapCr === null ? "-" : `${formatNumber(row.marketCapCr)} cr`}
                </td>
                <td className="max-w-64 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{downfallReason(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">No competitor matched these search and filter settings.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing {filtered.length === 0 ? 0 : (currentPage - 1) * COMPETITOR_PAGE_SIZE + 1}-
          {Math.min(currentPage * COMPETITOR_PAGE_SIZE, filtered.length)} of {filtered.length} competitors
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Prev
          </button>
          <span className="text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">
            {currentPage} / {pages}
          </span>
          <button
            type="button"
            disabled={currentPage >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function AccuracyProfile({ result }: { result: BseStockAccuracy }) {
  return (
    <div className="min-w-0">
      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyLogo symbol={result.symbol} size={46} className="rounded-2xl" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">BSE stock profile</p>
              <h5 className="mt-1 truncate text-base font-semibold leading-snug text-slate-900 dark:text-white sm:text-lg">{result.name}</h5>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {result.symbol} / BSE {result.scripCode}
              </p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[560px] lg:grid-cols-4">
            {[
              { label: "Price", value: formatRupees(result.price), tone: "border-sky-100 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-500/10" },
              {
                label: "1D move",
                value: formatPercent(result.changePercent),
                tone: (result.changePercent ?? 0) >= 0
                  ? "border-emerald-100 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                  : "border-rose-100 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-500/10",
                valueClass: (result.changePercent ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
              },
              { label: "Cap tier", value: `${result.capTier} cap`, tone: "border-violet-100 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/10" },
              { label: "Session", value: result.sessionDate ?? "No date", tone: "border-amber-100 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10" },
            ].map((item) => (
              <div key={item.label} className={`min-w-0 rounded-2xl border px-3 py-2.5 ${item.tone}`}>
                <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className={`mt-1 truncate text-sm font-black tabular-nums text-slate-900 dark:text-white ${"valueClass" in item ? item.valueClass : ""}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Meter value={result.matrixAccuracy} label="Matrix" tone="bg-emerald-500" />
        <Meter value={result.exchangeDataCoverage} label="Exchange data" tone="bg-sky-500" />
        <Meter value={result.predictionConfidence} label="Prediction" tone="bg-rose-500" />
      </div>

      <PerformanceMatrix items={result.performance} />
      <StatsGrid stats={result.stats} />
      <CompetitorTable result={result} />
    </div>
  );
}

export function BseAccuracyLookup() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<BseAccuracyMatch[]>([]);
  const [result, setResult] = useState<BseStockAccuracy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = query.trim().length >= 2;

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      setResult(null);
      setError(null);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/accuracy/bse?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Lookup failed");
          return (await response.json()) as AccuracyResponse;
        })
        .then((data) => {
          setMatches(data.matches ?? []);
          setResult(data.result ?? null);
          setError(null);
        })
        .catch((fetchError) => {
          if ((fetchError as Error).name !== "AbortError") setError("Could not check that stock right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectStock = async (value: string) => {
    setQuery(value);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/accuracy/bse?q=${encodeURIComponent(value)}&select=1`);
      if (!response.ok) throw new Error("Lookup failed");
      const data = (await response.json()) as AccuracyResponse;
      setMatches([]);
      setResult(data.result ?? null);
      if (data.result) setQuery(data.result.name);
      if (!data.result) setError("No BSE-listed stock matched that search.");
    } catch {
      setError("Could not check that stock right now.");
    } finally {
      setLoading(false);
    }
  };

  const statusLine = useMemo(() => {
    if (loading) return "Checking BSE matrix...";
    if (result) return `${result.symbol} matched with scrip code ${result.scripCode}`;
    if (matches.length) return `${matches.length} suggestions found`;
    if (canSearch) return "No suggestion yet";
    return "Search by ticker, company name or BSE scrip code";
  }, [canSearch, loading, matches.length, result]);

  return (
    <div className="bg-slate-50/80 p-6 dark:bg-slate-950/40 sm:p-8">
      <div className={`grid min-w-0 gap-6 ${result ? "" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-sky-600 dark:text-sky-400">
            Stock accuracy lookup
          </p>
          <h4 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
            Check any BSE-listed stock in the matrix
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Search a company to verify catalogue completeness, latest exchange-tape coverage, performance windows and
            same-category competitor rank for that ticker.
          </p>

          <div className="mt-5">
            <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Example: RELIANCE, 500325, Tata Steel"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    updateQuery("");
                    setMatches([]);
                    setResult(null);
                    setError(null);
                  }}
                  className="rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                disabled={!canSearch || loading}
                onClick={() => selectStock(query)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {loading ? "Checking" : "Check"}
              </button>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{statusLine}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.symbol}
                  type="button"
                  onClick={() => selectStock(example.symbol)}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                >
                  <CompanyLogo symbol={example.symbol} size={22} />
                  <span className="truncate">{example.name}</span>
                </button>
              ))}
            </div>

            {matches.length > 0 && (
              <div className="mt-4 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {matches.map((match) => (
                  <button
                    key={match.scripCode}
                    type="button"
                    onClick={() => selectStock(match.scripCode)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <CompanyLogo symbol={match.symbol} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{match.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                          {match.symbol} / BSE {match.scripCode} / {match.capTier}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatRupees(match.price ?? null)}</span>
                      <span className={`mt-0.5 block text-[10px] font-semibold tabular-nums ${(match.changePercent ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {formatPercent(match.changePercent ?? null)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          </div>
        </div>

        {!result && (
          <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <TopPerformers />
          </div>
        )}
      </div>
      {result && (
        <div className="mt-6 w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <AccuracyProfile result={result} />
        </div>
      )}
    </div>
  );
}
