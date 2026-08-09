import { getPerformanceSummary, type PerformanceSummary } from "./stock-performance";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return strings.length > 0 ? strings : fallback;
  }
  if (typeof value === "string" && value.trim().length > 0) return [value];
  return fallback;
}

function toScore(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export type AnalysisResult = ReturnType<typeof buildDemoAnalysis>;

// The LLM is asked for JSON but isn't schema-constrained, so its output can omit fields,
// use the wrong type, or nest things unexpectedly. Normalize against the demo shape so every
// consumer (landing page, dashboard, top picks) can rely on a consistent contract instead of crashing.
function normalizeAnalysis(raw: unknown, stock: string): AnalysisResult {
  const demo = buildDemoAnalysis(stock);
  if (!raw || typeof raw !== "object") return demo;
  const candidate = raw as Record<string, unknown>;

  return {
    stock: typeof candidate.stock === "string" && candidate.stock.trim() ? candidate.stock : demo.stock,
    marketPulse: typeof candidate.marketPulse === "string" && candidate.marketPulse.trim() ? candidate.marketPulse : demo.marketPulse,
    summary: typeof candidate.summary === "string" && candidate.summary.trim() ? candidate.summary : demo.summary,
    positiveSignals: toStringArray(candidate.positiveSignals, demo.positiveSignals),
    negativeSignals: toStringArray(candidate.negativeSignals, demo.negativeSignals),
    score: toScore(candidate.score, demo.score),
    risk: typeof candidate.risk === "string" && candidate.risk.trim() ? candidate.risk : demo.risk,
    nextSteps: toStringArray(candidate.nextSteps, demo.nextSteps),
    prediction: typeof candidate.prediction === "string" && candidate.prediction.trim() ? candidate.prediction : demo.prediction,
    newsFocus: toStringArray(candidate.newsFocus, demo.newsFocus),
    outlook: typeof candidate.outlook === "string" && candidate.outlook.trim() ? candidate.outlook : demo.outlook,
    // Not read from candidate: the LLM sometimes fills "source" with a citation-style
    // string (e.g. "quarterly earnings, RBI updates...") instead of a provenance marker.
    // This field is internal bookkeeping (ai vs demo), so it's always derived, never LLM-authored.
    source: "ai",
    recommendation: typeof candidate.recommendation === "string" && candidate.recommendation.trim() ? candidate.recommendation : demo.recommendation,
    recommendationReasons: toStringArray(candidate.recommendationReasons, demo.recommendationReasons),
    keyInsights: toStringArray(candidate.keyInsights, demo.keyInsights),
    marketTrends: toStringArray(candidate.marketTrends, demo.marketTrends),
    companyActions: toStringArray(candidate.companyActions, demo.companyActions),
    positiveNews: toStringArray(candidate.positiveNews, demo.positiveNews),
  };
}

export function buildDemoAnalysis(stock: string) {
  const core = stock.toUpperCase();
  return {
    stock: core,
    marketPulse: "Momentum remains constructive as domestic flows continue to support large-cap names.",
    summary: `${core} shows a compelling blend of strong earnings visibility, improving sector tailwinds, and reasonable valuation discipline for growth investors.`,
    positiveSignals: [
      `${core} benefits from improving sector fundamentals and sustained institutional interest.`,
      "Recent policy and macro commentary point to supportive liquidity conditions for quality businesses.",
      "Technical structures suggest breakout potential if the stock can hold above the recent base.",
    ],
    negativeSignals: [
      "Near-term volatility remains elevated as global cues could pressure sentiment.",
      "Any earnings disappointment or margin compression could trigger a sharp pullback.",
      "Valuations may be stretched if the market shifts toward defensive positioning.",
    ],
    score: 78,
    risk: "Moderate",
    nextSteps: [
      "Watch for confirmation above the latest resistance band.",
      "Track quarterly updates and management commentary closely.",
      "Use a staged position size if the macro backdrop turns choppy.",
    ],
    prediction: "Bullish",
    newsFocus: ["Liquidity", "Earnings", "Policy"],
    outlook: "A constructive trend is likely if the stock holds key support and macro conditions remain stable.",
    source: "demo",
    recommendation: "Outperform",
    recommendationReasons: [
      `${core} combines healthy fundamentals with a favorable sector setup, supporting a constructive risk-reward for new positions.`,
      "Institutional and domestic flows remain net supportive, reducing near-term downside risk.",
      "Valuation is reasonable relative to growth visibility, leaving room for re-rating if execution stays on track.",
    ],
    keyInsights: [
      `${core} is trading with constructive momentum backed by sector tailwinds.`,
      "Earnings visibility remains healthy heading into the next reporting cycle.",
      "Institutional positioning has been net supportive over recent sessions.",
      "Technical structure favors continuation while key support levels hold.",
    ],
    marketTrends: [
      "Broader indices are holding a risk-on tone amid stable domestic liquidity.",
      "Sector rotation continues to favor quality large- and mid-cap names.",
      "Global cues remain a swing factor — watch crude prices, the dollar index, and US bond yields.",
    ],
    companyActions: [
      `${core} management has signaled continued focus on operating efficiency and margin discipline.`,
      "Recent capital allocation and expansion initiatives point to a longer-term growth push.",
      "Leadership commentary highlights investment in innovation and market share defense.",
    ],
    positiveNews: [
      `${core} has drawn positive analyst commentary on execution and growth strategy.`,
      "Sector-wide demand indicators remain encouraging for the next few quarters.",
      "No major regulatory or governance red flags reported in recent coverage.",
    ],
  };
}

function pct(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "not available";
}

// An LLM asked about a stock will happily invent a price or a "up 40% this year" claim. Rather
// than hope it doesn't, the real Yahoo Finance figures are handed to it as the only numbers it
// is allowed to quote — so the narrative it writes is anchored to the same data the cards show.
function buildMarketFacts(performance: PerformanceSummary): string {
  const price =
    typeof performance.price === "number"
      ? `${performance.currency} ${performance.price.toFixed(2)}`
      : "not available";

  return [
    `Verified market data for ${performance.symbol} from Yahoo Finance${performance.asOf ? ` as of ${performance.asOf}` : ""}:`,
    `- Last traded price: ${price}`,
    `- Returns — 1D: ${pct(performance.oneDay)}, 1W: ${pct(performance.oneWeek)}, 1M: ${pct(performance.oneMonth)}, 6M: ${pct(performance.sixMonth)}, 1Y: ${pct(performance.oneYear)}, 3Y: ${pct(performance.threeYear)}, 5Y: ${pct(performance.fiveYear)}, Overall${performance.overallSince ? ` (since ${performance.overallSince})` : ""}: ${pct(performance.overall)}`,
    "Use ONLY these numbers when referring to price or performance. Do not state, estimate, or round any other price, return, target, market cap, or valuation figure. If a figure is marked \"not available\", say so rather than supplying one. Keep every other claim qualitative.",
  ].join("\n");
}

// The LLM call itself takes 15-25s, so an in-memory, server-side cache is the single biggest
// lever for perceived speed: re-opening a report you (or another visitor) already researched
// recently returns instantly instead of re-paying that latency and OpenRouter cost.
const ANALYSIS_CACHE_TTL_MS = 20 * 60_000;
const analysisCache = new Map<string, { data: AnalysisResult; expiresAt: number }>();

export async function generateAnalysis(stockInput: string): Promise<AnalysisResult> {
  const stock = stockInput.trim().toUpperCase();

  const cached = analysisCache.get(stock);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  if (!process.env.OPENROUTER_API_KEY) {
    return buildDemoAnalysis(stock);
  }

  try {
    const performance = await getPerformanceSummary(stock);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are stockers, an AI research assistant for Indian equities and ETFs. Return compact JSON only, with these keys: stock, marketPulse, summary, positiveSignals, negativeSignals, score, risk, nextSteps, prediction, newsFocus, outlook, recommendation, recommendationReasons, keyInsights, marketTrends, companyActions, positiveNews. " +
              "recommendation must be exactly one of \"Outperform\", \"Hold\", or \"Avoid\". recommendationReasons is an array of clear, specific reasons backing that call. keyInsights is an array of short, pointwise takeaways an investor should know right now. marketTrends is an array covering current market news and trend themes relevant to this stock (sector rotation, macro, flows, policy). companyActions is an array describing concrete steps the company/management is taking to perform better (cost cuts, expansion, new products, leadership changes, buybacks, etc). positiveNews is an array of only the genuinely positive news and developments about the company — do not include negatives there. " +
              "Accuracy rule: the user message supplies verified live market data. Every price or performance number you write must be copied from it verbatim. Never invent or estimate prices, returns, price targets, market caps, valuation multiples, or percentages.",
          },
          {
            role: "user",
            content: `${buildMarketFacts(performance)}\n\nAnalyze ${stock} for Indian investors using current market news and trend themes. Give a clear Outperform, Hold, or Avoid recommendation with specific reasons. Cover key insights, positives, negatives, score, risk, next steps, prediction, newsFocus, outlook, current market trends, actions the company is taking to perform better, and a dedicated list of positive news about the company.`,
          },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter responded with ${response.status}`);
    }

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const parsed = text.match(/\{[\s\S]*\}/);

    if (parsed) {
      const result = normalizeAnalysis(JSON.parse(parsed[0]), stock);
      analysisCache.set(stock, { data: result, expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS });
      return result;
    }

    return buildDemoAnalysis(stock);
  } catch (error) {
    console.error(error);
    return buildDemoAnalysis(stock);
  }
}
