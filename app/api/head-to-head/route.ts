import { NextResponse } from "next/server";
import { cacheHeaders } from "../../lib/cache";
import { getDailyPredictions } from "../../lib/daily-predictions";
import {
  HEAD_TO_HEAD_PICKS,
  chooseAiPicks,
  decideWinner,
  normalisePicks,
  type MatchResult,
} from "../../lib/head-to-head";
import { sideFrom } from "../../lib/head-to-head-score";
import { indianStocks } from "../../lib/indian-stocks";
import { getAllQuotes } from "../../lib/market-data";
import { getPerformanceSummaries } from "../../lib/stock-performance";

export const dynamic = "force-dynamic";

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
    const quotes = await getAllQuotes();
    const predictions = await getDailyPredictions(
      quotes.map((quote) => ({ symbol: quote.symbol, changePercent: quote.changePercent })),
    );
    const aiSymbols = chooseAiPicks(predictions.predictions, indianStocks, { exclude: symbols });

    // One batch for both sides. Two calls would double the history fetches and let the two teams
    // be priced fractionally apart, which is exactly the sort of unfairness nobody would ever see
    // and everybody would feel.
    const summaries = await getPerformanceSummaries([...symbols, ...aiSymbols]);
    const bySymbol = new Map(summaries.map((summary) => [summary.symbol.toUpperCase(), summary]));
    const take = (wanted: string[]) =>
      wanted.map((symbol) => bySymbol.get(symbol.toUpperCase())).filter((summary) => summary !== undefined);

    const human = sideFrom(take(symbols));
    const ai = sideFrom(take(aiSymbols));

    const result: MatchResult = {
      human,
      ai,
      winner: decideWinner(human.score, ai.score),
      margin: Math.abs(human.score - ai.score),
      aiSource: predictions.source,
    };

    // Private and brief: the answer is specific to the five somebody just chose, so a shared cache
    // must never hand it to the next visitor. The short window only absorbs a double-submit.
    return NextResponse.json(result, { headers: cacheHeaders(30, "private") });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the market data for this match." }, { status: 502 });
  }
}
