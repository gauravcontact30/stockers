"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CLIENT_REVIEWS, type ClientReview } from "../lib/client-review-defaults";

const SLIDE_MS = 5200;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          className={`h-4 w-4 ${index < rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`}
          aria-hidden="true"
        >
          <path d="m10 1.7 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" />
        </svg>
      ))}
    </div>
  );
}

function ProfileImage({ review }: { review: ClientReview }) {
  return (
    <div className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${review.accent} p-[3px] shadow-[0_20px_42px_-24px_rgba(15,23,42,0.9)]`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- reviewer photos are external visual placeholders, not app-owned assets. */}
      <img
        src={review.photo}
        alt={`${review.name} reviewer profile`}
        className="h-full w-full rounded-[14px] object-cover"
        loading="lazy"
      />
    </div>
  );
}

function Signature({ review }: { review: ClientReview }) {
  if (review.signatureImage) {
    return (
      <div className="flex justify-end">
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded signatures live in public/uploads and may be PNG/WebP/SVG. */}
        <img src={review.signatureImage} alt={`${review.name} signature`} className="h-14 max-w-40 object-contain" loading="lazy" />
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <svg viewBox="0 0 172 58" className="h-14 w-40 text-slate-900 dark:text-white" role="img" aria-label={`${review.signature} signature`}>
        <path d="M10 42c18-13 30-18 36-15 5 2 1 12-6 16 14-18 25-25 33-22 7 3 3 16-7 21 17-20 31-26 42-18 8 6 15 8 27-3 10-8 18-10 27-6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
        <path d="M82 45c18 5 42 5 72 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.18" />
        <text x="106" y="35" textAnchor="middle" className="fill-current text-[21px] italic tracking-wide">
          {review.signature}
        </text>
      </svg>
    </div>
  );
}

export function ClientReviewsCarousel({ initialReviews = DEFAULT_CLIENT_REVIEWS }: { initialReviews?: ClientReview[] }) {
  const [reviews, setReviews] = useState<ClientReview[]>(initialReviews.length ? initialReviews : DEFAULT_CLIENT_REVIEWS);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (initialReviews.length) return;

    let cancelled = false;
    fetch("/api/client-reviews")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as { reviews?: ClientReview[] };
      })
      .then((data) => {
        if (!cancelled && data.reviews?.length) {
          setReviews(data.reviews);
          setActive(0);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [initialReviews.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % reviews.length);
    }, SLIDE_MS);

    return () => window.clearTimeout(timer);
  }, [active, reviews.length]);

  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
    : 0;

  return (
    <section className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.45)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-slate-200 bg-gradient-to-br from-rose-50 via-white to-emerald-50 p-6 sm:p-8 lg:border-r lg:border-b-0 dark:border-slate-800 dark:from-rose-500/10 dark:via-slate-900 dark:to-emerald-500/10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-300">Client reviews</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Indian investors reading the market with Stockers.AI</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Representative feedback from retail-investor workflows across research, screeners, ETFs, dividends and market pulse.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 dark:border-rose-500/30 dark:bg-slate-950/50">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{reviews.length}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reviews</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white/80 p-3 dark:border-amber-500/30 dark:bg-slate-950/50">
              <p className="text-xl font-bold text-slate-900 dark:text-white">{averageRating.toFixed(1)}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rating</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white/80 p-3 dark:border-emerald-500/30 dark:bg-slate-950/50">
              <p className="text-xl font-bold text-slate-900 dark:text-white">IN</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Markets</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-6 sm:p-8" aria-roledescription="carousel" aria-label="Client review carousel">
          <div
            className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {reviews.map((review, index) => (
              <article
                key={review.id}
                aria-hidden={index !== active}
                className="min-w-full"
              >
                <div className="relative flex min-h-[390px] flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-[0_20px_60px_-36px_rgba(15,23,42,0.55)] sm:p-6 dark:border-slate-800 dark:bg-slate-950/60">
                  <div aria-hidden="true" className={`absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br ${review.accent} opacity-20 blur-2xl`} />
                  <div aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-rose-500 via-amber-400 to-emerald-500" />

                  <div className="relative">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-4">
                        <ProfileImage review={review} />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{review.name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {review.role}, {review.location}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-full border border-amber-200 bg-white px-3 py-2 shadow-sm dark:border-amber-500/25 dark:bg-slate-900">
                        <Stars rating={review.rating} />
                      </div>
                    </div>

                    <div className="mt-8 flex gap-4">
                      <span aria-hidden="true" className="font-serif text-6xl leading-none text-rose-200 dark:text-rose-500/25">
                        &ldquo;
                      </span>
                      <p className="pt-2 text-lg leading-8 text-slate-700 dark:text-slate-200">{review.comment}</p>
                    </div>
                  </div>

                  <div className="relative flex items-end justify-between gap-4 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                      Reviewer note
                    </p>
                    <Signature review={review} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center border-t border-slate-200 bg-slate-50/80 py-2 dark:border-slate-800 dark:bg-slate-950/45">
        {reviews.map((review, index) => (
          <button
            key={review.name}
            type="button"
            aria-label={`Go to review ${index + 1}: ${review.name}`}
            aria-current={index === active}
            className="flex h-10 items-center justify-center px-2 touch-manipulation"
            onClick={() => setActive(index)}
          >
            <span
              aria-hidden="true"
              className={`block h-2.5 rounded-full transition-all ${index === active ? "w-8 bg-rose-500" : "w-2.5 bg-slate-300 dark:bg-slate-600"}`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
