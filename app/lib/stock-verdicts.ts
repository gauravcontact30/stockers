// The shared "what should I do with this stock" engine.
//
// Every AI section in the dashboard asks the same question of a list of symbols: given how the
// stock has actually performed, is it outperform, hold or underperform, and why? That question is answered
// once here so the compare tables, the sector showdowns and each section's verdict panel all
// speak with one voice instead of three.
//
// The score is computed from real returns, never invented. When an OpenRouter key is configured
// the model is asked to write the rationale over those same numbers; without one the rationale is
// composed from the numbers directly. Either way the stance comes from the arithmetic, so the
// call a reader sees is always explainable — matching how the market pulse labels itself.

import { indianStocks, type CapTier } from "./indian-stocks";
import { getPerformanceSummaries, type PerformanceSummary } from "./stock-performance";

export type Stance = "Buy" | "Hold" | "Sell";

export type StockVerdict = {
  symbol: string;
  name: string;
  sector: string | null;
  capTier: CapTier | null;
  price: number | null;
  oneDay: number | null;
  oneWeek: number | null;
  oneMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  /** 0-100, from the weighted momentum below. */
  score: number;
  stance: Stance;
  rationale: string;
  source: "ai" | "heuristic";
};

// Weights lean on the medium-term trend: a single day says little about whether to own something,
// while the six-month and one-year lines are what actually separate a leader from a laggard.
const WEIGHTS: { key: keyof Pick<PerformanceSummary, "oneWeek" | "oneMonth" | "sixMonth" | "oneYear">; weight: number }[] = [
  { key: "oneWeek", weight: 0.15 },
  { key: "oneMonth", weight: 0.25 },
  { key: "sixMonth", weight: 0.3 },
  { key: "oneYear", weight: 0.3 },
];

const BUY_ABOVE = 62;
const SELL_BELOW = 42;

/**
 * Turns a spread of period returns into a 0-100 score.
 *
 * 50 is "went nowhere". Each percentage point of weighted return moves the score by 1.5, so a
 * stock compounding ~20% lands near 80 and one down 20% near 20 — a range wide enough to separate
 * peers without letting one wild month peg everything at the extremes.
 */
