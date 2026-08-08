"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal";
import { CapTierPill, LiveIndicator } from "./market-badges";
import { LiveMarketValue, StockReturns } from "./stock-returns";
import { sectors, type CapTier } from "../lib/indian-stocks";

type ReturnPeriod = "1mo" | "6mo" | "1y" | "3y" | "5y" | "max";

type DipStock = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  logo: string | null;
  price: number | null;
  changePercent: number;
  periodReturn: number;
  declineReturn: number;
};

type DipWinnersState = {
  stocks: DipStock[];
  generatedAt: string;
  asOfDate: string;
  source: string;
};

type CapTierFilter = Record<CapTier, boolean>;

type Filters = {
  sector: string;
  capTiers: CapTierFilter;
  period: ReturnPeriod;
  minReturn: number;
  declinePeriod: ReturnPeriod;
};

const CAP_TIER_OPTIONS: CapTier[] = ["Large", "Mid", "Small"];

const PERIOD_OPTIONS: { value: ReturnPeriod; label: string }[] = [
  { value: "1mo", label: "1-Month" },
  { value: "6mo", label: "6-Month" },
  { value: "1y", label: "1-Year" },
  { value: "3y", label: "3-Year" },
  { value: "5y", label: "5-Year" },
  { value: "max", label: "Overall" },
];

// appliedFilters.period/declinePeriod are always one of PERIOD_OPTIONS' own values (state only
// ever moves between DEFAULT_FILTERS and a dropdown's own option values), so this lookup always
// succeeds — the fallback exists only to keep TypeScript happy about the Map miss case.
function periodLabelFor(period: ReturnPeriod): string {
  /* istanbul ignore next -- see comment above; the fallback branch is unreachable in practice */
  return PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "";
}

// Fixed at a sensible default rather than exposed as a control — how many rows to show isn't
// a filter that helps find the best stocks, just a display preference.
const RESULT_LIMIT = 10;

// Mirrors the API's defaults: proven winners over the selected period that have also pulled
// back over a separately selectable decline period, and are trading at their cheapest price
// today. Only the filters traders actually reach for are exposed here.
const DEFAULT_FILTERS: Filters = {
  sector: "",
  capTiers: { Large: true, Mid: true, Small: true },
  period: "6mo",
  minReturn: 20,
  declinePeriod: "1mo",
};

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.sector) params.set("sector", filters.sector);

  const activeCapTiers = CAP_TIER_OPTIONS.filter((tier) => filters.capTiers[tier]);
  /* istanbul ignore next -- toggleCapTier always keeps at least one tier checked, so activeCapTiers.length is never 0 here; the `> 0` half of this guard is defensive only. */
  if (activeCapTiers.length > 0 && activeCapTiers.length < CAP_TIER_OPTIONS.length) {
    params.set("capTier", activeCapTiers.join(","));
  }

  params.set("period", filters.period);
  params.set("minReturn", String(filters.minReturn));
  params.set("declinePeriod", filters.declinePeriod);
  params.set("limit", String(RESULT_LIMIT));
  return params.toString();
}

function DipLogo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
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

const inputClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400";

