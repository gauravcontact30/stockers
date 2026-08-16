"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { DynamicTrio } from "../lib/hero-trios";
import { HeroTickerProvider, TopMoversTape, type HeroTickerStock } from "./hero-ticker";
import {
  DataCentreScene,
  DefenceStocksScene,
  InvestorFavouritesScene,
  MINT,
  YearGainersScene,
  type Trio,
} from "./hero-scenes";
import type { StockPerformance } from "./use-stock-performance";

/** How long each slide holds before the carousel advances on its own. */
const SLIDE_MS = 6000;

type Slide = {
  /** Names the slide for the dot's accessible label — never drawn over the scene. */
  caption: string;
  scene: ReactElement;
};

export type HeroCarouselProps = {
  initialPerformance?: readonly StockPerformance[];
  /**
   * The three strongest one-year returns, resolved on the server.
   *
   * A prop rather than a fetch in here for the same reason every other figure on this page is: the
   * hero is server-rendered and then hydrated, and a ranking computed independently in the browser
   * would differ from the one already in the markup. Null when the board could not be built, which
   * the scene renders as "reading" rather than as an error.
   */
  yearGainers?: DynamicTrio | null;
  /** The three names brokers place highest on their own most-bought lists. Same contract. */
  investorFavourites?: DynamicTrio | null;
  /**
   * The week's strongest large caps, for the rail and tape that frame every slide.
   *
   * Handed to a provider rather than into `slidesFor`, because the strips are drawn by `SceneCard`
   * and shared by every scene — see `./hero-ticker`. An empty list is what the strips get when the
   * exchange could not be read, and they render nothing rather than inventing a row.
   */
  topWeekly?: readonly HeroTickerStock[];
};

/**
 * The four slides.
 *
 * A visitor lands looking for proof before editorial breadth, so the two live rankings open the
 * carousel and the fixed sector themes follow as examples of how to inspect a thesis:
 *
 *   1. Most gainers over one year — chosen by measured returns
 *   2. Where investors are buying — chosen by what brokers publish as most bought
 *   3. Data centres — the capacity build-out, three companies at three points in the chain
 *   4. Defence — aircraft, warships and components, at three different sizes
 *
 * The ranking slides get their companies out of the data — a hard-coded "top gainers" list is a
 * claim that stops being true the week after it is written. The last two are fixed because the
 * *theme* is the editorial point and its companies are stable.
 *
 * Every card carries the company's own mark, the sector the exchange files it under with that
 * family's glyph, its cap tier, a live price and the full return matrix. Nothing is written over
 * the scenes: they carry their own labels, and a headline laid on top only competed with those.
 */
export function slidesFor({
  initialPerformance = [],
  yearGainers = null,
  investorFavourites = null,
}: HeroCarouselProps): Slide[] {
  return [
    {
      caption: "Most gainers: the three biggest one-year runs",
      scene: <YearGainersScene trio={yearGainers as Trio | null} initialPerformances={initialPerformance} />,
    },
    {
      caption: "Where investors are buying: the three most bought through brokers",
      scene: <InvestorFavouritesScene trio={investorFavourites as Trio | null} initialPerformances={initialPerformance} />,
    },
    {
      caption: "Data centres: three companies building the capacity",
      scene: <DataCentreScene initialPerformances={initialPerformance} />,
    },
    {
      caption: "Defence: aircraft, warships and components compared",
      scene: <DefenceStocksScene initialPerformances={initialPerformance} />,
    },
  ];
}

