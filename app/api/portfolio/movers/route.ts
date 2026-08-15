import { NextRequest, NextResponse } from "next/server";
import { indianStocks } from "../../../lib/indian-stocks";
import { getDividendBoard, type Dividend } from "../../../lib/nse-dividends";
import { cleanSymbol, listHoldings, portfolioSetupError } from "../../../lib/portfolio";
import type { MoverDividend, MoverRow, MoverSource, PeriodKey } from "../../../lib/portfolio-movers";
import { getCachedPerformanceSummaries } from "../../../lib/stock-performance";
import { userFromRequest } from "../../../lib/store";

/**
 * Everything the movers board ranks: the reader's holdings and their watchlist, priced, with
 * returns over five windows and whatever the dividend calendar has against each.
 *
 * The holdings come from the session. The watchlist arrives in the query string because it lives
 * in the reader's browser rather than on the server — it is a device-local convenience, unlike the
 * portfolio, which belongs to the account. Both are clamped here rather than trusted: the symbols
 * are validated to ticker shape and the list is capped, so the query string cannot be used to make
 * this route fetch an arbitrary number of quotes.
 *
 * Competitors are deliberately not attached here. Those are a per-row sector lookup and the table
 * shows ten rows at a time, so they are fetched for the visible page by `/api/portfolio/peers`.
 */

/** The batch endpoint upstream tops out at 60; the two lists together cannot legitimately exceed it. */
const MAX_WATCHLIST = 20;

/** The reader's watchlist, validated. Anything that is not ticker-shaped is dropped silently. */
export function parseWatchParam(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => cleanSymbol(value))
        .filter((symbol): symbol is string => symbol !== null),
    ),
  ].slice(0, MAX_WATCHLIST);
}

/**
 * The dividend worth showing against a stock: the next one coming, or failing that the last one
 * that went ex.
 *
 * A declared dividend the reader can still capture is the actionable one, so it wins even when a
 * larger payout went ex last month.
 */
export function pickDividend(dividends: Dividend[]): MoverDividend | null {
  if (dividends.length === 0) return null;

  const upcoming = dividends
    .filter((dividend) => dividend.upcoming && dividend.exDate)
    .sort((a, b) => (a.exDate as string).localeCompare(b.exDate as string));

  const chosen =
    upcoming[0] ??
    [...dividends].sort((a, b) => (b.exDate ?? "").localeCompare(a.exDate ?? ""))[0];

  return { amount: chosen.amount, exDate: chosen.exDate, kind: chosen.kind, upcoming: chosen.upcoming };
}

/** Which of the two lists a symbol came from. */
export function sourceFor(held: boolean, watched: boolean): MoverSource {
  return held && watched ? "both" : held ? "holding" : "watchlist";
}

export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in to see your movers." }, { status: 401 });

  const watchlist = parseWatchParam(request.nextUrl.searchParams.get("watch"));

  let holdings: Awaited<ReturnType<typeof listHoldings>>;
  try {
    holdings = await listHoldings(user.id);
  } catch (error) {
    const setup = portfolioSetupError(error);
    if (!setup) throw error;
    return NextResponse.json({ error: setup, setup: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const heldSymbols = new Set(holdings.map((holding) => holding.symbol));
  const watchedSymbols = new Set(watchlist);
  const symbols = [...new Set([...heldSymbols, ...watchedSymbols])];

  if (symbols.length === 0) {
    return NextResponse.json({ rows: [], generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }

  // The dividend board is a single cached fetch for the whole exchange, so indexing it costs one
  // pass rather than one request per symbol.
  const [summaries, board] = await Promise.all([
    getCachedPerformanceSummaries(symbols),
    getDividendBoard().catch(() => null),
  ]);

  const dividendsBySymbol = new Map<string, Dividend[]>();
  for (const sector of board?.sectors ?? []) {
    for (const dividend of sector.dividends) {
      const bucket = dividendsBySymbol.get(dividend.symbol) ?? [];
      bucket.push(dividend);
      dividendsBySymbol.set(dividend.symbol, bucket);
    }
  }

  const bySymbol = new Map(summaries.map((summary) => [summary.symbol, summary]));
  const holdingBySymbol = new Map(holdings.map((holding) => [holding.symbol, holding]));

  const rows: MoverRow[] = symbols.map((symbol) => {
    const summary = bySymbol.get(symbol);
    const holding = holdingBySymbol.get(symbol);
    const meta = indianStocks.find((stock) => stock.symbol === symbol);
    const quantity = holding?.quantity ?? 0;
    const price = summary?.price ?? null;

    const returns: Record<PeriodKey, number | null> = {
      oneDay: summary?.oneDay ?? null,
      oneWeek: summary?.oneWeek ?? null,
      oneMonth: summary?.oneMonth ?? null,
      sixMonth: summary?.sixMonth ?? null,
      oneYear: summary?.oneYear ?? null,
    };

    return {
      symbol,
      name: summary?.name ?? meta?.name ?? null,
      source: sourceFor(heldSymbols.has(symbol), watchedSymbols.has(symbol)),
      capTier: summary?.capTier ?? meta?.capTier ?? null,
      sector: meta?.sector ?? null,
      price,
      returns,
      dividend: pickDividend(dividendsBySymbol.get(symbol) ?? []),
      quantity,
      value: quantity > 0 && price !== null ? quantity * price : null,
      // Filled in for the visible page by /api/portfolio/peers.
      competitors: [],
      peerAverage: null,
      rank: null,
      peerCount: 0,
      sector_group: meta?.sector ?? null,
    };
  });

  return NextResponse.json(
    { rows, generatedAt: new Date().toISOString() },
    // Contains one reader's holdings, so never in a shared cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
