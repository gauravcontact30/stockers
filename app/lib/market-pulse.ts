import { CACHE_TAGS, revalidating } from "./cache";
import { indianStocks, type CapTier } from "./indian-stocks";
import { getAllQuotes, type LiveQuote } from "./market-data";
import { getBenchmarkIndices, type IndexQuote } from "./market-indices";
import { appOrigin } from "./app-origin";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
// Market breadth shifts through the trading session, so this is cached far shorter than the
// once-a-day disk caches used elsewhere (predictions, returns) — an in-memory TTL is enough.
const CACHE_TTL_MS = 15 * 60 * 1000;

export type Mood = "Risk-On" | "Neutral" | "Risk-Off";

export type Mover = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  price: number | null;
  changePercent: number;
};

/** Top gainers and losers within a single market-cap tier, best/worst first. */
export type CapMovers = { gainers: Mover[]; losers: Mover[]; tracked: number };

export const CAP_TIERS: CapTier[] = ["Large", "Mid", "Small"];
const MOVERS_PER_LIST = 5;

export type MarketBreadth = {
  totalTracked: number;
  advancing: number;
  declining: number;
  unchanged: number;
  averageChangePercent: number;
  topSector: { name: string; averageChangePercent: number } | null;
  bottomSector: { name: string; averageChangePercent: number } | null;
  topGainer: { symbol: string; name: string; changePercent: number } | null;
  topLoser: { symbol: string; name: string; changePercent: number } | null;
  movers: Record<CapTier, CapMovers>;
};

export type MarketPulse = {
  breadth: MarketBreadth;
  /** NIFTY 50, SENSEX and Bank NIFTY levels, as of the same moment as the breadth above. */
  indices: IndexQuote[];
  mood: Mood;
  summary: string;
  themes: string[];
  sectorsToWatch: string[];
  generatedAt: string;
  source: "ai" | "heuristic";
  /**
   * True while the composed narrative is standing in for one the model is still writing.
   *
   * Without this the card cannot tell the two reasons for a composed read apart, and would label a
   * read that is seconds from arriving as "no AI key configured" — which is simply untrue.
   */
  narrativePending: boolean;
  /** Most recent trade timestamp across the tracked universe; lets the client tell a trading day from an exchange holiday. */
  lastTradeAt: string | null;
  /** When the breadth numbers below were computed — distinct from the narrative's generatedAt. */
  breadthAsOf: string;
};

// The narrative is cached far longer than the tape it describes: it costs a model call and reads
// the same either way a few minutes later, while breadth moves through the session. Both are held
// now — the tape for a minute, the narrative for fifteen — and both are served while their
// replacement is fetched, so neither ever makes a reader wait. The index tiles on the card have
// their own live poller on top of this, so the headline levels stay to the second.
type Narrative = { summary: string; themes: string[]; sectorsToWatch: string[]; generatedAt: string; source: "ai" | "heuristic" };

// The narrative was the single slowest thing this application did: 7756ms measured cold against
// the production build, all of it a model call, and paid again by whichever visitor happened to
// land first after the window lapsed. Under the shared cache the lapsed narrative is served
// straight away and a new one is written behind the reader, so that cost is paid once.
const loadNarrative = revalidating<Narrative>({
  key: "pulse:narrative",
  ttlMs: CACHE_TTL_MS,
  tags: [CACHE_TAGS.ai],
  persist: true,
  load: async () => {
    // Breadth is recomputed here rather than passed in, so a background refresh narrates the market
    // as it stands at the moment it runs rather than as it stood for whichever reader triggered it.
    // `getAllQuotes` is itself cached, so this costs nothing beyond the model call.
    const breadth = computeBreadth(await getAllQuotes());
    return (await generateNarrativeWithAI(breadth)) ?? buildHeuristicNarrative(breadth);
  },
});

// Ranked within each cap tier rather than across the whole universe, because a small cap's 8%
// day and a large cap's 3% day are not comparable — pooling them would let small caps crowd out
// every list.
function computeMovers(entries: Mover[]): Record<CapTier, CapMovers> {
  const byTier = {} as Record<CapTier, CapMovers>;

  for (const tier of CAP_TIERS) {
    const tierEntries = entries.filter((entry) => entry.capTier === tier);
    const ranked = [...tierEntries].sort((a, b) => b.changePercent - a.changePercent);

    byTier[tier] = {
      tracked: tierEntries.length,
      // Only genuine movers make a list: a flat or falling stock is never shown as a "gainer".
      gainers: ranked.filter((entry) => entry.changePercent > 0).slice(0, MOVERS_PER_LIST),
      losers: ranked
        .filter((entry) => entry.changePercent < 0)
        .slice(-MOVERS_PER_LIST)
        .reverse(),
    };
  }

  return byTier;
}

