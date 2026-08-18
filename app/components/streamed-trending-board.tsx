// The landing page's trending board, resolved on the server and streamed into the page.
//
// Same argument as ./streamed-boards, applied to the fourth board on the page — and the last of
// the landing sections that was still fetching its opening view from the browser. What a reader
// used to wait through was the HTML shell, then the JavaScript bundle, then a round trip to
// `/api/market/bse/trending`, then finally the rows, with a pulsing skeleton up for all of it. The
// broker ranking behind that endpoint joins several scraped most-bought lists to the exchange tape,
// so it is not a fast one.
//
// Awaited here instead, so the opening tab arrives in the HTML, inside its own `<Suspense>` so a
// slow broker feed delays this board and nothing else on the page.
//
// Only the opening view is prefetched. Change the tab, the platform, the broker, the tier or the
// page and the reader is asking something the server was never asked, and the client goes to the
// network exactly as before.

import { Suspense } from "react";
import { io } from "next/cache";
import { BseTrendingBoard } from "./bse-trending-board";
import { getBseTrending, type BseTrendingBoard as BseTrendingPayload } from "../lib/bse-market";
import { TRENDING_PAGE_SIZE, buildTrendingUrl } from "../lib/market-urls";
import { BoardFallback } from "./streamed-boards";

/**
 * The board's opening state, mirroring `BseTrendingBoard`'s initial `useState` values exactly.
 *
 * They have to match: the payload is only spent when the URL the client builds on its first render
 * is the one named here, so a board that opened on different defaults would simply fetch as it
 * always did rather than render the wrong figures.
 *
 * `turnover` is the opening tab. It was `brokers` — a retail broker's published buying list — and
 * that ranking has been taken off the board entirely, so that this section names no platform but
 * the exchange it is about. See the note on `RANK_OPTIONS` in ./bse-trending-board.
 *
 * `broker` stays in this object only because `buildTrendingUrl` still takes the facet; at "all" it
 * is omitted from the query string, so the URL built here is the one the client builds.
 */
const OPENING = {
  rank: "turnover",
  term: "",
  platform: "all",
  broker: "all",
  tier: "all",
  move: "0",
  page: 1,
} as const;

export async function TrendingPayload() {
  await io();

  const board = await getBseTrending({
    rank: OPENING.rank,
    page: OPENING.page,
    pageSize: TRENDING_PAGE_SIZE,
    // Matching the endpoint: the first paint of this board during market hours carries live prices
    // rather than waiting for the client's first refresh to correct them.
    live: true,
  });

  const url = buildTrendingUrl(
    OPENING.rank,
    OPENING.term,
    OPENING.platform,
    OPENING.broker,
    OPENING.tier,
    OPENING.move,
    OPENING.page,
  );

  return <BseTrendingBoard prefetched={{ url, data: board as BseTrendingPayload }} />;
}

export function StreamedTrendingBoard() {
  return (
    <Suspense fallback={<BoardFallback rows={5} height="h-16" />}>
      <TrendingPayload />
    </Suspense>
  );
}
