"use client";

import { useState } from "react";
import { MarketSection, SectionError, SectionFootnote } from "./market-section";
import { StockPicker } from "./stock-picker";
import { SourceNote, VerdictCards, type StockVerdict } from "./verdict-view";

export type CustomComparison = {
  stocks: StockVerdict[];
  sameSector: boolean;
  leader: string | null;
  laggard: string | null;
  takeaway: string;
};

const SLOTS = [0, 1, 2] as const;
const SLOT_LABELS = ["Stock 1", "Stock 2", "Stock 3"];

/**
 * Build your own comparison: any two or three stocks, from one sector or several.
 *
 * The showdowns above answer "which of these peers", which only works for the peer sets we chose.
 * This answers the same question for whatever a reader actually holds or is weighing up.
 */
export function TripleCompare() {
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  const [result, setResult] = useState<CustomComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = picks.filter((symbol): symbol is string => symbol !== null);
  const canCompare = chosen.length >= 2;

  const setSlot = (index: number, symbol: string | null) => {
    setPicks((current) => current.map((value, slot) => (slot === index ? symbol : value)));
  };

  const reset = () => {
    setPicks([null, null, null]);
    setResult(null);
    setError(null);
  };

  const compare = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/compare/custom?symbols=${encodeURIComponent(chosen.join(","))}`);
      if (!response.ok) throw new Error("Comparison failed");
      setResult(await response.json());
    } catch {
      setError("Couldn't run that comparison right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketSection
      id="compare-your-own"
      eyebrow="Build your own"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="Compare any three stocks"
      blurb="Pick up to three companies — same sector for a like-for-like contest, or across sectors to see which is carrying its weight. Each dropdown is grouped by sector and searchable."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
          {chosen.length} of 3 selected
        </div>
      }
    >
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SLOTS.map((slot) => (
          <StockPicker
            key={slot}
            label={SLOT_LABELS[slot]}
            value={picks[slot]}
            onChange={(symbol) => setSlot(slot, symbol)}
            exclude={picks.filter((symbol, index): symbol is string => symbol !== null && index !== slot)}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={compare}
          disabled={!canCompare || loading}
          className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={chosen.length === 0 && !result}
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
        >
          Reset all
        </button>
        {!canCompare && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Pick at least two stocks to run a comparison.</p>
        )}
      </div>

      {error && <SectionError message={error} />}

      {result && result.stocks.length > 0 && (
        <div className="mt-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {result.sameSector ? "Like-for-like · same sector" : "Across sectors"}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{result.takeaway}</p>
          </div>

          <div className="mt-4">
            <VerdictCards stocks={result.stocks} leader={result.leader} laggard={result.laggard} />
          </div>
        </div>
      )}

      <SectionFootnote>
        <SourceNote source={result?.stocks[0]?.source ?? "heuristic"} />
      </SectionFootnote>
    </MarketSection>
  );
}
