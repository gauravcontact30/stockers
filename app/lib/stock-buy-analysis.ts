// "Is this the stock to buy, and what else should I be looking at instead?"
//
// The landing page's Stock Analysis section asks that of any of the ~4,950 scrips listed on the
// BSE, and answers it in two halves: a verdict on the searched company, and the ten names that
// scored better than it on the same measurements.
//
// The split of work follows ./stock-verdicts, and for the same reason: the call comes from the
// arithmetic, never from the model. Momentum is scored from measured returns, the Buy / Hold /
// Avoid stance falls out of that score, and the ten alternatives are whichever peers scored
// highest - all of it decided before an LLM is asked anything. The model is then handed those
// figures and those calls and asked only to write them up. It cannot promote a stock into the
// ten, cannot flip a verdict, and is forbidden from quoting a number it was not given. With no
// OPENROUTER_API_KEY configured the same report is composed from the numbers directly, so the
// section degrades to plainer prose rather than to nothing.
//
// Reads OPENROUTER_API_KEY through ./openrouter. The `server-only` import makes a client component
// that pulls this in a build error, rather than a key that quietly ships to the browser.
import "server-only";

import { findBseTapeRow, getBseTape, getBseUniverse, type BseTape, type BseUniverse } from "./bse-market";
import { CACHE_TAGS, revalidatingBy } from "./cache";
import { stockIcon } from "./company-logos";
import { indianStocks, type StockMeta } from "./indian-stocks";
import { mapWithConcurrency } from "./market-data";
import { chatJson, extractJsonObject } from "./openrouter";
import { getCachedPerformanceSummary, type PerformanceSummary } from "./stock-performance";
import { findStock, type SearchHit } from "./stock-search";
import { momentumScore, stanceFor } from "./stock-verdicts";

/**
 * The stance, in the words this section is asking in.
 *
 * ./stock-verdicts scores a stock as Buy / Hold / Sell, which is the right vocabulary for a desk
 * reviewing positions it already holds. The reader here holds nothing - they typed a ticker to ask
 * whether to start - and "Sell" is not an answer to that question. Same arithmetic, relabelled.
 */
export type BuyCall = "Buy" | "Hold" | "Avoid";

/** Everything the exchange and the quote feed say one company is worth right now. */
export type MarketValue = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string | null;
  logo: string | null;
  currency: string;
  /** Last traded price - the market value the whole verdict is measured against. */
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  volume: number | null;
  turnoverCr: number | null;
  marketCapCr: number | null;
  /** Rank by market capitalisation across the whole exchange, 1 = largest. */
  marketCapRank: number | null;
  oneWeek: number | null;
  oneMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  threeYear: number | null;
};

/** A company with the call already decided from its returns. */
export type ScoredStock = MarketValue & {
  /** 0-100 weighted momentum, from ./stock-verdicts. 50 is "went nowhere". */
  score: number;
  call: BuyCall;
};

/** The left half of the section: the company the reader actually asked about. */
export type SearchedStockAnalysis = ScoredStock & {
  headline: string;
  summary: string;
  strengths: string[];
  risks: string[];
};

/** One of the right half's ten: a name that scored better, and why that matters. */
export type AlternativePick = ScoredStock & {
  /** 1-10, best first. */
  rank: number;
  /** What this name does better than the stock that was searched for. */
  edge: string;
};

export type StockBuyReport = {
  stock: SearchedStockAnalysis;
  alternatives: AlternativePick[];
  /** What the ten were drawn from - the searched stock's sector, or the exchange's leaders. */
  drawnFrom: string;
  /** The BSE session the exchange-side figures are from, as YYYY-MM-DD. */
  sessionDate: string | null;
  generatedAt: string;
  /** Whether the prose was written by the model or composed from the numbers. */
  source: "ai" | "measured";
};

/** How many peers are scored before the best ten are taken. Twice the shortlist, so it is a choice. */
const CANDIDATE_POOL = 20;
export const ALTERNATIVE_COUNT = 10;
/** Six symbols at a time: the same ceiling ./stock-performance uses for its own history fan-out. */
const SCORE_CONCURRENCY = 6;

