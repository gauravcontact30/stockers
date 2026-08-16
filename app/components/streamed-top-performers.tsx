// The landing page's stock-returns board, resolved on the server and streamed into the page.
//
// Same argument as ./streamed-boards, applied to the last landing section that still opened on a
// skeleton. The ranking behind it reads a year of price history for the whole tracked catalogue and
// joins it to the quote feed, so it was never a fast fetch to be making from the browser after
// hydration — HTML, then bundle, then the round trip, then the rows.
//
// Awaited here instead, inside its own `<Suspense>` so a slow return cache delays this board and
// nothing else. Only the opening view is prefetched: a different tab, window, search or page is a
// question the server was never asked, and the client goes to the network as before.

import { Suspense } from "react";
import { io } from "next/cache";
import { TopPerformers, type Board } from "./top-performers";
import { getTopPerformers } from "../lib/top-performers";
import { SectionSkeleton } from "./market-section";

/**
 * The board's opening state, mirroring `TopPerformers`' initial `useState` values exactly.
 *
 * `key` below is built the same way the component builds it — `direction|period|term|page` — and
 * that is the whole safety mechanism: the payload is spent only while the controls still match.
 */
const OPENING = { direction: "gainers", period: "1y", term: "", page: 1, pageSize: 5 } as const;

export async function TopPerformersPayload() {
  await io();

  const board = await getTopPerformers({
    direction: OPENING.direction,
    period: OPENING.period,
    page: OPENING.page,
    pageSize: OPENING.pageSize,
  });

  const prefetched: Board = {
    key: `${OPENING.direction}|${OPENING.period}|${OPENING.term}|${OPENING.page}`,
    stocks: board.stocks,
    total: board.total,
    page: board.page,
    pages: board.pages,
    asOf: board.asOfDate,
    failed: false,
  };

  return <TopPerformers prefetched={prefetched} />;
}

/** The board's chrome around a skeleton, so the streamed-in rows do not shift the page. */
export function TopPerformersFallback() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-9 w-56 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <SectionSkeleton rows={5} height="h-14" />
    </div>
  );
}

export function StreamedTopPerformers() {
  return (
    <Suspense fallback={<TopPerformersFallback />}>
      <TopPerformersPayload />
    </Suspense>
  );
}
