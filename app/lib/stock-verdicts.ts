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

// Reads OPENROUTER_API_KEY through `./openrouter`. The `server-only` import makes a client
// component that pulls this in a build error, rather than a key that quietly ships to the browser.
import "server-only";

import { indianStocks, type CapTier } from "./indian-stocks";
import { getPerformanceSummaries, type PerformanceSummary } from "./stock-performance";
import { chatJson, extractJsonObject } from "./openrouter";

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

const STANCE_LABELS: Record<Stance, string> = { Buy: "Outperform", Hold: "Hold", Sell: "Underperform" };

/**
 * Asks the model to narrate the calls that have already been made.
 *
 * It is deliberately not allowed to change a stance: the numbers decide that. Returns an empty
 * list on any failure, which drops every row back to its computed explanation.
 */
async function narrate(rows: { verdict: StockVerdict; summary: PerformanceSummary }[]): Promise<AiRationale[]> {
  const facts = rows
    .map(
      ({ verdict }) =>
        `${verdict.symbol} (${verdict.name}, ${verdict.sector ?? "unclassified"}, ${verdict.capTier ?? "unknown"} cap, call ${STANCE_LABELS[verdict.stance]}): 1W ${percent(verdict.oneWeek)}, 1M ${percent(verdict.oneMonth)}, 6M ${percent(verdict.sixMonth)}, 1Y ${percent(verdict.oneYear)}`,
    )
    .join("\n");

  const rationales = await chatJson({
    feature: "verdicts",
    system:
      'You are stockers, an AI equity analyst writing for Indian investors. For each stock you are given the call that has already been decided from its returns. Write one specific sentence justifying that exact call using those numbers and what you know of the company and its sector. Never contradict the call. Return JSON only: {"rationales":[{"symbol":"SYM","rationale":"..."}]}',
    user: facts,
    temperature: 0.2,
    parse: (text) => {
      const parsed = extractJsonObject(text) as { rationales?: unknown } | null;
      if (!parsed || !Array.isArray(parsed.rationales)) return null;

      const kept = parsed.rationales.flatMap((entry): AiRationale[] => {
        const row = entry as Record<string, unknown>;
        return typeof row?.symbol === "string" && typeof row?.rationale === "string" && row.rationale.trim()
          ? [{ symbol: row.symbol.toUpperCase(), rationale: row.rationale.trim() }]
          : [];
      });

      // An empty list is a reply that narrated nothing, which is a fallback rather than a success:
      // every row drops back to its computed explanation exactly as if the call had failed.
      return kept.length > 0 ? kept : null;
    },
  });

  return rationales ?? [];
}

const VERDICT_TTL_MS = 10 * 60_000;

/**
 * The calls for a list of symbols, scored from their measured returns.
 *
 * This is the whole answer a reader needs: the score, the stance and an explanation drawn from the
 * same numbers. It costs one performance lookup and no model call, and it is what the streaming
 * path sends first.
 */
