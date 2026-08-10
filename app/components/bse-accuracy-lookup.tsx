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
  checks: { label: string; ok: boolean; detail: string }[];
};

type AccuracyResponse = {
  matches?: BseAccuracyMatch[];
  result?: BseStockAccuracy | null;
};

const EXAMPLES = ["RELIANCE", "TCS", "SBIN", "ACCURACY"];

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatRupees(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Meter({ value, label, tone }: { value: number | null; label: string; tone: string }) {
  const width = Math.max(0, Math.min(value ?? 0, 100));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{value === null ? "N/A" : `${value}%`}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
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
          setMatches(data.result ? [] : (data.matches ?? []));
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
      setMatches(data.result ? [] : (data.matches ?? []));
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
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-sky-600 dark:text-sky-400">
            Stock accuracy lookup
          </p>
          <h4 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
            Check any BSE-listed stock in the matrix
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Search a company to verify catalogue completeness, latest exchange-tape coverage and whether today&apos;s
            prediction confidence is available for that ticker.
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
                  key={example}
                  type="button"
                  onClick={() => selectStock(example)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                >
                  {example}
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
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{match.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {match.symbol} / {match.scripCode} / {match.capTier}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900">
          {result ? (
            <div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyLogo symbol={result.symbol} size={54} className="rounded-2xl" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">BSE stock profile</p>
                      <h5 className="mt-1 truncate text-xl font-semibold text-slate-900 dark:text-white">{result.name}</h5>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {result.symbol} / BSE {result.scripCode}
                      </p>
                    </div>
                  </div>
                  <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {result.capTier} cap
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Current BSE price</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatRupees(result.price)}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{result.sessionDate ?? "No BSE session date"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">BSE performance</p>
                    <p className={`mt-2 text-2xl font-semibold tabular-nums ${(result.changePercent ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                      {formatPercent(result.changePercent)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest exchange move</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Meter value={result.matrixAccuracy} label="Matrix" tone="bg-emerald-500" />
                <Meter value={result.exchangeDataCoverage} label="Exchange data" tone="bg-sky-500" />
                <Meter value={result.predictionConfidence} label="Prediction" tone="bg-rose-500" />
              </div>

            </div>
          ) : (
            // Until something has been looked up, the panel earns its space by answering the
            // question most visitors arrive with: which listed names actually compounded.
            <TopPerformers />
          )}
        </div>
      </div>
    </div>
  );
}
