// The landing page's slider, streamed into the page rather than awaited in front of it.
//
// The four slides need five server reads: the four rankings the slides are, and the live figures for
// whichever companies those rankings name. They were awaited at the top of `Home`,
// which is the one place a slow read costs the most — `Home` cannot return any markup until its
// own awaits settle, so a reader saw `app/loading.tsx` and nothing else until all three had come
// back. Three network round trips, two of them against feeds this app does not own, sat in front of
// the header, the boards, the pricing table and the footer alike.
//
// Both halves of the fix are here:
//
//   `<Suspense>`     the page shell flushes immediately and the hero is streamed into its own slot,
//                    which is the same bargain `./streamed-boards` already makes for the exchange
//                    feeds — that file's header even claims the hero flushes first, and until now
//                    it was the one thing that did not.
//
//   `withDeadline`   a read that has not answered in four seconds stops being waited on. Slides one
//                    and two do not need any of it, and the ranking slides already know how to say
//                    "Reading the board…", so a wedged upstream costs the hero its figures rather
//                    than costing the visitor the page.
//
// Nothing here retries or reports. The reads are all cached a layer down (see `../lib/cache`), so
// the work a deadline walks away from still lands in that cache and the next reader gets it.

import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { HeroCarousel } from "./hero-carousel";
import { CACHE_TAGS } from "../lib/cache";
import {
  capitalGoodsTrio,
  healthcareTrio,
  investorHeldTrio,
  monthGainerTrio,
  type DynamicTrio,
} from "../lib/hero-trios";
import { getMostBoughtToday, type MostBoughtBoard } from "../lib/most-bought";
import { getCachedPerformanceSummaries, type PerformanceSummary } from "../lib/stock-performance";

/**
 * The companies whose live figures are prefetched, gathered from the four rankings themselves.
 *
 * A function rather than the fixed list it used to be, because no slide names its companies any
 * more — all four are rankings, so which twelve names need a price is only known once the rankings
 * have resolved. Deduplicated: a company can top two of these boards at once, and asking the quote
 * feed for it twice in the same call is work for nothing.
 */
export function heroPerformanceSymbols(trios: (DynamicTrio | null)[]): string[] {
  return [...new Set(trios.flatMap((trio) => trio ?? []).map((stock) => stock.symbol))];
}

/**
 * How long the hero waits on one read before opening without it.
 *
 * Four seconds is chosen against the measured cost of the slowest of the three — the broker
 * ranking, which joins several scraped most-bought lists to the exchange tape and comes back in
 * about five seconds cold, well under one second warm. So this is a deadline a healthy read misses
 * only on the very first request after a deploy, and a wedged one misses always.
 */
export const HERO_DEADLINE_MS = 4000;

/**
 * `work`, or `fallback` if it has not answered within `ms` — and `fallback` if it rejects.
 *
 * Deliberately not `Promise.race` with a rejecting timer: a rejection here would propagate out of
 * `Promise.all` and take the whole hero with it, which is the opposite of what a deadline is for.
 * The abandoned promise is left running rather than aborted, so its result still reaches the cache
 * for whoever asks next; the rejection handler is what keeps that from becoming an unhandled one.
 */
export function withDeadline<T>(work: Promise<T>, fallback: T, ms: number = HERO_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * The frame the carousel will occupy, at the heights it occupies.
 *
 * The min-heights mirror `./hero-carousel` exactly. They have to: this is what stands in the
 * layout while the reads settle, and a fallback of a different height would drop the rest of the
 * page several hundred pixels the moment the hero arrived.
 */
export function HeroFallback() {
  return (
    <section className="w-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="relative min-h-[850px] w-full overflow-hidden sm:min-h-[590px] lg:min-h-[470px]">
        <div className="flex h-full flex-col gap-6 p-2 sm:p-4 lg:p-5">
          <div className="h-8 w-64 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-5 w-full max-w-2xl animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-800/70" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-80 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
            <div className="h-80 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
            <div className="h-80 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The reads, in two rounds: the rankings together, then the prices for whoever they named.
 *
 * Two rounds rather than one is forced by the slides themselves — every one of the four is now a
 * ranking, so the symbols to price are not known until the rankings are in. The first round is five
 * independent reads on five separate deadlines: a feed refusing today should cost its own slide its
 * companies, not strip the live prices off the other three as well. The second round is one call,
 * and every scene already knows how to draw a card whose price has not arrived — the browser fetches
 * it on hydration — so a miss here costs the first paint its figures and nothing more.
 */
export async function HeroPayload() {
  // Cached, so the hero is part of the prerendered shell rather than a per-request hole. Note what
  // this means for `withDeadline` below: a read that misses its deadline caches the *fallback* for
  // the window, exactly as the old `revalidate = 60` prerender did. That is the intended trade —
  // the abandoned read still lands in `../lib/cache`, so the next revalidation picks it up.
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.bse, CACHE_TAGS.quotes, CACHE_TAGS.nse);

  const [capitalGoods, healthcare, monthGainers, investorFavourites, mostBought] = await Promise.all([
    withDeadline<DynamicTrio | null>(capitalGoodsTrio(), null),
    withDeadline<DynamicTrio | null>(healthcareTrio(), null),
    withDeadline<DynamicTrio | null>(monthGainerTrio(), null),
    withDeadline<DynamicTrio | null>(investorHeldTrio(), null),
    // The ribbon's opening board. It polls for itself after hydration, so a deadline miss here
    // costs the first paint its rows and nothing more.
    withDeadline<MostBoughtBoard | null>(getMostBoughtToday(), null),
  ]);

  const symbols = heroPerformanceSymbols([capitalGoods, healthcare, monthGainers, investorFavourites]);
  const initialPerformance = await withDeadline<PerformanceSummary[]>(getCachedPerformanceSummaries(symbols), []);

  return (
    <HeroCarousel
      initialPerformance={initialPerformance}
      capitalGoods={capitalGoods}
      healthcare={healthcare}
      monthGainers={monthGainers}
      investorFavourites={investorFavourites}
      mostBought={mostBought}
    />
  );
}

export function StreamedHero() {
  return (
    <Suspense fallback={<HeroFallback />}>
      <HeroPayload />
    </Suspense>
  );
}
