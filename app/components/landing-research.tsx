"use client";

import { useState } from "react";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal";
import { IndianStocksMarket } from "./indian-stocks-market";
import { StockCombobox } from "./stock-combobox";
import { indianStocks } from "../lib/indian-stocks";
import { stockIcon } from "../lib/company-logos";
import { fetchResearch } from "./research-cache";

export function LandingResearch() {
  const [stock, setStock] = useState("RELIANCE");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const runAnalysis = async (symbol: string) => {
    setLoading(true);
    setMessage(null);
    setModalOpen(true);

    const data = await fetchResearch(symbol);
    setLoading(false);
    setAnalysis(data);
    setMessage(`AI market scan generated for ${data.stock}.`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAnalysis(stock);
  };

  const handleStockRowSelect = (symbol: string) => {
    setStock(symbol);
    runAnalysis(symbol);
  };

  const analysisMeta = analysis ? indianStocks.find((s) => s.symbol === analysis.stock) : undefined;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">AI stock researcher</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Real Indian market data, decoded by AI</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Browse gainers, losers, and every major sector with live prices, then get an AI-backed deep dive with predictions and a positive/negative news summary for any stock.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          Live data • AI agents • OpenRouter ready
        </div>
      </div>

      <div className="mt-6">
        <IndianStocksMarket onSelect={handleStockRowSelect} />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <StockCombobox
          value={stock}
          onChange={setStock}
          className="flex-1"
          placeholder="Try HDFC BANK or TCS"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500"
        >
          {loading ? "Researching..." : "Analyze stock"}
        </button>
      </form>

      {message && <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>}

      <AiReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={loading}
        analysis={analysis}
        logoUrl={analysisMeta ? stockIcon(analysisMeta.symbol, analysisMeta.domain) : undefined}
        companyName={analysisMeta?.name}
      />
    </section>
  );
}