const CALL_FOR_STANCE: Record<ReturnType<typeof stanceFor>, BuyCall> = {
  Buy: "Buy",
  Hold: "Hold",
  Sell: "Avoid",
};

export function callFor(score: number): BuyCall {
  return CALL_FOR_STANCE[stanceFor(score)];
}

function percent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no reading";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function rupees(value: number | null, currency: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `${currency} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function crore(value: number): string {
  return `${Math.round(value).toLocaleString("en-IN")} Cr`;
}

/**
 * One company's market value, joined from both feeds this app already keeps warm.
 *
 * The BSE Bhavcopy carries every listed scrip - day range, volume, turnover - and the scrip master
 * carries market capitalisation and the exchange-wide rank. Neither carries a return over any
 * window, so the periods come from the quote feed's performance summary. A company the quote feed
 * cannot resolve (most BSE-only small caps have no NSE line) still gets a full exchange-side row
 * with its return fields left null, which every consumer below renders as "no reading" rather than
 * as a zero.
 */
function marketValueFor(
  hit: SearchHit,
  performance: PerformanceSummary | null,
  tape: BseTape | null,
  universe: BseUniverse | null,
): MarketValue {
  const tapeRow = findBseTapeRow(tape, [hit.scripCode, hit.symbol]);
  const scrip = hit.scripCode ? (universe?.byCode.get(hit.scripCode) ?? null) : null;
  const meta = indianStocks.find((stock) => stock.symbol === hit.symbol);

  return {
    symbol: hit.symbol,
    name: hit.name,
    sector: hit.sector,
    capTier: hit.capTier ?? scrip?.capTier ?? null,
    logo: stockIcon(hit.symbol, meta?.domain),
    currency: performance?.currency ?? "INR",
    // The live quote leads where there is one; the settlement tape is the floor, so a scrip the
    // quote feed does not carry still shows a real price rather than a dash.
    price: performance?.price ?? tapeRow?.quote.price ?? null,
    previousClose: performance?.previousClose ?? tapeRow?.quote.previousClose ?? null,
    changePercent: performance?.oneDay ?? tapeRow?.quote.changePercent ?? null,
    dayLow: tapeRow?.quote.dayLow ?? null,
    dayHigh: tapeRow?.quote.dayHigh ?? null,
    volume: tapeRow?.quote.volume ?? null,
    turnoverCr: tapeRow?.quote.turnoverCr ?? null,
    marketCapCr: scrip?.marketCapCr ?? null,
    marketCapRank: scrip?.rank ?? null,
    oneWeek: performance?.oneWeek ?? null,
    oneMonth: performance?.oneMonth ?? null,
    sixMonth: performance?.sixMonth ?? null,
    oneYear: performance?.oneYear ?? null,
    threeYear: performance?.threeYear ?? null,
  };
}

function scored(value: MarketValue): ScoredStock {
  const score = momentumScore(value);
  return { ...value, score, call: callFor(score) };
}

/**
 * A performance summary, or null when the quote feed cannot answer for this symbol.
 *
 * Guarded per symbol rather than around the whole fan-out: one unresolvable BSE-only scrip in a
 * pool of fourteen should cost that scrip its return fields, not cost the reader the section.
 */
async function performanceOrNull(symbol: string): Promise<PerformanceSummary | null> {
  try {
    return await getCachedPerformanceSummary(symbol);
  } catch (error) {
    console.error(`stock-buy-analysis(${symbol}):`, error);
    return null;
  }
}

/**
 * The pool the five alternatives are chosen from.
 *
 * Deliberately drawn from `indianStocks` - the hand-classified companies - rather than from the
 * whole exchange. Two reasons, and they point the same way. The catalogue entries carry a checked
 * quote-feed symbol, so their returns actually resolve and the ranking is a ranking rather than a
 * list of nulls; and a reader asking "what should I buy instead" is owed liquid, followable names,
 * not whichever dormant small cap happens to have doubled off a low base.
 *
 * Same sector first, because "instead of this one" means a company that does the same job. A thin
 * sector is topped up with the exchange's largest names so the panel always has ten to rank.
 */
