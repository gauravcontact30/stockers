"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { DynamicTrio } from "../lib/hero-trios";
import type { MostBoughtBoard } from "../lib/most-bought";
import { MostBoughtRibbon } from "./most-bought-ribbon";
import {
  DefenceLeadersScene,
  InvestorBuyingScene,
  RetailLeadersScene,
  ThreeYearGainersScene,
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
   * The three strongest of India's listed defence names over the last year, resolved on the server.
   *
   * A prop rather than a fetch in here for the same reason every other figure on this page is: the
   * hero is server-rendered and then hydrated, and a ranking computed independently in the browser
   * would differ from the one already in the markup. Null when the board could not be built, which
   * the scene renders as "reading" rather than as an error.
   */
  defence?: DynamicTrio | null;
  /** The same over retail — chains, quick commerce and restaurants together. Same contract. */
  retail?: DynamicTrio | null;
  /** The three biggest three-year runs in the tracked universe. Same contract. */
  threeYearGainers?: DynamicTrio | null;
  /** The three the week's buyers have crowded into, from broker lists and the tape. Same contract. */
  investorBuying?: DynamicTrio | null;
  /**
   * Today's buying board, for the ribbon under the slider.
   *
   * A prop for the same reason the rankings above are: the ribbon is in the server's HTML before
   * it ever polls, so the first paint carries real rows instead of an empty rail. Null when the
   * board could not be read, which the ribbon renders as nothing rather than as an invented row.
   */
  mostBought?: MostBoughtBoard | null;
};

/**
 * The four slides.
 *
 * Two sectors first, then two boards over the whole market — narrow to wide, which is the order a
 * visitor reads them in:
 *
 *   1. Defence — the three strongest one-year returns among India's listed defence companies
 *   2. Retail — the same, over the chains, the quick-commerce platforms and the restaurant groups
 *   3. Most gainers, last three years — the three biggest long-run moves on the board
 *   4. Where investors are buying — the three the week's buyers have crowded into, from the
 *      brokers' own most-bought lists and the exchange's trade counts
 *
 * Every one of the four gets its companies out of the data — a hard-coded "top three" is a claim
 * that stops being true the week after it is written — and every one of them arrives as a prop
 * resolved on the server, so the hero cannot disagree with the boards below it.
 *
 * Every card carries the company's own mark, the sector the exchange files it under with that
 * family's glyph, its cap tier, a live price and the full return matrix. Nothing is written over
 * the scenes: they carry their own labels, and a headline laid on top only competed with those.
 *
 * Takes every ranking explicitly rather than defaulting them: `HeroCarousel` has already applied
 * the defaults by the time it calls this, and a second set here would be two places to change and
 * one of them silently unreachable.
 */
export function slidesFor({
  initialPerformance,
  defence,
  retail,
  threeYearGainers,
  investorBuying,
}: Required<Omit<HeroCarouselProps, "mostBought">>): Slide[] {
  return [
    {
      caption: "Defence: the sector's three strongest stocks",
      scene: <DefenceLeadersScene trio={defence as Trio | null} initialPerformances={initialPerformance} />,
    },
    {
      caption: "Retail: the sector's three strongest stocks",
      scene: <RetailLeadersScene trio={retail as Trio | null} initialPerformances={initialPerformance} />,
    },
    {
      caption: "Most gainers: the three biggest three-year runs",
      scene: <ThreeYearGainersScene trio={threeYearGainers as Trio | null} initialPerformances={initialPerformance} />,
    },
    {
      caption: "Where investors are buying: the three most bought this week",
      scene: <InvestorBuyingScene trio={investorBuying as Trio | null} initialPerformances={initialPerformance} />,
    },
  ];
}

export function HeroCarousel({
  initialPerformance = [],
  defence = null,
  retail = null,
  threeYearGainers = null,
  investorBuying = null,
  mostBought = null,
}: HeroCarouselProps) {
  const slides = slidesFor({ initialPerformance, defence, retail, threeYearGainers, investorBuying });
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
    <>
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
        <MostBoughtRibbon initial={mostBought} />
      </div>
    </>
  );
}
