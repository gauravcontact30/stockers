"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal";
import { AnalyticsPanel } from "./analytics-panel";
import { MarketNews } from "./market-news";
import { PortfolioCard } from "./portfolio-card";
import { PredictionPanel } from "./prediction-panel";
import { StockSearch } from "./stock-search";
import { WatchlistCard } from "./watchlist-card";
import { companyLogoUrl, indianStocks } from "../lib/indian-stocks";

type UserData = {
  id: string;
  name: string;
  email: string;
  plan: string;
};

// Reads the session synchronously on the client so the dashboard never renders
// a flash of empty state; on the server this always returns null (no window).
function readStoredUser(): UserData | null {
  // Only reachable during real server-side rendering (no `window` global); a jsdom-based test
  // environment always provides `window`, so this branch can't be exercised from Jest.
  /* istanbul ignore next */
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem("stockers-auth");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw).user ?? null;
  } catch {
    return null;
  }
}

export function DashboardClient() {
  const router = useRouter();
  const [user] = useState<UserData | null>(readStoredUser);
  const [stock, setStock] = useState("RELIANCE");
  const [selectedSymbol, setSelectedSymbol] = useState("RELIANCE");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/signin");
    }
  }, [user, router]);

  const handleAnalyze = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setModalOpen(true);
    setSelectedSymbol(stock.toUpperCase());

    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock }),
    });

    const data = await response.json();
    setLoading(false);
    setAnalysis(data);
    setMessage(`Analysis ready for ${data.stock}.`);
  };

  const logout = () => {
    window.localStorage.removeItem("stockers-auth");
    router.push("/");
  };

  const analysisMeta = analysis ? indianStocks.find((s) => s.symbol === analysis.stock) : undefined;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#f8fafc_0%,_#f3f4f6_100%)] px-4 py-10 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-emerald-600">Stockers.AI</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Investor intelligence dashboard</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Research stocks with AI-backed insights, monitor the latest market narrative, and compare the positives and negatives before you act.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <p className="font-semibold">Signed in as {user?.name || "investor"}</p>
            <p className="mt-1">Plan: {user?.plan || "Starter"}</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-600">AI research</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Analyze a stock</h2>
              </div>
              <button
                onClick={logout}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
              >
                Logout
              </button>
            </div>

            <div className="mt-6">
              <StockSearch onSelect={(symbol) => setStock(symbol)} />
            </div>

            <form onSubmit={handleAnalyze} className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                placeholder="e.g. HDFC BANK"
              />
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500"
              >
                {loading ? "Researching..." : "Research stock"}
              </button>
            </form>

            {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

            <div className="mt-6">
              <PredictionPanel symbol={selectedSymbol} />
            </div>

            {analysis && (
              <div>
                <p className="mt-2 text-sm text-slate-700">{analysis.summary}</p>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  View full AI report
                </button>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-600">What Stockers.AI watches</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>• Earnings momentum and guidance changes</li>
                <li>• FII/DII flow and macro sentiment</li>
                <li>• Policy headlines and sector rotation</li>
                <li>• Technical breakout and support levels</li>
              </ul>
            </div>
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-600">Suggested focus</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Buy or avoid?</h3>
              {analysis ? (
                <div className="mt-3">
                  <p className="text-sm text-slate-600">
                    {analysis.recommendation || "Buy"} — open the full research report for key insights, market trends, company
                    actions, positive news, and reasons.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="mt-3 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Open report
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Select a stock to unlock the AI buy/avoid recommendation and full research report.</p>
              )}
            </div>
            <AnalyticsPanel />
            <MarketNews />
            <PortfolioCard />
            <WatchlistCard />
          </aside>
        </div>
      </div>

      <AiReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={loading}
        analysis={analysis}
        logoUrl={analysisMeta ? companyLogoUrl(analysisMeta.domain) : undefined}
        companyName={analysisMeta?.name}
      />
    </div>
  );
}
