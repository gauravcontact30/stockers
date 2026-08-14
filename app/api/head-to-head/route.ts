import { NextResponse } from "next/server";
import { getBseMovers } from "../../lib/bse-market";
import { cacheHeaders } from "../../lib/cache";
import { getDailyPredictions } from "../../lib/daily-predictions";
import {
  HEAD_TO_HEAD_PICKS,
  chooseAiPicks,
  decideWinner,
  normalisePicks,
  pickAiSkill,
  type AiCandidate,
  type AiSkill,
  type MatchResult,
} from "../../lib/head-to-head";
import { sideFrom } from "../../lib/head-to-head-score";
import { indianStocks } from "../../lib/indian-stocks";
import { getAllQuotes } from "../../lib/market-data";
import { getPerformanceSummaries, type PerformanceSummary } from "../../lib/stock-performance";

export const dynamic = "force-dynamic";

/**
 * How much of the exchange the AI gets to look at.
 *
 * Fifty because that is `MAX_MOVER_PAGE_SIZE` — the board clamps anything larger, so asking for
 * more would quietly get fifty anyway and the number here would be a lie about the pool size.
 */
const CANDIDATE_POOL = 50;

/** The company name for a ticker, when the catalogue knows it. */
function nameFor(symbol: string): string | null {
  return indianStocks.find((stock) => stock.symbol === symbol.toUpperCase())?.name ?? null;
}

/**
 * A row for a company the price feed could not answer for.
 *
 * Every window null, which `momentumScore` reads as "no coverage" and scores at the neutral 50
 * rather than as a collapse to zero. It keeps the company on the card with its name and mark
 * instead of vanishing it, and it does not flatter or punish the side that picked it.
 */
const BLANK_SUMMARY = {
  symbol: "",
  name: null,
  assetType: "unknown",
  capTier: null,
  currency: "INR",
  price: null,
  previousClose: null,
  change: null,
  oneDay: null,
  oneWeek: null,
  oneMonth: null,
  threeMonth: null,
  sixMonth: null,
  oneYear: null,
  threeYear: null,
  fiveYear: null,
  overall: null,
  overallSince: null,
  live: false,
  asOf: null,
  source: "unavailable",
} as const satisfies Omit<PerformanceSummary, "symbol" | "name"> & { symbol: string; name: string | null };

/**
 * The field the AI chooses from: the exchange's long-run record, joined to the forward view.
 *
 * Two different questions, deliberately. `getBseMovers` with `period: "overall"` answers what each
 * company has actually done across everything the exchange has on it — years, not this morning.
 * `getDailyPredictions` answers what the desk expects next. A skill that saw only the first would
 * be buying history; one that saw only the second would be buying a forecast.
 */
async function aiField(): Promise<{ candidates: AiCandidate[]; source: "ai" | "heuristic" }> {
  // Per tier, and over two windows, rather than one pass at the whole exchange.
  //
  // A single "top 50 overall" pass looked right and was almost useless: the exchange's best
  // long-run performers are overwhelmingly obscure small caps that the pricing side cannot resolve,
  // so nearly all of them were filtered out and the AI fell back to a list with no returns at all —
  // which left every skill ranking on confidence alone and fielding much the same team each match.
  // Splitting the ask by cap tier reaches the large and mid names that *are* priceable, and two
  // windows give the contrarian and compounder lenses genuinely different material to work with.
  const [quotes, ...boards] = await Promise.all([
    getAllQuotes(),
    ...(["large", "mid", "small"] as const).flatMap((tier) =>
      (["overall", "1y"] as const).map((period) =>
        getBseMovers({ tier, direction: "gainers", period, page: 1, pageSize: CANDIDATE_POOL }),
      ),
    ),
  ]);

  const predictions = await getDailyPredictions(
    quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent })),
  );

  // Only companies the pricing side can actually resolve.
  //
  // `resolveMeta` falls back to `<TICKER>.NS` for anything outside the curated list, and a
  // BSE-only scrip has no NSE listing — so those come back with every return null, score a flat
  // 50, and in the worst case never resolve at all. That is what emptied the AI's card once
  // already. Ranking still happens on the exchange's own long-run board; this only bounds it to
  // names with a real price history behind them.
  const priceable = new Set(indianStocks.map((stock) => stock.symbol));

  // Keyed, because a company can top both the overall and the one-year board and must not be
  // fielded twice. The first sighting wins, which is the longer window.
  const bySymbol = new Map<string, AiCandidate>();

  for (const board of boards) {
    for (const row of board.rows) {
      if (!priceable.has(row.ticker) || bySymbol.has(row.ticker)) continue;

      const prediction = predictions.predictions[row.ticker];
      bySymbol.set(row.ticker, {
        symbol: row.ticker,
        name: row.name ?? null,
        capTier: row.capTier ?? null,
        sector: row.sector ?? null,
        longRun: row.returnPercent,
        today: row.changePercent,
        outlook: prediction?.outlook ?? null,
        // Zero rather than a guess, so a skill that leans on conviction does not lean on a name
        // the prediction run had no opinion about.
        confidence: prediction?.confidence ?? 0,
      });
    }
  }

  const candidates = [...bySymbol.values()];

  // Still thin — a quiet session, or an upstream hiccup. Falling back to the curated list keeps the
  // AI fielding five real companies rather than an empty card, which is the failure a reader would
  // actually see. These carry no long-run figure, which the skills read as neutral rather than bad.
  if (candidates.length >= HEAD_TO_HEAD_PICKS) return { candidates, source: predictions.source };

  for (const stock of indianStocks) {
    if (bySymbol.has(stock.symbol)) continue;
    const prediction = predictions.predictions[stock.symbol];
    candidates.push({
      symbol: stock.symbol,
      name: stock.name,
      capTier: stock.capTier ?? null,
      sector: stock.sector ?? null,
      longRun: null,
      today: null,
      outlook: prediction?.outlook ?? null,
      confidence: prediction?.confidence ?? 0,
    });
  }

  return { candidates, source: predictions.source };
}

