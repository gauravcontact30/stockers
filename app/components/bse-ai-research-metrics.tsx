import { cookies } from "next/headers";
import { getAuthorizedBseAiAnalysis, type FinancialMeasures } from "../lib/bse-ai-analysis";
import { findUserById, SESSION_COOKIE, verifyToken } from "../lib/store";
import { BseAiResearchMetricsClient, type BseAiResearchMetricCard, type BseAiResearchMetricsView } from "./bse-ai-research-metrics-client";

function formatMoney(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

function formatVolume(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function toneForPercent(value: number | null): BseAiResearchMetricCard["tone"] {
  if (value === null) return "neutral";
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "neutral";
}

function viewFrom(input: {
  securityCode: string;
  companyName: string | null;
  asOf: string;
  measures: FinancialMeasures;
  analysis: {
    summary: string;
    trend: string;
    risk: string;
    signals: string[];
    warnings: string[];
    actionItems: string[];
    confidence: number;
    source: "ai" | "fallback";
  };
}): BseAiResearchMetricsView {
  const { measures, analysis } = input;

  /**
   * This is the only data that crosses into the client child: formatted strings and short model
   * summaries. Raw price rows, scoring coefficients, prompt text, service tokens, and any future
   * proprietary model weights remain in server-only modules.
   */
  const metrics: BseAiResearchMetricCard[] = [
    { label: "Latest close", value: formatMoney(measures.latestClose), hint: `Previous ${formatMoney(measures.previousClose)}`, tone: "neutral" },
    { label: "1D return", value: formatPercent(measures.oneDayReturnPercent), hint: "Latest session move", tone: toneForPercent(measures.oneDayReturnPercent) },
    { label: "20-session return", value: formatPercent(measures.twentySessionReturnPercent), hint: "Short-term momentum", tone: toneForPercent(measures.twentySessionReturnPercent) },
    { label: "60-session return", value: formatPercent(measures.sixtySessionReturnPercent), hint: "Medium-term trend", tone: toneForPercent(measures.sixtySessionReturnPercent) },
    { label: "1Y return", value: formatPercent(measures.oneYearReturnPercent), hint: "Longer trend check", tone: toneForPercent(measures.oneYearReturnPercent) },
    { label: "Volatility", value: formatPercent(measures.annualizedVolatility20SessionPercent), hint: "20-session annualized", tone: "watch" },
    { label: "Drawdown", value: formatPercent(measures.drawdownFromHighPercent), hint: "From observed high", tone: measures.drawdownFromHighPercent < -10 ? "watch" : "neutral" },
    { label: "Avg volume", value: formatVolume(measures.averageVolume20Session), hint: "20-session average", tone: "neutral" },
  ];

  return {
    title: input.companyName ? `${input.companyName} / BSE ${input.securityCode}` : `BSE ${input.securityCode}`,
    subtitle: `Support ${formatMoney(measures.support20Session)} · resistance ${formatMoney(measures.resistance20Session)} · 52W band ${formatMoney(measures.low52Week)} to ${formatMoney(measures.high52Week)}`,
    asOf: input.asOf,
    source: analysis.source === "ai" ? "Structured AI read over validated BSE history" : "Fallback read from validated BSE history",
    trend: analysis.trend,
    risk: analysis.risk,
    confidence: `${Math.round(analysis.confidence)}%`,
    summary: analysis.summary,
    metrics,
    signals: analysis.signals,
    warnings: analysis.warnings,
    actionItems: analysis.actionItems,
  };
}

export async function BseAiResearchMetrics({ securityCode }: { securityCode: string }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const id = verifyToken(token);
  const user = id ? await findUserById(id) : null;

  const result = await getAuthorizedBseAiAnalysis(securityCode, user);
  if (!result.ok) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
        <p className="font-semibold">BSE AI research unavailable</p>
        <p className="mt-1">{result.message}</p>
      </section>
    );
  }

  return <BseAiResearchMetricsClient view={viewFrom(result.data)} />;
}