export function candidatesFor(hit: SearchHit, rankOf: (symbol: string) => number | null): StockMeta[] {
  const isSelf = (stock: StockMeta) => stock.symbol === hit.symbol;
  const byRank = (a: StockMeta, b: StockMeta) => (rankOf(a.symbol) ?? Infinity) - (rankOf(b.symbol) ?? Infinity);

  const peers = indianStocks.filter((stock) => stock.sector === hit.sector && !isSelf(stock)).sort(byRank);
  if (peers.length >= CANDIDATE_POOL) return peers.slice(0, CANDIDATE_POOL);

  const held = new Set(peers.map((stock) => stock.symbol));
  const topUp = indianStocks
    .filter((stock) => !isSelf(stock) && !held.has(stock.symbol) && stock.capTier === "Large")
    .sort(byRank)
    .slice(0, CANDIDATE_POOL - peers.length);

  return [...peers, ...topUp];
}

/** What the reader is told the ten were drawn from. */
export function drawnFromFor(hit: SearchHit): string {
  const peers = indianStocks.filter((stock) => stock.sector === hit.sector && stock.symbol !== hit.symbol);
  return peers.length >= ALTERNATIVE_COUNT ? hit.sector : "the exchange's large-cap leaders";
}

// ---------------------------------------------------------------------------
// The composed report - what this returns with no model behind it
// ---------------------------------------------------------------------------

const CALL_OPENING: Record<BuyCall, string> = {
  Buy: "The measurements back a buy",
  Hold: "The measurements say wait",
  Avoid: "The measurements argue against buying",
};

export function composeSummary(stock: ScoredStock): string {
  return `${CALL_OPENING[stock.call]}. ${stock.name} scores ${stock.score} out of 100 on weighted momentum, where 50 is a stock that went nowhere - built from ${percent(stock.oneWeek)} over a week, ${percent(stock.oneMonth)} over a month, ${percent(stock.sixMonth)} over six months and ${percent(stock.oneYear)} over a year.`;
}

/**
 * The strengths and risks, split by which way each measured window actually points.
 *
 * A window with no reading is left out of both lists rather than being counted as flat, and each
 * list is guaranteed one honest line so neither column can render empty.
 */
export function composeSignals(stock: ScoredStock): { strengths: string[]; risks: string[] } {
  const windows: { label: string; value: number | null }[] = [
    { label: "over the past week", value: stock.oneWeek },
    { label: "over the past month", value: stock.oneMonth },
    { label: "over six months", value: stock.sixMonth },
    { label: "over the past year", value: stock.oneYear },
    { label: "over three years", value: stock.threeYear },
  ];

  const strengths: string[] = [];
  const risks: string[] = [];

  for (const { label, value } of windows) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value >= 0) strengths.push(`Up ${percent(value)} ${label}.`);
    else risks.push(`Down ${percent(value)} ${label}.`);
  }

  if (typeof stock.turnoverCr === "number") {
    strengths.push(`Turned over ${stock.turnoverCr.toFixed(1)} Cr in the session, so a position can be built and exited.`);
  }
  if (stock.capTier === "Small") {
    risks.push("A small-cap listing: thinner books and sharper drawdowns than a large-cap alternative.");
  }

  if (strengths.length === 0) strengths.push("No measured window is positive right now, which is itself the finding.");
  if (risks.length === 0) risks.push("Nothing in the measured windows is negative - the risk is paying up after the run.");

  return { strengths, risks };
}

export function composeEdge(pick: ScoredStock, searched: ScoredStock): string {
  const gap = pick.score - searched.score;
  return `Scores ${pick.score} against ${searched.symbol}'s ${searched.score}, ${gap} point${gap === 1 ? "" : "s"} better on the same weighted windows.`;
}