function computeBreadth(quotes: { symbol: string; changePercent: number | null; price?: number | null }[]): MarketBreadth {
  const stockMap = new Map(indianStocks.map((stock) => [stock.symbol, stock]));
  const live = quotes.filter((q) => typeof q.changePercent === "number");
  const moverEntries: Mover[] = [];

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let changeSum = 0;
  const sectorTotals = new Map<string, { sum: number; count: number }>();
  let topGainer: MarketBreadth["topGainer"] = null;
  let topLoser: MarketBreadth["topLoser"] = null;

  for (const quote of live) {
    const pct = quote.changePercent as number;
    const stock = stockMap.get(quote.symbol);
    changeSum += pct;
    if (pct > 0) advancing++;
    else if (pct < 0) declining++;
    else unchanged++;

    if (stock) {
      const bucket = sectorTotals.get(stock.sector) ?? { sum: 0, count: 0 };
      bucket.sum += pct;
      bucket.count += 1;
      sectorTotals.set(stock.sector, bucket);

      if (!topGainer || pct > topGainer.changePercent) topGainer = { symbol: stock.symbol, name: stock.name, changePercent: pct };
      if (!topLoser || pct < topLoser.changePercent) topLoser = { symbol: stock.symbol, name: stock.name, changePercent: pct };

      moverEntries.push({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        capTier: stock.capTier,
        price: quote.price ?? null,
        changePercent: pct,
      });
    }
  }

  const sectorAverages = Array.from(sectorTotals.entries()).map(([name, { sum, count }]) => ({
    name,
    averageChangePercent: sum / count,
  }));
  sectorAverages.sort((a, b) => b.averageChangePercent - a.averageChangePercent);

  return {
    totalTracked: live.length,
    advancing,
    declining,
    unchanged,
    averageChangePercent: live.length > 0 ? changeSum / live.length : 0,
    topSector: sectorAverages[0] ?? null,
    bottomSector: sectorAverages[sectorAverages.length - 1] ?? null,
    topGainer,
    topLoser,
    movers: computeMovers(moverEntries),
  };
}

function moodFromBreadth(breadth: MarketBreadth): Mood {
  const decisive = breadth.advancing + breadth.declining;
  if (decisive === 0) return "Neutral";
  const advanceRatio = breadth.advancing / decisive;
  if (advanceRatio >= 0.55) return "Risk-On";
  if (advanceRatio <= 0.45) return "Risk-Off";
  return "Neutral";
}

function buildHeuristicNarrative(breadth: MarketBreadth): Narrative {
  const mood = moodFromBreadth(breadth);
  const direction = breadth.averageChangePercent >= 0 ? "higher" : "lower";

  // Deliberately number-free, for the same reason the AI prompt is: the live counts render
  // beside this sentence and keep updating, while the sentence itself is cached for minutes.
  const spread =
    breadth.advancing > breadth.declining
      ? "Advancers are outnumbering decliners"
      : breadth.declining > breadth.advancing
        ? "Decliners are outnumbering advancers"
        : "Advancers and decliners are evenly matched";

  const summary =
    `${spread} across the tracked universe, with the average stock drifting ${direction}.` +
    (breadth.topSector ? ` ${breadth.topSector.name} is leading the tape.` : "") +
    (breadth.bottomSector && breadth.bottomSector.name !== breadth.topSector?.name ? ` ${breadth.bottomSector.name} is lagging.` : "");

  const themes = [
    breadth.topSector ? `${breadth.topSector.name} strength` : "Sector rotation",
    breadth.bottomSector ? `${breadth.bottomSector.name} weakness` : "Mixed breadth",
    mood === "Risk-On" ? "Broad-based accumulation" : mood === "Risk-Off" ? "Broad-based selling" : "Range-bound trading",
  ];

  const sectorsToWatch = [breadth.topSector?.name, breadth.bottomSector?.name].filter((s): s is string => Boolean(s));

  return {
    summary,
    themes,
    sectorsToWatch,
    generatedAt: new Date().toISOString(),
    source: "heuristic",
  };
}

