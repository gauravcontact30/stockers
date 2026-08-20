// Reads OPENROUTER_API_KEY through `./openrouter`. The `server-only` import makes a client
// component that pulls this in a build error, rather than a key that quietly ships to the browser.
import "server-only";

import { chatJson, extractJsonObject } from "./openrouter";
import { getPerformanceSummary, type PerformanceSummary } from "./stock-performance";

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return strings.length > 0 ? strings : fallback;
  }
  return fallback;
}

function toScore(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export type Winner = "A" | "B" | "Tie";

export type ComparisonResult = {
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

function buildDemoComparison(stockA: string, stockB: string): ComparisonResult {
  return {
    stockA,
    stockB,
    winner: "A",
    verdict: `${stockA} edges out ${stockB} on near-term risk-reward, though both remain reasonable holdings depending on your time horizon and sector view.`,
    stockAPros: [
      `${stockA} shows steadier earnings visibility and supportive sector positioning.`,
      "Institutional flows have been net constructive over recent sessions.",
      "Valuation leaves room for re-rating if execution stays on track.",
    ],
    stockACons: [
      "Near-term volatility could compress multiples if broader sentiment sours.",
      "Any earnings miss would weigh disproportionately given current expectations.",
    ],
    stockBPros: [
      `${stockB} offers diversification with a different sector/business-cycle exposure.`,
      "Technical structure suggests the stock is holding key support.",
    ],
    stockBCons: [
      "Growth visibility is comparatively less certain over the next few quarters.",
      "Sector headwinds could cap upside relative to peers.",
    ],
    stockAScore: 74,
    stockBScore: 68,
    source: "demo",
  };
}

function normalizeComparison(raw: unknown, stockA: string, stockB: string): ComparisonResult {
  const demo = buildDemoComparison(stockA, stockB);
  if (!raw || typeof raw !== "object") return demo;
  const c = raw as Record<string, unknown>;

  const winner: Winner = c.winner === "A" || c.winner === "B" || c.winner === "Tie" ? c.winner : demo.winner;

  return {
    stockA,
    stockB,
    winner,
    verdict: typeof c.verdict === "string" && c.verdict.trim() ? c.verdict : demo.verdict,
    stockAPros: toStringArray(c.stockAPros, demo.stockAPros),
    stockACons: toStringArray(c.stockACons, demo.stockACons),
    stockBPros: toStringArray(c.stockBPros, demo.stockBPros),
    stockBCons: toStringArray(c.stockBCons, demo.stockBCons),
    stockAScore: toScore(c.stockAScore, demo.stockAScore),
    stockBScore: toScore(c.stockBScore, demo.stockBScore),
    source: "ai",
  };
}

function pct(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "not available";
}

function comparisonFacts(performance: PerformanceSummary): string {
  const price =
    typeof performance.price === "number"
      ? `${performance.currency} ${performance.price.toFixed(2)}`
      : "not available";

  return [
    `${performance.symbol}:`,
    `- Last traded price: ${price}${performance.asOf ? ` as of ${performance.asOf}` : ""}`,
    `- Returns: 1D ${pct(performance.oneDay)}, 1W ${pct(performance.oneWeek)}, 1M ${pct(performance.oneMonth)}, 6M ${pct(performance.sixMonth)}, 1Y ${pct(performance.oneYear)}, 3Y ${pct(performance.threeYear)}, 5Y ${pct(performance.fiveYear)}, Overall${performance.overallSince ? ` since ${performance.overallSince}` : ""} ${pct(performance.overall)}`,
  ].join("\n");
}

export async function generateComparison(stockAInput: string, stockBInput: string): Promise<ComparisonResult> {
  const stockA = stockAInput.trim().toUpperCase();
  const stockB = stockBInput.trim().toUpperCase();
  const demo = buildDemoComparison(stockA, stockB);

  let performanceA: PerformanceSummary;
  let performanceB: PerformanceSummary;
  try {
    [performanceA, performanceB] = await Promise.all([getPerformanceSummary(stockA), getPerformanceSummary(stockB)]);
  } catch (error) {
    console.error(error);
    return demo;
  }

  const comparison = await chatJson({
    feature: "compare",
    system:
      "You are stockers, an AI research assistant comparing two Indian stocks head-to-head for an investor deciding between them. Return compact JSON only, with these keys: winner, verdict, stockAPros, stockACons, stockBPros, stockBCons, stockAScore, stockBScore. winner must be exactly one of \"A\", \"B\", or \"Tie\". verdict is 1-2 sentences giving a clear, direct comparison call. stockAPros/stockACons/stockBPros/stockBCons are arrays of specific, concrete points. stockAScore and stockBScore are 0-100 overall scores. Use only the verified market facts supplied by the user for price or return numbers; never invent targets, valuation multiples, market caps, or percentages.",
    user: `Verified market facts from Yahoo Finance:\n\nStock A\n${comparisonFacts(performanceA)}\n\nStock B\n${comparisonFacts(performanceB)}\n\nCompare ${stockA} (stock A) against ${stockB} (stock B) for an Indian investor choosing between the two. Give a clear winner call with reasons, pros/cons for each, and a score for each. Copy price or return numbers only from the verified facts above.`,
    temperature: 0.2,
    parse: (text) => {
      const parsed = extractJsonObject(text);
      return parsed === null ? null : normalizeComparison(parsed, stockA, stockB);
    },
  });

  return comparison ?? demo;
}
