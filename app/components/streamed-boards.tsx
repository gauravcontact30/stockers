// The landing page's two boards, resolved on the server and streamed into the page.
//
// These are server components, not client ones. Everything a visitor saw before this file existed
// arrived in four steps: the HTML shell, then the JavaScript bundle, then a fetch to an API route,
// then finally the numbers — with a pulsing skeleton on screen for all of it. The shell itself
// measured 36ms; the wait was almost entirely the last two steps.
//
// Each board below is instead awaited on the server and handed to its client component as the
// opening payload, so the rows are in the HTML the browser receives. `<Suspense>` around each one
// is what keeps that from making the page slower than it was: the header, the hero and the
// workspace grid flush immediately, and each board is streamed into its own slot as it resolves.
// A slow exchange feed therefore delays its own board and nothing else on the page.
//
// Only the opening view is prefetched. The moment a reader changes a tab, a tier or a page they
// are asking a question the server was never asked, and the client goes to the network as before.
//
// Both payloads below carry `use cache`. Under Cache Components an uncached async component is a
// per-request hole in the prerender, which for a nine-ranking read over 4,900 scrips would be
// slower than what this file replaced — so the cache directive is what keeps these in the static
// shell, on the same sixty-second window `revalidate = 60` used to give the whole page.

import { Suspense } from "react";
import { io } from "next/cache";
import { BseMoversBoard, type BseMoverPage } from "./bse-movers-board";
import { BseSectorMovers, type BseSectorBoardResponse } from "./bse-sector-movers";
import { SectionSkeleton } from "./market-section";
import { getBseMovers, getBseSectorBoard } from "../lib/bse-market";
import { MOVERS_PAGE_SIZE, buildMoversUrl } from "../lib/market-urls";

/** The board's own chrome around a skeleton, so the streamed-in board doesn't shift the page. */
export function BoardFallback({ rows, height }: { rows: number; height: string }) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-6 w-48 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-50 dark:bg-slate-800/70" />
      <SectionSkeleton rows={rows} height={height} />
    </section>
  );
}

/**
 * The opening view of the gainers board: whole exchange, ranked by overall return, page one.
 *
 * These arguments mirror `BseMoversBoard`'s initial state exactly. They have to: the payload is
 * only used when the URL the client builds on its first render matches the one named here, so a
 * board that opened on different defaults would simply fetch as it always did rather than show the
 * wrong figures.
 */
const OPENING_MOVERS = { tier: "all", direction: "gainers", period: "1y", term: "", move: "0", page: 1 } as const;

export async function MoversBoard() {
  await io();

  const movers = await getBseMovers({
    tier: OPENING_MOVERS.tier,
    direction: OPENING_MOVERS.direction,
    period: OPENING_MOVERS.period,
    page: OPENING_MOVERS.page,
    pageSize: MOVERS_PAGE_SIZE,
  });

  const url = buildMoversUrl(
    OPENING_MOVERS.tier,
    OPENING_MOVERS.direction,
    OPENING_MOVERS.period,
    OPENING_MOVERS.term,
    OPENING_MOVERS.move,
    OPENING_MOVERS.page,
  );

  return <BseMoversBoard prefetched={{ url, data: movers as BseMoverPage }} />;
}

export async function SectorBoard() {
  await io();

  const board = await getBseSectorBoard();
  return <BseSectorMovers prefetched={{ url: "/api/market/bse/sectors", data: board as BseSectorBoardResponse }} />;
}

export function StreamedMoversBoard() {
  return (
    <Suspense fallback={<BoardFallback rows={5} height="h-16" />}>
      <MoversBoard />
    </Suspense>
  );
}

export function StreamedSectorMovers() {
  return (
    <Suspense fallback={<BoardFallback rows={4} height="h-14" />}>
      <SectorBoard />
    </Suspense>
  );
}