async function generateNarrativeWithAI(breadth: MarketBreadth): Promise<Narrative | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appOrigin(),
        "X-Title": "stockers-market-pulse",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are stockers, an AI market-breadth analyst for Indian equities. You are given real, computed breadth statistics (advancers/decliners, average move, leading/lagging sectors) from a live universe of Indian stocks — not the full market. Return compact JSON only, with these keys: mood, summary, themes, sectorsToWatch. mood must be exactly one of \"Risk-On\", \"Neutral\", or \"Risk-Off\", consistent with the advance/decline data given. summary is 2-3 sentences on today's mood grounded in the data provided. themes is an array of 3 short (2-5 word) theme labels. sectorsToWatch is an array of 2-3 sector names to watch, drawn from the data given. " +
              // The live counts and averages are rendered beside this text and keep ticking, while
              // the narrative is cached for minutes. If the model quotes a figure it will visibly
              // disagree with the tiles next to it, so it is told to stay qualitative and name
              // sectors and stocks instead.
              "IMPORTANT: write the summary qualitatively. Do not state any counts, percentages, or numeric figures — the live numbers are displayed alongside your text and would contradict you. Refer to breadth in words (\"advancers comfortably outnumber decliners\") and name the leading and lagging sectors and stocks instead.",
          },
          {
            role: "user",
            // Only the aggregate figures go to the model — the per-tier mover lists are rendered
            // straight from the quote feed and would just inflate the prompt.
            content: `Real breadth data from our tracked Indian stock universe: ${JSON.stringify({
              totalTracked: breadth.totalTracked,
              advancing: breadth.advancing,
              declining: breadth.declining,
              unchanged: breadth.unchanged,
              averageChangePercent: breadth.averageChangePercent,
              topSector: breadth.topSector,
              bottomSector: breadth.bottomSector,
              topGainer: breadth.topGainer,
              topLoser: breadth.topLoser,
            })}. Write today's market pulse from this data.`,
          },
        ],
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const fallback = buildHeuristicNarrative(breadth);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary : fallback.summary;
    const themes = Array.isArray(parsed.themes) ? parsed.themes.filter((t: unknown) => typeof t === "string") : [];
    const sectorsToWatch = Array.isArray(parsed.sectorsToWatch) ? parsed.sectorsToWatch.filter((t: unknown) => typeof t === "string") : [];

    return {
      summary,
      themes: themes.length > 0 ? themes : fallback.themes,
      sectorsToWatch: sectorsToWatch.length > 0 ? sectorsToWatch : fallback.sectorsToWatch,
      generatedAt: new Date().toISOString(),
      source: "ai",
    };
  } catch {
    return null;
  }
}

function latestTradeAt(quotes: { asOf: string | null }[]): string | null {
  let latest: string | null = null;
  for (const quote of quotes) {
    if (quote.asOf && (latest === null || quote.asOf > latest)) latest = quote.asOf;
  }
  return latest;
}

/**
 * The whole tape behind this board: every tracked constituent, plus the three benchmarks.
 *
 * Breadth is measured across roughly 270 names, and a cold pass over them is 270 upstream quote
 * requests — a little over five seconds, measured. The per-symbol cache underneath already holds
 * each quote for a minute, but it blocks on expiry, so once a minute somebody paid the whole cost
 * again. Held here instead, an expired tape is handed over as it stands and refetched behind the
 * reader.
 *
 * The fetch time travels with it because the board publishes when its breadth was measured. Serving
 * a tape from fifty seconds ago is fine; stamping it "now" is not.
 */
const loadTape = revalidating<{ quotes: LiveQuote[]; indices: IndexQuote[]; at: string }>({
  key: "pulse:tape",
  ttlMs: 60_000,
  tags: [CACHE_TAGS.nse],
  load: async () => {
    // Fetched together so the index levels and the constituent breadth describe the same instant.
    const [quotes, indices] = await Promise.all([getAllQuotes(), getBenchmarkIndices()]);
    return { quotes, indices, at: new Date().toISOString() };
  },
});

export async function getMarketPulse(): Promise<MarketPulse> {
  const tape = await loadTape();
  const { quotes, indices } = tape;
  const breadth = computeBreadth(quotes);

  /**
   * The model does not get to hold up the board.
   *
   * Everything else here is exchange data and resolves in milliseconds; the written narrative is a
   * model call that measured 7.6 seconds cold against the production build, and awaiting it meant
   * the reader saw nothing at all for that whole time — not even the index levels and breadth that
   * were already in hand.
   *
   * So when nothing has been written yet, the composed narrative goes out immediately and the model
   * runs behind the reader. The card polls, so the model's version replaces it in place a few
   * seconds later, and `narrativePending` lets the card say which of the two it is showing rather
   * than labelling a not-yet-finished read as "no AI key configured".
   */
  const held = loadNarrative.peek();
  if (!held) void loadNarrative().catch(() => undefined);

  const narrative = held?.value ?? buildHeuristicNarrative(breadth);

  return {
    breadth,
    indices,
    narrativePending: !held && Boolean(process.env.OPENROUTER_API_KEY),
    // Always derived from the breadth being displayed, never taken from the model, so the mood
    // badge can never contradict the advance/decline numbers rendered beside it.
    mood: moodFromBreadth(breadth),
    summary: narrative.summary,
    themes: narrative.themes,
    sectorsToWatch: narrative.sectorsToWatch,
    generatedAt: narrative.generatedAt,
    source: narrative.source,
    // Indices are included because they always print on a trading day, so the session/holiday
    // check still works even if the individual stock quotes come back empty.
    lastTradeAt: latestTradeAt([...quotes, ...indices]),
    // When the tape was actually fetched, not when this response was assembled. A tape served
    // while its replacement is in flight is up to a minute old, and saying otherwise would be a
    // lie the reader has no way to catch.
    breadthAsOf: tape.at,
  };
}
