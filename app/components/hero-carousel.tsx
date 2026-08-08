"use client";

import { useEffect, useState, type ReactElement } from "react";
import { CompareScene, DipBuysScene, TopGainersScene, TripleReportScene } from "./hero-scenes";

/** How long each slide holds before the carousel advances on its own. */
const SLIDE_MS = 6000;

type Slide = {
  /** Names the slide for the dot's accessible label — never drawn over the scene. */
  caption: string;
  scene: ReactElement;
};

/**
 * Four scenes, each answering one question in the order a reader asks it: what is running today,
 * how do two names compare, what does a full report look like, and how does any of this work.
 *
 * Nothing is written over them. The scenes carry their own labels — index levels, scrip codes,
 * panel headings — and a headline laid on top only competed with those. The pitch and the calls
 * to action sit underneath the frame instead, where they obscure nothing.
 */
const slides: Slide[] = [
  { caption: "Today's top performers by theme", scene: <TopGainersScene /> },
  { caption: "Two stocks compared by AI", scene: <CompareScene /> },
  { caption: "A three-stock buy, hold or sell report", scene: <TripleReportScene /> },
  { caption: "How the AI works, and what it likes cheap today", scene: <DipBuysScene /> },
];

export function HeroCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    // A setTimeout keyed off activeSlide (rather than a mount-time setInterval) means a
    // manual dot click resets the countdown too, instead of being overridden moments later
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
      <h1 className="sr-only">Stockers.AI — AI stock research for Indian investors</h1>

      {/* The scenes are light now, so the panel around them is too — a dark band under a pale
          frame read as two unrelated sections stacked on top of each other. */}
      <section className="w-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div
          className="relative min-h-[560px] w-full overflow-hidden sm:min-h-[620px] lg:min-h-[680px]"
          aria-roledescription="carousel"
          aria-label="Stockers.AI product scenes"
        >
          {slides.map((slide, index) => (
            <div
              key={slide.caption}
              aria-hidden={index !== activeSlide}
              className={`absolute inset-0 transition-opacity duration-700 ${index === activeSlide ? "opacity-100" : "opacity-0"}`}
            >
              {slide.scene}
            </div>
          ))}
        </div>

        {/* The slide picker belongs to the carousel, so it stays inside this panel.
            The dot is drawn by the inner span; the button around it is a 44px-tall touch target
            with the dot centred in it, because a 10px dot is not something a thumb can hit. The
            padding also spaces the dots, so the row itself needs no gap. */}
        <div className="flex justify-center py-1">
          {slides.map((slide, index) => (
            <button
              key={slide.caption}
              type="button"
              aria-label={`Go to slide ${index + 1}: ${slide.caption}`}
              aria-current={index === activeSlide}
              className="flex h-11 items-center justify-center px-2 touch-manipulation"
              onClick={() => setActiveSlide(index)}
            >
              <span
                aria-hidden="true"
                className={`block h-2.5 rounded-full transition-all ${
                  index === activeSlide ? "w-8 bg-emerald-500" : "w-2.5 bg-slate-400/50 dark:bg-white/40"
                }`}
              />
            </button>
          ))}
        </div>
      </section>

      {/* A ribbon of its own, outside the slider panel: its own band, its own border, and three
          controls each in its own translucent tint. */}
      <div className="w-full border-y border-slate-200 bg-gradient-to-r from-emerald-50 via-sky-50 to-violet-50 dark:border-slate-800 dark:from-emerald-950/40 dark:via-sky-950/40 dark:to-violet-950/40">
        <div className="flex flex-wrap items-center justify-center gap-3 py-4">
          <a
            href="/signup"
            className="rounded-full border border-emerald-400/60 bg-emerald-500/15 px-5 py-2.5 font-medium text-emerald-800 backdrop-blur-sm transition hover:bg-emerald-500/25 dark:text-emerald-300"
          >
            Start free
          </a>
          <a
            href="/dashboard"
            className="rounded-full border border-sky-400/60 bg-sky-500/15 px-5 py-2.5 font-medium text-sky-800 backdrop-blur-sm transition hover:bg-sky-500/25 dark:text-sky-300"
          >
            Explore dashboard
          </a>
          <span className="rounded-full border border-violet-400/60 bg-violet-500/15 px-5 py-2.5 text-sm font-medium text-violet-800 backdrop-blur-sm dark:text-violet-300">
            AI stock research for Indian investors
          </span>
        </div>
      </div>
    </>
  );
}
