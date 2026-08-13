import { NextResponse } from "next/server";
import { getQuotesFor } from "../../../lib/market-data";
import { listHoldings, portfolioSetupError } from "../../../lib/portfolio";
import { resolveMeta } from "../../../lib/stock-performance";
import { userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * A live price for every stock the caller holds.
 *
 * Separate from `/api/market/performance`, which the holdings grid uses, because the two answer
 * different questions at different rates. Performance carries a year of history and is cached for
 * a minute, which is right for a card showing 1M/6M/1Y returns and wrong for a tape that claims to
 * be live. This carries the last print and nothing else, and holds it for three seconds.
 *
 * The symbols come from the stored portfolio rather than the query string. That is what makes this
 * safe to leave open to any signed-in reader: there is no list a caller can pass to turn it into a
 * general-purpose quote proxy, and the work it does is bounded by their own MAX_HOLDINGS.
 */

/**
 * How stale a price may be before it is fetched again.
 *
 * Three seconds. The client polls on a similar cadence, so this mostly stops two tabs and a phone
 * from each costing an upstream call — the underlying loader is keyed by symbol on the server, so
 * the rate here is bounded by the number of distinct stocks held, not by the size of the audience.
 */
const LIVE_MAX_AGE_MS = 3_000;

export type LivePortfolioRow = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  /** True when the exchange printed this today, rather than it being the last close. */
  live: boolean;
  asOf: string | null;
  /** Units held, so the client can value the position without a second request. */
  quantity: number;
  avgPrice: number;
};

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in to use your portfolio." }, { status: 401 });

  let holdings;
  try {
    holdings = await listHoldings(user.id);
  } catch (error) {
    // The store has not been created yet. Say so rather than 500 — see `portfolioSetupError`.
    const setup = portfolioSetupError(error);
    if (!setup) throw error;
    return NextResponse.json({ error: setup, setup: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  if (holdings.length === 0) {
    return NextResponse.json({ rows: [], asOf: new Date().toISOString(), tradedToday: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const quotes = await getQuotesFor(
    holdings.map((holding) => ({ symbol: holding.symbol, yahooSymbol: resolveMeta(holding.symbol).yahooSymbol })),
    LIVE_MAX_AGE_MS,
  );
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const rows: LivePortfolioRow[] = holdings.map((holding) => {
    const quote = bySymbol.get(holding.symbol);
    return {
      symbol: holding.symbol,
      price: quote?.price ?? null,
      previousClose: quote?.previousClose ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      dayHigh: quote?.dayHigh ?? null,
      dayLow: quote?.dayLow ?? null,
      volume: quote?.volume ?? null,
      live: quote?.live ?? false,
      asOf: quote?.asOf ?? null,
      quantity: holding.quantity,
      avgPrice: holding.avgPrice,
    };
  });

  return NextResponse.json(
    {
      rows,
      asOf: new Date().toISOString(),
      /** How many printed today — what the UI's "live" badge is entitled to claim. */
      tradedToday: rows.filter((row) => row.live).length,
      // The most recent print across the book, which is what tells the market clock whether the
      // exchange is actually open rather than merely inside its published hours.
      lastTradeAt: rows.reduce<string | null>(
        (latest, row) => (row.asOf && (!latest || row.asOf > latest) ? row.asOf : latest),
        null,
      ),
    },
    // Never stored: a cached copy at the edge would freeze the thing this endpoint exists to move.
    { headers: { "Cache-Control": "no-store" } },
  );
}