async function scoreVerdicts(wanted: string[]): Promise<{ verdict: StockVerdict; summary: PerformanceSummary }[]> {
  const summaries = await getPerformanceSummaries(wanted);

  return summaries.map((summary) => {
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
}

/** The scored rows with the model's prose written over whichever of them it returned. */
function withRationales(base: StockVerdict[], rationales: AiRationale[]): StockVerdict[] {
  const bySymbol = new Map(rationales.map((entry) => [entry.symbol, entry.rationale]));

  return base.map((verdict) => {
    const rationale = bySymbol.get(verdict.symbol);
    return rationale ? { ...verdict, rationale, source: "ai" as const } : verdict;
  });
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * One piece of a verdict set, as it becomes available.
 *
 * The panel used to wait on the whole thing — a performance lookup *and* a model call that is
 * allowed twenty-five seconds — before it could draw anything, so a reader watched three pulsing
 * placeholders for the entire round trip. But the model never decides a call: the stance and the
 * score come from the arithmetic, and `explainVerdict` already puts the reasoning into words. So
 * the calls go out the moment they are scored, and the model's prose replaces the computed
 * sentence in place when it lands.
 */
export type VerdictFrame =
  | { type: "verdicts"; verdicts: StockVerdict[] }
  | { type: "rationales"; rationales: AiRationale[] };

/**
 * Finished verdict sets, keyed by the symbols they cover.
 *
 * A plain bounded store rather than one of `./cache`'s loaders, for the same reason board reads use
 * one: the value is assembled by a stream, so there is no single function the cache could re-run to
 * produce it. Bounded because the key is a set of symbols the reader chose, and a crawler walking
 * the exchange would otherwise grow it without limit.
 */
const verdictCache = (() => {
  const CAPACITY = 200;
  const entries = new Map<string, { value: StockVerdict[]; expiresAt: number }>();

  return {
    peek(key: string): StockVerdict[] | null {
      const hit = entries.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return hit.value;
    },
    put(key: string, value: StockVerdict[]): void {
      if (entries.size >= CAPACITY) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: Date.now() + VERDICT_TTL_MS });
    },
    clear(): void {
      entries.clear();
    },
  };
})();

const verdictInflight = new Map<string, Promise<StockVerdict[]>>();

/** Drops every cached verdict set. Called when the AI cache tag is revalidated. */
export function clearStockVerdictCache(): void {
  verdictCache.clear();
  verdictInflight.clear();
}

/** The symbols a caller asked for, de-duplicated and normalised to exchange tickers. */
function wantedFrom(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
}

/**
 * The calls for a list of symbols, frame by frame.
 *
 * A finished set yields in one frame, so a warm read is still a single round trip with no model
 * call at all. Otherwise the scored calls go out as soon as the returns are in and the prose
 * follows. A failed or empty model reply simply never produces a second frame, which leaves the
 * computed explanations standing rather than emptying the panel.
 */
export async function* streamVerdicts(symbols: string[]): AsyncGenerator<VerdictFrame> {
  const wanted = wantedFrom(symbols);
  if (wanted.length === 0) return;

  const key = wanted.join("|");

  const hit = verdictCache.peek(key);
  if (hit) {
    yield { type: "verdicts", verdicts: hit };
    return;
  }

  // Someone else is already paying for this exact set. Waiting on their result costs this reader
  // the remainder of one model call; starting a second would cost the same time and twice the money.
  const running = verdictInflight.get(key);
  if (running) {
    yield { type: "verdicts", verdicts: await running };
    return;
  }

  // The slot is claimed before the first await rather than around the model call alone. A
  // generator suspends at every yield and resumes only when its consumer asks for the next frame,
  // so registering later leaves a window — several microtasks wide, and as wide as the performance
  // lookup in the worst case — in which a second reader sees no in-flight entry and buys the same
  // completion again.
  let settle: (value: StockVerdict[]) => void = () => {};
  verdictInflight.set(key, new Promise<StockVerdict[]>((resolve) => { settle = resolve; }));

  let latest: StockVerdict[] = [];

  try {
    const rows = await scoreVerdicts(wanted);
    latest = rows.map(({ verdict }) => verdict);
    if (latest.length === 0) return;

    yield { type: "verdicts", verdicts: latest };

    // `narrate` swallows its own failures and answers with an empty list, which leaves every row
    // on the sentence built from its own numbers.
    const rationales = await narrate(rows);
    if (rationales.length > 0) latest = withRationales(latest, rationales);
    verdictCache.put(key, latest);

    if (rationales.length > 0) yield { type: "rationales", rationales };
  } finally {
    // Whatever this reader ended with is what anyone waiting on the same symbols gets — including
    // when the stream is abandoned half-written because the reader navigated away mid-request.
    settle(latest);
    verdictInflight.delete(key);
  }
}

/** Outperform / hold / underperform calls for a list of symbols, in the order given. */
export async function verdictsFor(symbols: string[]): Promise<StockVerdict[]> {
  let verdicts: StockVerdict[] = [];
  let rationales: AiRationale[] = [];

  for await (const frame of streamVerdicts(symbols)) {
    if (frame.type === "verdicts") verdicts = frame.verdicts;
    else rationales = frame.rationales;
  }

  return rationales.length > 0 ? withRationales(verdicts, rationales) : verdicts;
}
