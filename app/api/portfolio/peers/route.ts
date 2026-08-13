import { NextRequest, NextResponse } from "next/server";
import { indianStocks } from "../../../lib/indian-stocks";
import { cleanSymbol } from "../../../lib/portfolio";
import type { PeriodKey } from "../../../lib/portfolio-movers";
import { getCachedPerformanceSummaries } from "../../../lib/stock-performance";
import { userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * Sector peers for a handful of stocks, with their returns over the same five windows.
 *
 * Split out from `/api/portfolio/movers` because peers are per-row work and the table shows one
 * page at a time: attaching them to all fifty rows of a book would fetch several hundred quotes to
 * render ten. This is asked for the visible page only, and re-asked when the reader turns to the
 * next one.
 *
 * All five windows come back rather than just the one on screen, so changing the period selector
 * re-ranks instantly from what the browser already has instead of costing another round trip.
 */

/** Ten rows a page, and a peer lookup per row. */
const MAX_SUBJECTS = 12;
/** Enough to place a stock in its sector without turning one row into a board of its own. */
const MAX_PEERS = 5;

const CAP_RANK: Record<string, number> = { Large: 0, Mid: 1, Small: 2 };

/**
 * The peer group for a symbol: same sector, ordered by market standing rather than by today's
 * move, so a stock sits against the names it actually competes with rather than against whoever
 * happened to jump this morning.
 *
 * Empty for a scrip outside the hand-classified catalogue. Most of the ~4,950 listed companies are,
 * and inventing a peer group for one would be worse than showing none: a rank is only meaningful
 * against a group that means something.
 */
export function peersFor(symbol: string): string[] {
  const self = indianStocks.find((stock) => stock.symbol === symbol);
  if (!self) return [];

  return indianStocks
    .filter((stock) => stock.sector === self.sector && stock.symbol !== symbol)
    .sort((a, b) => (CAP_RANK[a.capTier] ?? 3) - (CAP_RANK[b.capTier] ?? 3) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_PEERS)
    .map((stock) => stock.symbol);
}

export type PeerQuote = {
  symbol: string;
  name: string;
  price: number | null;
  returns: Record<PeriodKey, number | null>;
};

export type PeerGroup = { symbol: string; sector: string | null; peers: PeerQuote[] };

export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in to compare against peers." }, { status: 401 });

  const subjects = [
    ...new Set(
      (request.nextUrl.searchParams.get("symbols") ?? "")
        .split(",")
        .map((value) => cleanSymbol(value))
        .filter((symbol): symbol is string => symbol !== null),
    ),
  ].slice(0, MAX_SUBJECTS);

  if (subjects.length === 0) {
    return NextResponse.json({ groups: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const groupSymbols = new Map(subjects.map((symbol) => [symbol, peersFor(symbol)]));

  // One batched call for every peer across every subject. Sectors overlap heavily between rows —
  // two banks on the same page share a peer group entirely — so de-duplicating before fetching is
  // what keeps this to a handful of quotes rather than one per cell.
  const wanted = [...new Set([...subjects, ...[...groupSymbols.values()].flat()])];
  const summaries = await getCachedPerformanceSummaries(wanted);
  const bySymbol = new Map(summaries.map((summary) => [summary.symbol, summary]));

  const groups: PeerGroup[] = subjects.map((symbol) => ({
    symbol,
    sector: indianStocks.find((stock) => stock.symbol === symbol)?.sector ?? null,
    peers: (groupSymbols.get(symbol) ?? []).map((peer) => {
      const summary = bySymbol.get(peer);
      return {
        symbol: peer,
        name: summary?.name ?? indianStocks.find((stock) => stock.symbol === peer)?.name ?? peer,
        price: summary?.price ?? null,
        returns: {
          oneDay: summary?.oneDay ?? null,
          oneWeek: summary?.oneWeek ?? null,
          oneMonth: summary?.oneMonth ?? null,
          sixMonth: summary?.sixMonth ?? null,
          oneYear: summary?.oneYear ?? null,
        },
      };
    }),
  }));

  return NextResponse.json({ groups }, { headers: { "Cache-Control": "no-store" } });
}
