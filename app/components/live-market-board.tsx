// The exchange as it stands right now, resolved on the server.
//
// Every figure here comes from the BSE's own tape and universe through `app/lib/bse-market` — the
// same source the movers board below it reads — so nothing on this section is estimated, smoothed
// or filled in. A company with no price today is left out of the counts rather than carried at its
// last close, which is why "priced" and "listed" are reported as two different numbers.
//
// On "yesterday": the exchange feed this app reads gives the current session's move against the
// previous close, and lookback windows (a week, a month, a year) measured from stored baselines.
// It does not keep the previous session's own ranked movers, so a "top performers yesterday" card
// could only be produced by inventing one. The second pair of cards is therefore the one-week
// window, labelled as the week — a real figure with an honest name, rather than a made-up one with
// the requested name.

import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { getBseMovers, type BseMoverPage } from "../lib/bse-market";
import { CACHE_TAGS } from "../lib/cache";
import { MoverList } from "./mover-list";
import { MarketRefresher } from "./market-refresher";
import { SectionSkeleton } from "./market-section";

/** Rows shown at once. Five per page, as the section is meant to stay compact. */
const ROWS = 5;

/**
 * How deep each ranking is fetched.
 *
 * Twenty-five is five pages of five — enough for the paging and the search to be worth having,
 * and still bounded, because each row costs a sector lookup on the way out of `getBseMovers`.
 */
const DEPTH = 25;

/** One ranked list on its own card. Used for the week's two; the tiers page themselves. */
function MoverPanel({
  title,
  blurb,
  chrome,
  accent,
  rows,
  empty,
}: {
  title: string;
  blurb: string;
  chrome: string;
  accent: string;
  rows: BseMoverPage["rows"];
  empty: string;
}) {
  return (
    <section className={`rounded-3xl border p-4 ${chrome}`} aria-label={title}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accent}`}>{title}</p>
      <p className="mt-1 mb-3 text-[10px] leading-snug text-slate-600 dark:text-slate-400">{blurb}</p>
      <MoverList rows={rows} caption={title} empty={empty} pageSize={ROWS} />
    </section>
  );
}

export async function LiveMarketPayload() {
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.bse);

  // The per-tier lists have their own landing section now, so this block stays focused on whole-exchange weekly moves.
  //
  // `getBseBoard()` went with the index-and-breadth strip that used to head this section: it was
  // read for `board.summary` and nothing else, so dropping the strip drops a whole-universe read
  // from the section's critical path rather than leaving it fetching a figure nobody displays.
  const [weekUp, weekDown] = await Promise.all([
    getBseMovers({ tier: "all", direction: "gainers", period: "1w", page: 1, pageSize: DEPTH }),
    getBseMovers({ tier: "all", direction: "losers", period: "1w", page: 1, pageSize: DEPTH }),
  ]);

  return (
    <div className="flex flex-col gap-3">
      {/* The week, named for the window it actually measures — see the header of this file for why
          this is the week and not yesterday. */}
      <div className="grid gap-3 xl:grid-cols-2">
        <MoverPanel
          title="Top performers this week"
          blurb="Best across the whole exchange over the last week, not just today's session."
          chrome="border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10"
          accent="text-emerald-700 dark:text-emerald-300"
          rows={weekUp.rows}
          empty="Nothing higher across the exchange this week."
        />
        <MoverPanel
          title="Top non-performers this week"
          blurb="Worst across the whole exchange over the same week."
          chrome="border-rose-200 bg-rose-50/70 dark:border-rose-500/25 dark:bg-rose-500/10"
          accent="text-rose-700 dark:text-rose-300"
          rows={weekDown.rows}
          empty="Nothing lower across the exchange this week."
        />
      </div>

      {/* Re-runs this server render every minute so the figures above stay current. */}
      <MarketRefresher />
    </div>
  );
}

export function LiveMarketFallback() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-5 w-48 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <SectionSkeleton rows={4} height="h-16" />
    </div>
  );
}

/**
 * The section, streamed.
 *
 * Nine rankings over a 4,900-scrip universe is the slowest thing on the landing page, and none of
 * it is above the fold — so it flushes with the rest of the page and fills in when the exchange
 * answers, rather than holding the hero back.
 */
export function LiveMarketBoard() {
  return (
    <section id="live-market" className="scroll-mt-28">
      <div className="mb-4 max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">
          Live from the exchange
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Where the BSE is right now
        </h2>
        {/* Rewritten with the index-and-breadth strip that used to sit at the top of this section:
            the old blurb opened on "how much of the market traded and which way it went", which was
            a description of that strip and of nothing that is still here. */}
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          The week&apos;s best and worst across the whole exchange, as BSE reports it. Companies that did not trade are excluded from the rankings rather than carried at
          yesterday&apos;s close.
        </p>
      </div>

      <Suspense fallback={<LiveMarketFallback />}>
        <LiveMarketPayload />
      </Suspense>
    </section>
  );
}