// ---------------------------------------------------------------------------
// The model's pass over those numbers
// ---------------------------------------------------------------------------

type Narrative = {
  headline: string;
  summary: string;
  strengths: string[];
  risks: string[];
  alternatives: { symbol: string; edge: string }[];
};

function sentence(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function sentences(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(sentence).filter(Boolean).slice(0, max);
}

/** The model's reply, reduced to the fields this section renders. Anything else is dropped. */
export function readNarrative(raw: unknown): Narrative | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;

  const alternatives = Array.isArray(candidate.alternatives)
    ? candidate.alternatives.flatMap((entry): Narrative["alternatives"] => {
        const row = entry as Record<string, unknown> | null;
        const symbol = sentence(row?.symbol).toUpperCase();
        return symbol ? [{ symbol, edge: sentence(row?.edge) }] : [];
      })
    : [];

  const narrative: Narrative = {
    headline: sentence(candidate.headline),
    summary: sentence(candidate.summary),
    strengths: sentences(candidate.strengths, 3),
    risks: sentences(candidate.risks, 3),
    alternatives,
  };

  // A reply that wrote no prose at all is a failure with the same consequence as a timeout: every
  // field would fall back anyway, and recording it as a success would hide that from the AI
  // dashboard. See the `unusable` outcome in ./openrouter.
  return narrative.summary || narrative.headline ? narrative : null;
}

const CALL_INSTRUCTION: Record<BuyCall, string> = {
  Buy: "the measurements support buying it",
  Hold: "the measurements say hold off rather than buy now",
  Avoid: "the measurements argue against buying it",
};

function factsFor(stock: ScoredStock): string {
  return [
    `${stock.symbol} (${stock.name}, ${stock.sector}, ${stock.capTier ?? "unclassified"} cap)`,
    `  price ${rupees(stock.price, stock.currency)}, previous close ${rupees(stock.previousClose, stock.currency)}, today ${percent(stock.changePercent)}`,
    `  returns - 1W ${percent(stock.oneWeek)}, 1M ${percent(stock.oneMonth)}, 6M ${percent(stock.sixMonth)}, 1Y ${percent(stock.oneYear)}, 3Y ${percent(stock.threeYear)}`,
    `  momentum score ${stock.score}/100, decided call ${stock.call}`,
    typeof stock.marketCapCr === "number"
      ? `  market cap ${crore(stock.marketCapCr)}, exchange rank #${stock.marketCapRank ?? "unranked"}`
      : "  market cap not available",
  ].join("\n");
}

