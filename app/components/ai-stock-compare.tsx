"use client";

import { useState } from "react";
import { StockPicker } from "./stock-picker";
import type { CustomComparison } from "./triple-compare";
import { VerdictCards } from "./verdict-view";

type Winner = "A" | "B" | "Tie";

type ComparisonResult = {
  stockA: string;
  stockB: string;
  winner: Winner;
  verdict: string;
  stockAPros: string[];
  stockACons: string[];
  stockBPros: string[];
  stockBCons: string[];
  stockAScore: number;
  stockBScore: number;
  source: "ai" | "demo";
};

function PointList({ items, icon }: { items: string[]; icon: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-400">No points returned.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
          <span aria-hidden className="mt-0.5 shrink-0">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function AiStockCompare() {
  const [stockA, setStockA] = useState<string | null>("TCS");
  const [stockB, setStockB] = useState<string | null>("INFY");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  // The measured side of the same pairing, rendered in the identical cards the three-stock
  // comparison uses — so a reader moving between the two sections reads one layout, not two.
  const [performance, setPerformance] = useState<CustomComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStockA(null);
    setStockB(null);
    setResult(null);
    setPerformance(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stockA || !stockB) return;

    setLoading(true);
    setError(null);
    try {
      // The AI head-to-head and the performance cards are independent calls; running them
      // together means one wait rather than two.
      const [verdictResponse, performanceResponse] = await Promise.all([
        fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockA, stockB }),
        }),
        fetch(`/api/compare/custom?symbols=${encodeURIComponent(`${stockA},${stockB}`)}`),
      ]);
      if (!verdictResponse.ok) throw new Error("Comparison failed");

      setResult(await verdictResponse.json());
      // The cards are a bonus on top of the verdict: if only they fail, the head-to-head still
      // renders rather than the whole section erroring out.
      setPerformance(performanceResponse.ok ? await performanceResponse.json() : null);
    } catch {
      setError("Couldn't run the comparison right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  const winnerLabel =
    result?.winner === "A" ? result.stockA : result?.winner === "B" ? result.stockB : "Too close to call";

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-600 dark:text-violet-400">AI head-to-head</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Compare any two stocks with AI</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Pick two Indian stocks and get an AI verdict on which looks like the stronger pick right now, with pros and cons for
            each side.
          </p>
        </div>
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
          Live data • AI agents • OpenRouter ready
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
          <StockPicker
            label="Stock A"
            value={stockA}
            onChange={setStockA}
            exclude={stockB ? [stockB] : []}
            placeholder="Pick the first stock"
          />
          <span className="hidden pt-8 text-sm font-bold uppercase tracking-wide text-slate-400 md:block">vs</span>
          <StockPicker
            label="Stock B"
            value={stockB}
            onChange={setStockB}
            exclude={stockA ? [stockA] : []}
            placeholder="Pick the second stock"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!stockA || !stockB || loading}
            className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Comparing..." : "Compare with AI"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!stockA && !stockB && !result}
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Reset
          </button>
          {(!stockA || !stockB) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Pick both sides to run the head-to-head.</p>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5 transition-colors dark:border-violet-500/30 dark:bg-violet-500/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-700 dark:text-violet-400">Verdict</p>
              <span className="rounded-full bg-violet-600 px-4 py-1.5 text-base font-bold text-white">{winnerLabel}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{result.verdict}</p>
          </div>

          {performance && performance.stocks.length > 0 && (
            <VerdictCards stocks={performance.stocks} leader={performance.leader} laggard={performance.laggard} />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{result.stockA}</h4>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  Score {result.stockAScore}/100
                </span>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Pros</p>
              <div className="mt-2"><PointList items={result.stockAPros} icon="✅" /></div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Cons</p>
              <div className="mt-2"><PointList items={result.stockACons} icon="⚠️" /></div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{result.stockB}</h4>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  Score {result.stockBScore}/100
                </span>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Pros</p>
              <div className="mt-2"><PointList items={result.stockBPros} icon="✅" /></div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Cons</p>
              <div className="mt-2"><PointList items={result.stockBCons} icon="⚠️" /></div>
            </div>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {result.source === "ai" ? "Generated by AI agent" : "Heuristic demo (no AI key configured)"} · not investment advice.
          </p>
        </div>
      )}
    </section>
  );
}