/**
 * The AI's team, chosen once the human's is in.
 *
 * There is no GET beside this. The reader's five are locked before the AI is asked for anything,
 * and its line-up arrives with the verdict — so nothing on the landing page can be read ahead to
 * copy, and the contest cannot be replayed against a team somebody already knows.
 */
async function aiLineUp(exclude: string[]): Promise<{ symbols: string[]; source: "ai" | "heuristic"; skill: AiSkill }> {
  const { candidates, source } = await aiField();
  // A different lens each match, and a sample rather than the top five within it, so two matches
  // on the same day's data do not field the same team.
  const skill = pickAiSkill();

  // Off the human's own picks: the same company on both sides is a guaranteed draw on that row,
  // and reads as the AI copying its opponent rather than answering them.
  return { symbols: chooseAiPicks(candidates, { skill, exclude }), source, skill };
}

/**
 * Human against the AI, one match per request.
 *
 * Deliberately *not* behind `guardFeature`. This sits on the landing page, where almost everyone
 * is signed out — gating it would put a paywall in front of the thing meant to sell the paywall.
 * It reads market data that is already public elsewhere on the page and writes nothing.
 *
 * POST rather than GET because the answer depends on a body of five symbols, and because the AI's
 * line-up must not be readable before the reader has committed to their own. A GET that returned
 * the AI's picks would turn the contest into a copying exercise.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const symbols = normalisePicks((body as { symbols?: unknown })?.symbols);
  if (symbols.length !== HEAD_TO_HEAD_PICKS) {
    return NextResponse.json(
      { error: `Pick ${HEAD_TO_HEAD_PICKS} different companies to play.` },
      { status: 400 },
    );
  }

  try {
    // Conviction, not momentum: the AI fields what it rates highest for tomorrow, and is then
    // graded on the same realised-return arithmetic as its opponent. See ../../lib/head-to-head.
    const { symbols: aiSymbols, source, skill } = await aiLineUp(symbols);

    // One batch for both sides. Two calls would double the history fetches and let the two teams
    // be priced fractionally apart, which is exactly the sort of unfairness nobody would ever see
    // and everybody would feel.
    const summaries = await getPerformanceSummaries([...symbols, ...aiSymbols]);
    const bySymbol = new Map(summaries.map((summary) => [summary.symbol.toUpperCase(), summary]));

    /**
     * The chosen five as scoreable rows, with a stand-in for anything the feed could not price.
     *
     * Dropping an unpriced pick silently is what emptied the AI's card: five symbols in, nothing
     * out, a side that scored zero and showed no companies at all. A placeholder scores as "went
     * nowhere" — which is the honest reading of a company we have no returns for — and, crucially,
     * still puts the name and its logo on the card.
     */
    const take = (wanted: string[]) =>
      wanted.map(
        (symbol) =>
          bySymbol.get(symbol.toUpperCase()) ?? {
            ...BLANK_SUMMARY,
            symbol: symbol.toUpperCase(),
            name: nameFor(symbol),
          },
      );

    const human = sideFrom(take(symbols));
    const ai = sideFrom(take(aiSymbols));

    const result: MatchResult = {
      human,
      ai,
      winner: decideWinner(human.score, ai.score),
      margin: Math.abs(human.score - ai.score),
      aiSource: source,
      aiSkill: { key: skill.key, label: skill.label, blurb: skill.blurb },
    };

    // Never stored. The answer is specific to the five somebody just chose *and* to the skill drawn
    // for this match — a second run is meant to field a different team, so even a thirty-second
    // private cache would replay the previous one and make the AI look deterministic.
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the market data for this match." }, { status: 502 });
  }
}