async function narrate(stock: ScoredStock, alternatives: ScoredStock[]): Promise<Narrative | null> {
  const user = [
    "SEARCHED STOCK - the reader asked whether to buy this one:",
    factsFor(stock),
    "",
    `HIGHER-SCORING ALTERNATIVES in ${stock.sector}, already chosen and ranked by the same measurements:`,
    alternatives.map(factsFor).join("\n"),
    "",
    `Write the report. The call on ${stock.symbol} is ${stock.call} - ${CALL_INSTRUCTION[stock.call]} - and you must argue for that call, not against it.`,
  ].join("\n");

  return chatJson({
    feature: "stock-buy-analysis",
    system:
      "You are stockers, an AI equity analyst writing for Indian retail investors deciding whether to buy a BSE-listed stock. " +
      "Return JSON only, with these keys: headline, summary, strengths, risks, alternatives. " +
      "headline is one short line stating the verdict. summary is two sentences explaining it. strengths and risks are arrays of exactly 3 short, specific points each. " +
      'alternatives is an array with one entry per stock supplied to you: {"symbol":"SYM","edge":"one sentence on what it does better than the searched stock"}. ' +
      "Rules you may not break: the Buy/Hold/Avoid call for each stock has already been decided from its measured returns - never contradict one, and never re-rank the alternatives. " +
      'Every price, percentage, score, market cap and rank you write must be copied verbatim from the figures below. Never invent or estimate a price target, valuation multiple, earnings figure or percentage. Where a figure reads "no reading" or "not available", say so rather than supplying one. Keep every other claim qualitative.',
    user,
    temperature: 0.2,
    parse: (text) => readNarrative(extractJsonObject(text)),
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Thrown when the ticker is not on the exchange; the route answers 404 with the message. */
export class UnknownStockError extends Error {}

async function buildReport(symbolInput: string): Promise<StockBuyReport> {
  const hit = findStock(symbolInput);
  if (!hit) throw new UnknownStockError(`No BSE-listed company matches "${symbolInput.trim()}".`);

  // The exchange feeds are network fetches behind caches of their own, and a section is more useful
  // with returns and no day range than not at all - so neither one failing takes the report down.
  const [tape, universe] = await Promise.all([
    getBseTape().catch(() => null),
    getBseUniverse().catch(() => null),
  ]);

  const rankOf = (symbol: string) => {
    const code = findStock(symbol)?.scripCode;
    return code ? (universe?.byCode.get(code)?.rank ?? null) : null;
  };

  const candidates = candidatesFor(hit, rankOf);
  const performances = await mapWithConcurrency(
    [hit.symbol, ...candidates.map((stock) => stock.symbol)],
    SCORE_CONCURRENCY,
    performanceOrNull,
  );

  const searched = scored(marketValueFor(hit, performances[0], tape, universe));

  const ranked = candidates
    .map((candidate, index) => {
      // Every catalogue entry is in the search index by construction, so the fallback is for the
      // type rather than for a case that happens: it costs a candidate its scrip code, not the row.
      const candidateHit: SearchHit = findStock(candidate.symbol) ?? {
        symbol: candidate.symbol,
        name: candidate.name,
        sector: candidate.sector,
        capTier: candidate.capTier,
        scripCode: "",
        curated: true,
      };
      return scored(marketValueFor(candidateHit, performances[index + 1], tape, universe));
    })
    // Best momentum first, with the larger company ahead on a tie: between two names scoring the
    // same, the one the exchange ranks higher is the safer thing to point a reader at.
    .sort((a, b) => b.score - a.score || (a.marketCapRank ?? Infinity) - (b.marketCapRank ?? Infinity))
    .slice(0, ALTERNATIVE_COUNT);

  const narrative = await narrate(searched, ranked);
  const prose = narrative?.alternatives ?? [];
  const composed = composeSignals(searched);

  const alternatives: AlternativePick[] = ranked.map((pick, index) => {
    const written = prose.find((entry) => entry.symbol === pick.symbol);
    return {
      ...pick,
      rank: index + 1,
      edge: written?.edge || composeEdge(pick, searched),
    };
  });

  return {
    stock: {
      ...searched,
      headline: narrative?.headline || `${searched.call} - ${searched.name} scores ${searched.score}/100`,
      summary: narrative?.summary || composeSummary(searched),
      strengths: narrative?.strengths.length ? narrative.strengths : composed.strengths,
      risks: narrative?.risks.length ? narrative.risks : composed.risks,
    },
    alternatives,
    drawnFrom: drawnFromFor(hit),
    sessionDate: tape?.sessionDate ?? null,
    generatedAt: new Date().toISOString(),
    source: narrative ? "ai" : "measured",
  };
}

/**
 * The report for one ticker, held for ten minutes.
 *
 * A report costs twenty-one performance lookups and a model call, and the section is on the landing
 * page - where the popular tickers are typed over and over by different readers. Caching by symbol
 * turns the second and every subsequent ask into a map read, which is the difference between the
 * panel opening instantly and paying twenty seconds again. Tagged `ai` so the admin's cache purge
 * drops these along with every other model-written payload.
 */
export const getStockBuyReport = revalidatingBy<string, StockBuyReport>({
  key: "ai:stock-buy-analysis",
  ttlMs: 10 * 60_000,
  maxStaleMs: 30 * 60_000,
  tags: [CACHE_TAGS.ai],
  capacity: 300,
  keyOf: (symbol) => symbol.trim().toUpperCase(),
  load: buildReport,
});
