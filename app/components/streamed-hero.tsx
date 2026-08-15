// The landing page's slider, streamed into the page rather than awaited in front of it.
//
// The four slides need three server reads: live figures for the six fixed companies, the one-year
// gainers ranking, and the brokers' most-bought ranking. Those were awaited at the top of `Home`,
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
import { HeroCarousel } from "./hero-carousel";
import {
  investorFavouriteTrio,
  topWeeklyGainers,
  topYearGainerTrio,
  type DynamicTrio,
  type HeroTickerRow,
} from "../lib/hero-trios";
import { getCachedPerformanceSummaries, type PerformanceSummary } from "../lib/stock-performance";

/** The six companies on the two fixed slides. Their live figures are prefetched for both. */
export const HERO_PERFORMANCE_SYMBOLS = ["HAL", "MAZDOCK", "PARAS", "NETWEB", "POWERINDIA", "LT"];

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
      <div className="relative min-h-[1040px] w-full overflow-hidden sm:min-h-[720px] lg:min-h-[590px]">
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
 * The four reads, run together, each on its own deadline and each falling back on its own.
 *
 * Separate deadlines rather than one around the `Promise.all`: the four are independent, and a
 * broker feed that is refusing today should cost slide four its companies, not strip the live
 * prices off slides one and two as well.
 */
export async function HeroPayload() {
  const [initialPerformance, yearGainers, investorFavourites, topWeekly] = await Promise.all([
    withDeadline<PerformanceSummary[]>(getCachedPerformanceSummaries(HERO_PERFORMANCE_SYMBOLS), []),
    withDeadline<DynamicTrio | null>(topYearGainerTrio(), null),
    withDeadline<DynamicTrio | null>(investorFavouriteTrio(), null),
    withDeadline<HeroTickerRow[]>(topWeeklyGainers(), []),
  ]);

  return (
    <HeroCarousel
      initialPerformance={initialPerformance}
      yearGainers={yearGainers}
      investorFavourites={investorFavourites}
      topWeekly={topWeekly}
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
