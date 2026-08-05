"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { CapTier, SectorMeta } from "../lib/indian-stocks";

type Stock = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  logo: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  live: boolean;
  asOf: string | null;
};

type Outlook = "Bullish" | "Bearish" | "Neutral";
type Prediction = { symbol: string; outlook: Outlook; confidence: number; note: string };
type PredictionsState = { source: "ai" | "heuristic"; generatedAt: string; predictions: Record<string, Prediction> };

type Tab = "all" | "gainers" | "losers";
type CapFilter = "all" | CapTier;

function StockLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon host, not part of the Next/Image domain allowlist
    <img
      src={src}
      alt={`${name} logo`}
      width={36}
      height={36}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1.5 dark:border-slate-700"
    />
  );
}

function OutlookChip({ prediction }: { prediction?: Prediction }) {
  if (!prediction) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  }
  const styles: Record<Outlook, string> = {
    Bullish: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    Bearish: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    Neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span
      title={prediction.note}
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[prediction.outlook]}`}
    >
      {prediction.outlook} · {prediction.confidence}%
    </span>
  );
}

function formatRupees(value: number | null) {
  if (value === null) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatVolume(value: number | null) {
  if (value === null) return "—";
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return value.toLocaleString("en-IN");
}

function timeAgo(iso: string | null) {
  if (!iso) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "moments ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const REFRESH_INTERVAL_MS = 60_000;

export function IndianStocksMarket({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [sectorsMeta, setSectorsMeta] = useState<SectorMeta[]>([]);
  const [predictions, setPredictions] = useState<PredictionsState | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [capFilter, setCapFilter] = useState<CapFilter>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadQuotes = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const response = await fetch("/api/market/quotes");
      if (!response.ok) throw new Error("Failed to load market data");
      const data = await response.json();
      setStocks(data.stocks);
      setSectorsMeta(data.sectors);
      setLiveCount(data.liveCount);
      setTotalCount(data.totalCount);
      setLastUpdated(data.generatedAt);
      setError(null);
    } catch {
      setError("Couldn't reach the market data feed. Showing the last known values.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPredictions = useCallback(async () => {
    try {
      const response = await fetch("/api/predictions/daily");
      if (!response.ok) return;
      const data = await response.json();
      setPredictions(data);
    } catch {
      // Predictions are a bonus layer; silently skip if unavailable.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount + polling interval; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    loadQuotes("initial");
    loadPredictions();

    const interval = window.setInterval(() => loadQuotes("refresh"), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadQuotes, loadPredictions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    let list = stocks.filter((stock) => {
      if (capFilter !== "all" && stock.capTier !== capFilter) return false;
      if (sectorFilter !== "all" && stock.sector !== sectorFilter) return false;
      if (query && !stock.symbol.toLowerCase().includes(query) && !stock.name.toLowerCase().includes(query)) {
        return false;
      }
      if (activeTab === "gainers") return (stock.changePercent ?? -Infinity) > 0;
      if (activeTab === "losers") return (stock.changePercent ?? Infinity) < 0;
      return true;
    });

    if (activeTab === "gainers") {
      list = list.sort((a, b) => {
        // The filter above already excludes stocks with a null changePercent for this tab, so
        // the ?? fallback below is unreachable defensive code.
        /* istanbul ignore next */
        return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
      });
    } else if (activeTab === "losers") {
      list = list.sort((a, b) => {
        // Same reasoning as the gainers branch above: nulls are already filtered out.
        /* istanbul ignore next */
        return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
      });
    } else {
      list = list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    return list;
  }, [stocks, capFilter, sectorFilter, search, activeTab]);

  const sectorSummary = useMemo(() => {
    if (sectorFilter === "all") return null;
    const meta = sectorsMeta.find((s) => s.name === sectorFilter);
    const inSector = stocks.filter((s) => s.sector === sectorFilter);
    const withChange = inSector.filter((s) => s.changePercent !== null);
    const avgChange = withChange.length
      ? withChange.reduce((sum, s) => {
          // withChange is already filtered to exclude null changePercent, so the ?? fallback
          // below is unreachable defensive code.
          /* istanbul ignore next */
          return sum + (s.changePercent ?? 0);
        }, 0) / withChange.length
      : null;
    const gainers = inSector.filter((s) => (s.changePercent ?? 0) > 0).length;
    const losers = inSector.filter((s) => (s.changePercent ?? 0) < 0).length;
    return { meta, count: inSector.length, avgChange, gainers, losers };
  }, [sectorFilter, sectorsMeta, stocks]);

  const predictionSummary = useMemo(() => {
    if (!predictions) return null;
    const values = Object.values(predictions.predictions);
    return {
      bullish: values.filter((p) => p.outlook === "Bullish").length,
      bearish: values.filter((p) => p.outlook === "Bearish").length,
      neutral: values.filter((p) => p.outlook === "Neutral").length,
    };
  }, [predictions]);

  const resetFilters = () => {
    setActiveTab("all");
    setCapFilter("all");
    setSectorFilter("all");
    setSearch("");
  };

  return (
    <div className="rounded-3xl border border-slate-200 transition-colors dark:border-slate-800">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
            Today&apos;s market snapshot
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Click any row to run a deep AI analysis below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              liveCount > 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${liveCount > 0 ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`}
            />
            {liveCount > 0 ? `Live · ${liveCount}/${totalCount}` : "Feed unavailable"}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">Updated {timeAgo(lastUpdated)}</span>
          <button
            type="button"
            onClick={() => loadQuotes("refresh")}
            disabled={refreshing}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* AI daily outlook strip */}
      {predictionSummary && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            AI daily outlook
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">{predictionSummary.bullish} Bullish</span>
          <span className="text-rose-600 dark:text-rose-400">{predictionSummary.bearish} Bearish</span>
          <span>{predictionSummary.neutral} Neutral</span>
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            {predictions?.source === "ai" ? "Generated by AI agent" : "Heuristic demo (no AI key configured)"}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "gainers", "losers"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === tab
                  ? tab === "gainers"
                    ? "bg-emerald-600 text-white"
                    : tab === "losers"
                      ? "bg-rose-600 text-white"
                      : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tab === "all" ? "All" : tab === "gainers" ? "Gainers" : "Losers"}
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

          {(["all", "Large", "Mid", "Small"] as CapFilter[]).map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => setCapFilter(cap)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                capFilter === cap
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {cap === "all" ? "All caps" : `${cap} cap`}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={sectorFilter}
            onChange={(event) => setSectorFilter(event.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="all">All sectors</option>
            {sectorsMeta.map((sector) => (
              <option key={sector.key} value={sector.name}>
                {sector.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search company or symbol"
            className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {sectorSummary && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-slate-600 dark:text-slate-400">{sectorSummary.meta?.description}</p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>{sectorSummary.count} companies tracked</span>
              <span className="text-emerald-600 dark:text-emerald-400">{sectorSummary.gainers} gainers</span>
              <span className="text-rose-600 dark:text-rose-400">{sectorSummary.losers} losers</span>
              {sectorSummary.avgChange !== null && (
                <span>Avg change {sectorSummary.avgChange >= 0 ? "+" : ""}{sectorSummary.avgChange.toFixed(2)}%</span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Sector</th>
              <th className="px-4 py-3 text-right font-semibold">LTP</th>
              <th className="px-4 py-3 text-right font-semibold">Change</th>
              <th className="px-4 py-3 text-right font-semibold">% Chg</th>
              <th className="px-4 py-3 text-right font-semibold">Day high</th>
              <th className="px-4 py-3 text-right font-semibold">Day low</th>
              <th className="px-4 py-3 text-right font-semibold">Volume</th>
              <th className="px-4 py-3 font-semibold">AI outlook</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800/60">
                  <td colSpan={9} className="px-4 py-4">
                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  <p>No stocks match your filters.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-2 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Reset filters
                  </button>
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((stock) => {
                const isUp = (stock.changePercent ?? 0) >= 0;
                const changeClass =
                  stock.changePercent === null
                    ? "text-slate-400 dark:text-slate-500"
                    : isUp
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";

                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => onSelect?.(stock.symbol)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StockLogo src={stock.logo} name={stock.name} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-900 dark:text-white">{stock.symbol}</p>
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${stock.live ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                              title={stock.live ? "Live price" : "Price unavailable"}
                            />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{stock.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{stock.sector}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                      {formatRupees(stock.price)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${changeClass}`}>
                      {stock.change === null ? "—" : `${isUp ? "+" : "-"}₹${Math.abs(stock.change).toFixed(2)}`}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${changeClass}`}>
                      {stock.changePercent === null
                        ? "—"
                        : `${isUp ? "▲" : "▼"} ${Math.abs(stock.changePercent).toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {formatRupees(stock.dayHigh)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {formatRupees(stock.dayLow)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                      {formatVolume(stock.volume)}
                    </td>
                    <td className="px-4 py-3">
                      <OutlookChip prediction={predictions?.predictions[stock.symbol]} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          Showing {filtered.length} of {totalCount} stocks
        </span>
        <span>Prices via Yahoo Finance (unofficial public feed) · not investment advice</span>
      </div>
    </div>
  );
}