export function momentumScore(summary: Pick<PerformanceSummary, "oneWeek" | "oneMonth" | "sixMonth" | "oneYear">): number {
  let weighted = 0;
  let covered = 0;

  for (const { key, weight } of WEIGHTS) {
    const value = summary[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    weighted += value * weight;
    covered += weight;
  }

  // A stock with no usable history scores a flat 50 rather than a false conviction either way.
  if (covered === 0) return 50;

  const normalised = weighted / covered;
  return Math.max(0, Math.min(100, Math.round(50 + normalised * 1.5)));
}

export function stanceFor(score: number): Stance {
  if (score >= BUY_ABOVE) return "Buy";
  if (score < SELL_BELOW) return "Sell";
  return "Hold";
}

function percent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no reading";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** The rationale when there is no AI key: the same numbers the score was built from, in words. */
export function explainVerdict(summary: PerformanceSummary, stance: Stance, sector: string | null): string {
  const trend =
    stance === "Buy"
      ? "Momentum is with it"
      : stance === "Sell"
        ? "The trend is against it"
        : "It is holding its ground";

  const where = sector ? ` within ${sector}` : "";
  return `${trend}${where}: ${percent(summary.oneMonth)} over a month, ${percent(summary.sixMonth)} over six months and ${percent(summary.oneYear)} over a year.`;
}

type AiRationale = { symbol: string; rationale: string };

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
const STANCE_LABELS: Record<Stance, string> = { Buy: "Outperform", Hold: "Hold", Sell: "Underperform" };

/**
 * Asks the model to narrate the calls that have already been made.
 *
 * It is deliberately not allowed to change a stance: the numbers decide that. Returns an empty
 * list on any failure, which drops every row back to its computed explanation.
 */
async function narrate(rows: { verdict: StockVerdict; summary: PerformanceSummary }[]): Promise<AiRationale[]> {
  if (!process.env.OPENROUTER_API_KEY) return [];

  const facts = rows
    .map(
      ({ verdict }) =>
        `${verdict.symbol} (${verdict.name}, ${verdict.sector ?? "unclassified"}, ${verdict.capTier ?? "unknown"} cap, call ${STANCE_LABELS[verdict.stance]}): 1W ${percent(verdict.oneWeek)}, 1M ${percent(verdict.oneMonth)}, 6M ${percent(verdict.sixMonth)}, 1Y ${percent(verdict.oneYear)}`,
    )
    .join("\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers-verdicts",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              'You are stockers, an AI equity analyst writing for Indian investors. For each stock you are given the call that has already been decided from its returns. Write one specific sentence justifying that exact call using those numbers and what you know of the company and its sector. Never contradict the call. Return JSON only: {"rationales":[{"symbol":"SYM","rationale":"..."}]}',
          },
          { role: "user", content: facts },
        ],
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`OpenRouter responded with ${response.status}`);

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]) as { rationales?: unknown };
    if (!Array.isArray(parsed.rationales)) return [];

    return parsed.rationales.flatMap((entry) => {
      const row = entry as Record<string, unknown>;
      return typeof row.symbol === "string" && typeof row.rationale === "string" && row.rationale.trim()
        ? [{ symbol: row.symbol.toUpperCase(), rationale: row.rationale.trim() }]
        : [];
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

const VERDICT_TTL_MS = 10 * 60_000;
const verdictCache = new Map<string, { value: StockVerdict[]; expiresAt: number }>();
const verdictInflight = new Map<string, Promise<StockVerdict[]>>();

export function clearStockVerdictCache(): void {
  verdictCache.clear();
  verdictInflight.clear();
}

/** Outperform / hold / underperform calls for a list of symbols, in the order given. */
export async function verdictsFor(symbols: string[]): Promise<StockVerdict[]> {
  const wanted = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (wanted.length === 0) return [];

  const cacheKey = wanted.join("|");
  const hit = verdictCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const running = verdictInflight.get(cacheKey);
  if (running) return running;

  const promise = computeVerdicts(wanted).then((value) => {
    verdictCache.set(cacheKey, { value, expiresAt: Date.now() + VERDICT_TTL_MS });
    return value;
  }).finally(() => {
    verdictInflight.delete(cacheKey);
  });

  verdictInflight.set(cacheKey, promise);
  return promise;
}

async function computeVerdicts(wanted: string[]): Promise<StockVerdict[]> {
  const summaries = await getPerformanceSummaries(wanted);

  const rows = summaries.map((summary) => {
    const meta = indianStocks.find((stock) => stock.symbol === summary.symbol);
    const score = momentumScore(summary);
    const stance = stanceFor(score);
    const sector = meta?.sector ?? null;

    const verdict: StockVerdict = {
      symbol: summary.symbol,
      name: summary.name ?? meta?.name ?? summary.symbol,
      sector,
      capTier: summary.capTier ?? meta?.capTier ?? null,
      price: summary.price,
      oneDay: summary.oneDay,
      oneWeek: summary.oneWeek,
      oneMonth: summary.oneMonth,
      sixMonth: summary.sixMonth,
      oneYear: summary.oneYear,
      score,
      stance,
      rationale: explainVerdict(summary, stance, sector),
      source: "heuristic",
    };

    return { verdict, summary };
  });

  const rationales = await narrate(rows);
  const bySymbol = new Map(rationales.map((entry) => [entry.symbol, entry.rationale]));

  return rows.map(({ verdict }) => {
    const rationale = bySymbol.get(verdict.symbol);
    return rationale ? { ...verdict, rationale, source: "ai" as const } : verdict;
  });
}