export function HeroCarousel({
  initialPerformance = [],
  yearGainers = null,
  investorFavourites = null,
  topWeekly = [],
}: HeroCarouselProps) {
  const slides = slidesFor({ initialPerformance, yearGainers, investorFavourites });
  const [activeSlide, setActiveSlide] = useState(0);
  /**
   * Which scenes have earned the right to exist yet.
   *
   * All four used to mount at once and merely fade between opacities, which meant the browser
   * hydrated four full scenes — and fired the dip board's request — before a reader had seen
   * anything but the first. Three of those four were work done for a slide nobody was looking at,
   * and it landed squarely in the page's blocking time.
   *
   * A slide mounts when it first becomes active and then stays mounted, so the crossfade still has
   * something to fade out of on every subsequent pass, and no scene ever refetches on its way back.
   */
  const [mounted, setMounted] = useState<number[]>([0]);
  const goToAdjacentSlide = (step: 1 | -1) => {
    setActiveSlide((previous) => (previous + step + slides.length) % slides.length);
  };

  useEffect(() => {
    setMounted((previous) => (previous.includes(activeSlide) ? previous : [...previous, activeSlide]));
  }, [activeSlide]);

  useEffect(() => {
    // A setTimeout keyed off activeSlide (rather than a mount-time setInterval) means a
    // manual navigation resets the countdown too, instead of being overridden moments later
    // by a stale auto-advance tick.
    const timer = window.setTimeout(() => {
      setActiveSlide((previous) => (previous + 1) % slides.length);
    }, SLIDE_MS);

    return () => window.clearTimeout(timer);
  }, [activeSlide]);

  return (
    <HeroTickerProvider stocks={topWeekly}>
      {/* The page still needs exactly one h1 for a screen reader and for search, but the visible
          headline was cut, so the site name carries it out of sight instead. */}
      <h1 className="sr-only">StockersAI — AI stock research for Indian investors</h1>

      {/* The scenes are light now, so the panel around them is too — a dark band under a pale
          frame read as two unrelated sections stacked on top of each other. */}
      <section className="w-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div
          /* The frame clips rather than scrolls, so its height has to cover the tallest thing any
             slide needs — the narrow case, where three comparison cards stack into a column instead
             of sitting in a row. Measured against the real scenes at each breakpoint rather than
             guessed. */
          className="relative min-h-[850px] w-full overflow-hidden sm:min-h-[590px] lg:min-h-[470px]"
          aria-roledescription="carousel"
          aria-label="StockersAI product scenes"
        >
          {slides.map((slide, index) => (
            <div
              key={slide.caption}
              aria-hidden={index !== activeSlide}
              /**
               * `inert` as well as `aria-hidden`, now that a slide can contain a link.
               *
               * The two are not the same thing and only one of them was needed before. `aria-hidden`
               * takes a pane out of the accessibility tree but leaves everything in it focusable, so
               * a keyboard reader tabbing through the hero would have landed on the "Open …" button
               * of three slides that are at zero opacity — focus disappearing off-screen, which is
               * among the worst things a carousel can do. `inert` is what actually removes a subtree
               * from the tab order. The old scenes held no focusable content at all, so this cost
               * nothing to overlook; a showcase with a call to action makes it real.
               */
              inert={index !== activeSlide}
              className={`absolute inset-0 transition-opacity duration-700 ${index === activeSlide ? "opacity-100" : "opacity-0"}`}
            >
              {mounted.includes(index) && slide.scene}
            </div>
          ))}

          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-2 sm:px-4">
            <button
              type="button"
              aria-label={`Previous slide: ${slides[(activeSlide - 1 + slides.length) % slides.length].caption}`}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/75 bg-white/70 text-xl font-black text-slate-700 shadow-sm backdrop-blur transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-slate-500/40 sm:h-11 sm:w-11"
              onClick={() => goToAdjacentSlide(-1)}
            >
              <span aria-hidden="true">&lt;</span>
            </button>
            <div className="rounded-full border border-white/70 bg-white/65 px-3 py-1 text-xs font-black tabular-nums text-slate-600 shadow-sm backdrop-blur">
              {activeSlide + 1} / {slides.length}
            </div>
            <button
              type="button"
              aria-label={`Next slide: ${slides[(activeSlide + 1) % slides.length].caption}`}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/75 bg-white/70 text-xl font-black text-slate-700 shadow-sm backdrop-blur transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-slate-500/40 sm:h-11 sm:w-11"
              onClick={() => goToAdjacentSlide(1)}
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>
        </div>
      </section>
      <div className="w-full bg-slate-100 px-3 pb-4 text-slate-900 sm:px-5 dark:bg-slate-950 dark:text-white">
        <TopMoversTape palette={MINT} />
      </div>
    </HeroTickerProvider>
  );
}
