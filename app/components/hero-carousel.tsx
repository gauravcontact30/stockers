"use client";

import { useEffect, useState, type ReactElement } from "react";
import { DataCentreScene, DefenceStocksScene, DipBuysScene, TopGainersScene, type DipLeaderBoard } from "./hero-scenes";
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
  initialDipLeaders?: DipLeaderBoard | null;
};

/**
 * Four scenes, each answering one question in the order a reader asks it: what is running today,
 * how do the defence names compare, who is building the data centres, and how does any of this work.
 *
 * The two middle slides carry live exchange figures rather than an illustration — a reader who
 * never scrolls past the hero has still seen the session's real prices and returns for six
 * companies. All six symbols are raised in the same tick, so they cost one batched request.
 *
 * Nothing is written over the scenes. They carry their own labels — index levels, scrip codes,
 * panel headings — and a headline laid on top only competed with those. The pitch and the calls
 * to action sit underneath the frame instead, where they obscure nothing.
 */
function slidesFor({ initialPerformance = [], initialDipLeaders = null }: HeroCarouselProps): Slide[] {
  return [
  {
    caption: "Today's top performers by theme",
    scene: <TopGainersScene />,
  },
  {
    caption: "HAL, Mazagon Dock and Paras Defence compared",
    scene: <DefenceStocksScene initialPerformances={initialPerformance} />,
  },
  {
    caption: "Three data-centre stocks compared",
    scene: <DataCentreScene initialPerformances={initialPerformance} />,
  },
  {
    caption: "How the AI works, and what it likes cheap today",
    scene: <DipBuysScene initialBoard={initialDipLeaders} />,
  },
  ];
}

export function HeroCarousel({ initialPerformance = [], initialDipLeaders = null }: HeroCarouselProps) {
  const slides = slidesFor({ initialPerformance, initialDipLeaders });
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
          className="relative min-h-[1040px] w-full overflow-hidden sm:min-h-[720px] lg:min-h-[590px]"
          aria-roledescription="carousel"
          aria-label="StockersAI product scenes"
        >
          {slides.map((slide, index) => (
            <div
              key={slide.caption}
              aria-hidden={index !== activeSlide}
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

    </>
  );
}
