"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TickerTape } from "./hero-scenes";

const slides = [
  {
    title: "Every signal, gathered in one place",
    description:
      "From Sensex drawdowns to FII/DII flows — AI reads the charts and headlines of the Indian market so you don't have to.",
    image: "/hero/research-desk.webp",
  },
  {
    title: "Every stock, priced and tracked live",
    description:
      "Watch the Sensex move in real time against a live chart — the same view our AI reads before it calls a trend.",
    image: "/hero/trading-laptop.webp",
    withTicker: true,
  },
  {
    title: "Real BSE prices, decoded by AI",
    description:
      "From BSE scrip codes to a clear buy, hold, or avoid call — AI ranks the board every trading day.",
    image: "/hero/bse-ticker-board.webp",
  },
  {
    title: "Where breaking news becomes a trading signal",
    description:
      "From boardrooms to trading desks — AI turns policy shifts and earnings headlines into buy and sell calls in seconds.",
    image: "/hero/market-analysis.webp",
  },
];

export function HeroCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    // A setTimeout keyed off activeSlide (rather than a mount-time setInterval) means a
    // manual dot click resets the countdown too, instead of being overridden moments later
    // by a stale auto-advance tick.
    const timer = window.setTimeout(() => {
      setActiveSlide((previous) => (previous + 1) % slides.length);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [activeSlide]);

  return (
    <div className="relative w-full overflow-hidden bg-slate-950 text-white">
      {slides.map((slide, index) => (
        <div
          key={slide.title}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === activeSlide ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={slide.image}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
          />
          {slide.withTicker && <TickerTape />}
        </div>
      ))}
      <div className="relative mx-auto flex min-h-[460px] max-w-7xl flex-col justify-end px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
        <div className="max-w-2xl space-y-5">
          <span className="inline-flex w-fit rounded-full border border-emerald-400/40 bg-black/40 px-3 py-1 text-sm font-medium text-emerald-300 backdrop-blur-sm">
            AI stock research for Indian investors
          </span>
          <h1 className="text-4xl font-semibold leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] sm:text-5xl">
            {slides[activeSlide].title}
          </h1>
          <p className="max-w-xl text-lg text-slate-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">{slides[activeSlide].description}</p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/signup"
              className="rounded-full bg-emerald-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-400"
            >
              Start free
            </a>
            <a
              href="/dashboard"
              className="rounded-full border border-white/30 bg-black/40 px-5 py-3 font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              Explore dashboard
            </a>
          </div>
        </div>
        <div className="mt-8 flex gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              aria-label={`Go to slide ${index + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                index === activeSlide ? "w-8 bg-emerald-400" : "w-2.5 bg-white/50"
              }`}
              onClick={() => setActiveSlide(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