export function DipWinners() {
  const [state, setState] = useState<DipWinnersState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildQuery(appliedFilters);
      const response = await fetch(`/api/market/dip-winners?${query}`);
      if (!response.ok) throw new Error("Failed to load dip winners");
      const data = await response.json();
      setState(data);
      setError(null);
    } catch {
      setError("Couldn't reach the market data feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount and on filter apply; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  const handleRowSelect = async (symbol: string) => {
    setSelected(symbol);
    setAnalysisLoading(true);
    setAnalysis(null);

    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: symbol }),
    });
    const data = await response.json();
    setAnalysisLoading(false);
    setAnalysis(data);
  };

  const toggleCapTier = (tier: CapTier) => {
    setDraftFilters((prev) => {
      const nextValue = !prev.capTiers[tier];
      const activeCount = CAP_TIER_OPTIONS.filter((t) => (t === tier ? nextValue : prev.capTiers[t])).length;
      // Return a new object (not `prev`) even when blocking the change: returning the same
      // reference makes React bail out of re-rendering, which would leave the checkbox's
      // native DOM `checked` state (already flipped by the click's default browser behavior)
      // out of sync with the unchanged React state.
      if (activeCount === 0) return { ...prev };
      return { ...prev, capTiers: { ...prev.capTiers, [tier]: nextValue } };
    });
  };

  const applyFilters = () => setAppliedFilters(draftFilters);
  const resetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const stocks = state?.stocks ?? [];
  const selectedStock = stocks.find((s) => s.symbol === selected);
  const periodLabel = periodLabelFor(appliedFilters.period);
  const declinePeriodLabel = periodLabelFor(appliedFilters.declinePeriod);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400">Today&apos;s dip screener</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Proven {periodLabel} winners, trading cheaper today</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Winners over the period you pick — 1 month to all-time — that have also pulled back over a period of your choice,
            and are trading at their cheapest price of the day. The most relevant filters are applied automatically below;
            adjust them to match your own criteria.
          </p>
        </div>
        <div className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          Losers today • Winners over {periodLabel}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelClass}>
          Sector
          <select
            value={draftFilters.sector}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, sector: e.target.value }))}
            className={inputClass}
          >
            <option value="">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector.key} value={sector.key}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Performance period
          <select
            value={draftFilters.period}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, period: e.target.value as ReturnPeriod }))}
            className={inputClass}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Min return over period (%)
          <input
            type="number"
            min={0}
            step={10}
            value={draftFilters.minReturn}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, minReturn: Number(e.target.value) }))}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Measure the pullback over
          <select
            value={draftFilters.declinePeriod}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, declinePeriod: e.target.value as ReturnPeriod }))}
            className={inputClass}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className={labelClass}>
          Market cap
          <div className="flex flex-wrap items-center gap-3 pt-1.5">
            {CAP_TIER_OPTIONS.map((tier) => (
              <label key={tier} className="flex items-center gap-1.5 text-sm font-normal text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={draftFilters.capTiers[tier]}
                  onChange={() => toggleCapTier(tier)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-slate-600"
                />
                {tier}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Sector</th>
              <th className="px-4 py-3 text-right font-semibold">LTP</th>
              <th className="px-4 py-3 text-right font-semibold">Today</th>
              <th className="px-4 py-3 text-right font-semibold">{periodLabel} return</th>
              <th className="px-4 py-3 text-right font-semibold">{declinePeriodLabel} decline</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800/60">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              ))}

            {!loading && stocks.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No stocks currently match these filters. Try loosening the return or decline threshold, or picking different
                  periods.
                </td>
              </tr>
            )}

            {!loading &&
              stocks.map((stock) => (
                <Fragment key={stock.symbol}>
                <tr
                  onClick={() => handleRowSelect(stock.symbol)}
                  className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${
                    selected === stock.symbol ? "bg-rose-50/60 dark:bg-rose-500/10" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <DipLogo src={stock.logo} name={stock.name} />
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-slate-900 dark:text-white">{stock.symbol}</p>
                          <CapTierPill tier={stock.capTier} />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{stock.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{stock.sector}</td>
                  <td className="px-4 py-3 text-right">
                    <LiveMarketValue symbol={stock.symbol} fallbackPrice={stock.price} showChange={false} className="justify-end" />
                    <LiveIndicator className="justify-end" />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-rose-600 dark:text-rose-400">
                    ▼ {Math.abs(stock.changePercent).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    +{stock.periodReturn.toFixed(0)}%
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      stock.declineReturn < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {stock.declineReturn < 0 ? `▼ ${Math.abs(stock.declineReturn).toFixed(1)}%` : "—"}
                  </td>
                </tr>
                <tr
                  onClick={() => handleRowSelect(stock.symbol)}
                  className={`cursor-pointer transition ${selected === stock.symbol ? "bg-rose-50/60 dark:bg-rose-500/10" : ""}`}
                >
                  <td colSpan={6} className="px-4 pb-3">
                    <StockReturns
                      symbol={stock.symbol}
                      columns={8}
                      label="Returns"
                      className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40"
                    />
                  </td>
                </tr>
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Prices via Yahoo Finance (unofficial public feed) · not investment advice. Click a row for a full AI research report.
      </p>

      <AiReportModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        loading={analysisLoading}
        analysis={analysis}
        logoUrl={selectedStock?.logo}
        companyName={selectedStock?.name}
      />
    </section>
  );
}
