// The landing page's ownership board, resolved on the server and streamed into the page.
//
// Same argument as ./streamed-boards, applied to the third board on the page. It opens on one
// company by default, and that company's filing was being fetched from the browser after
// hydration — HTML, then bundle, then a round trip, then the figures, with a skeleton up for all
// of it. Awaited here instead, so the opening view arrives in the HTML.
//
// `<Suspense>` is what stops that making the page slower: the shell, hero and every other section
// flush immediately, and this board streams into its own slot when the exchange answers. A slow
// filing therefore delays this board and nothing else.
//
// Only the opening company is prefetched. The moment a reader searches for another, they are
// asking something the server was never asked, and the client goes to the network as before.

import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { getBseMarketSnapshot } from "../lib/bse-market-snapshot";
import { CACHE_TAGS } from "../lib/cache";
// Not from ./ownership-board: that file is `"use client"`, and a plain value imported from one of
// those across the RSC boundary arrives as a client reference rather than the string itself.
import { OPENING_SYMBOL } from "../lib/ownership-defaults";
import { dailyPicks } from "../lib/daily-picks";
import { getOwnership } from "../lib/shareholding";
// Same boundary rule as OPENING_SYMBOL above: the fallback list lives in its own import-free module
// because this is a Server Component and ./ownership-board is not.
import { FALLBACK_QUICK_PICKS } from "../lib/suggestion-defaults";
import { OwnershipBoard, type Ownership } from "./ownership-board";
import { SectionSkeleton } from "./market-section";

/** The board's own chrome around a skeleton, so the streamed-in board doesn't shift the page. */
export function OwnershipFallback() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-6 w-56 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-50 dark:bg-slate-800/70" />
      <SectionSkeleton rows={4} height="h-16" />
    </section>
  );
}

export async function OwnershipPayload() {
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.bse);

  // Both halves of what the route returns, in one place, so the seeded board is the same shape the
  // client would have received. A failure on either side falls back to null and the board fetches
  // for itself — an unreachable exchange must not take the whole page down with it.
  const [ownership, market, picks] = await Promise.all([
    getOwnership(OPENING_SYMBOL).catch(() => null),
    getBseMarketSnapshot(OPENING_SYMBOL).catch(() => null),
    // Large and mid caps only, and six of them: a register worth opening belongs to a company with
    // institutions on it, which is not what a randomly surfaced micro cap files. See ../lib/daily-picks.
    dailyPicks({
      count: 6,
      tiers: ["Large", "Mid"],
      fallback: FALLBACK_QUICK_PICKS,
    }).catch(() => []),
  ]);

  const quickPicks = (picks.length ? picks : FALLBACK_QUICK_PICKS).map((pick) => ({
    symbol: pick.symbol,
    name: pick.name,
    sector: pick.sector ?? "Listed company",
    capTier: pick.capTier ?? "Large",
  }));

  if (!ownership) return <OwnershipBoard quickPicks={quickPicks} />;

  return (
    <OwnershipBoard
      quickPicks={quickPicks}
      prefetched={{ symbol: OPENING_SYMBOL, data: { ...ownership, market } as Ownership }}
    />
  );
}

export function StreamedOwnershipBoard() {
  return (
    <Suspense fallback={<OwnershipFallback />}>
      <OwnershipPayload />
    </Suspense>
  );
}
