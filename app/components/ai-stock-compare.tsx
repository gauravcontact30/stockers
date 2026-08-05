"use client";

import { useState } from "react";
import { indianStocks } from "../lib/indian-stocks";

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
  const [stockA, setStockA] = useState("TCS");
  const [stockB, setStockB] = useState("INFY");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stockA.trim() || !stockB.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockA, stockB }),
      });
      if (!response.ok) throw new Error("Comparison failed");
      const data = await response.json();
      setResult(data);
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

      <datalist id="compare-symbols">
        {indianStocks.map((stock) => (
          <option key={stock.symbol} value={stock.symbol}>
            {stock.name}
          </option>
        ))}
      </datalist>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={stockA}
          onChange={(event) => setStockA(event.target.value)}
          list="compare-symbols"
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          placeholder="Stock A, e.g. TCS"
        />
        <span className="text-sm font-semibold text-slate-400">vs</span>
        <input
          value={stockB}
          onChange={(event) => setStockB(event.target.value)}
          list="compare-symbols"
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          placeholder="Stock B, e.g. INFY"
        />
        <button
          type="submit"
          className="rounded-full bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-500"
        >
          {loading ? "Comparing..." : "Compare with AI"}
        </button>
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
