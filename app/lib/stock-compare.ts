const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

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

export async function generateComparison(stockAInput: string, stockBInput: string): Promise<ComparisonResult> {
  const stockA = stockAInput.trim().toUpperCase();
  const stockB = stockBInput.trim().toUpperCase();

  if (!process.env.OPENROUTER_API_KEY) {
    return buildDemoComparison(stockA, stockB);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers-compare",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are stockers, an AI research assistant comparing two Indian stocks head-to-head for an investor deciding between them. Return compact JSON only, with these keys: winner, verdict, stockAPros, stockACons, stockBPros, stockBCons, stockAScore, stockBScore. winner must be exactly one of \"A\", \"B\", or \"Tie\". verdict is 1-2 sentences giving a clear, direct comparison call. stockAPros/stockACons/stockBPros/stockBCons are arrays of specific, concrete points. stockAScore and stockBScore are 0-100 overall scores.",
          },
          {
            role: "user",
            content: `Compare ${stockA} (stock A) against ${stockB} (stock B) for an Indian investor choosing between the two. Give a clear winner call with reasons, pros/cons for each, and a score for each.`,
          },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`OpenRouter responded with ${response.status}`);

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const parsed = text.match(/\{[\s\S]*\}/);

    if (parsed) {
      return normalizeComparison(JSON.parse(parsed[0]), stockA, stockB);
    }

    return buildDemoComparison(stockA, stockB);
  } catch (error) {
    console.error(error);
    return buildDemoComparison(stockA, stockB);
  }
}
