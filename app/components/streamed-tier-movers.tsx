// The landing page's cap-tier board, resolved on the server and streamed into the page.
//
// Same argument as ./streamed-boards. This section shows two cards side by side — the chosen
// tier's gainers and its losers — and both were fetched from the browser after hydration, so the
// section cost two round trips on top of the bundle before it showed a single row.
//
// Both are awaited here instead, in parallel, and handed to the board as its opening payload. Only
// the tier the board opens on is prefetched: switching to mid or small cap asks something the
// server was never asked, and those cards go to the network exactly as before.

import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { TierMovers } from "./tier-movers";
import { getBseMovers, type BseMoverPage } from "../lib/bse-market";
import { CACHE_TAGS } from "../lib/cache";
import { buildMoversUrl } from "../lib/market-urls";
import { SectionSkeleton } from "./market-section";

/**
 * The board's opening state, mirroring `TierMovers`' and `SideCard`'s initial values exactly.
 *
 * `PAGE_SIZE` is five rather than the shared `MOVERS_PAGE_SIZE`: this section shows two cards at
 * once, so ten rows already fill it. It is declared here as well as in ./tier-movers because the
 * payload is only spent when the URL matches, and a mismatch here would silently cost the section
 * its prefetch rather than fail loudly.
 */
const OPENING = { tier: "large", period: "1d", term: "", move: "0", page: 1, pageSize: 5 } as const;

/** One side of the opening tier, with the URL the client will build for it on first render. */
async function side(direction: "gainers" | "losers") {
  const data = await getBseMovers({
    tier: OPENING.tier,
    direction,
    period: OPENING.period,
    page: OPENING.page,
    pageSize: OPENING.pageSize,
  });

  const url = buildMoversUrl(
    OPENING.tier,
    direction,
    OPENING.period,
    OPENING.term,
    OPENING.move,
    OPENING.page,
    OPENING.pageSize,
  );

  return { url, data: data as BseMoverPage };
}

export async function TierMoversPayload() {
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.bse);

  const [gainers, losers] = await Promise.all([side("gainers"), side("losers")]);

  return <TierMovers prefetched={{ gainers, losers }} />;
}

/** The two cards' chrome around a skeleton, so the streamed-in board does not shift the page. */
export function TierMoversFallback() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
          <SectionSkeleton rows={5} height="h-12" />
        </div>
      ))}
    </div>
  );
}

export function StreamedTierMovers() {
  return (
    <Suspense fallback={<TierMoversFallback />}>
      <TierMoversPayload />
    </Suspense>
  );
}
