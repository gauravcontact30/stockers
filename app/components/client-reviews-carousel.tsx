"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { type ClientReview } from "../lib/client-review";

const SLIDE_MS = 6000;

/**
 * The client reviews section: one review at a time, advancing on its own.
 *
 * Nothing here is invented. It renders what the admin has published and disappears when that is
 * empty, rather than padding the rotation with a sample testimonial.
 */

function Stars({ rating, className }: { rating: number; className: string }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`${className} ${index < rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`}
        >
          <path d="m10 1.7 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * The signature, treated as ink rather than as an image.
 *
 * Uploaded signatures are photographed or scanned on white, so dropped straight onto a card they
 * arrive as a pale rectangle with a visible edge. `mix-blend-multiply` lets the white fall away and
 * leaves only the stroke; in dark mode the same file is inverted to white ink and screened, so it
 * reads on a dark card instead of turning into a grey block. The rule and the caption above it give
 * the mark somewhere to sit, which is what makes it look signed rather than pasted.
 *
 * The mark is not lazy-loaded, and cannot be. A signature is sized `h-9 w-auto`, so until the file
 * arrives it has no intrinsic width and lays out as a zero-width box — and a box with no area never
 * satisfies the intersection check that triggers a lazy load. The image waits for a load that waits
 * for the image, and every review but the first one rendered as a bare rule with "Signed" under it.
 * `fetchPriority="low"` keeps it off the critical path without making its arrival conditional.
 */
function Signature({ review }: { review: ClientReview }) {
  return (
    // Set the way a signature actually sits on a document: the mark rests on a ruled line with its
    // caption beneath, the whole block flush right. Laid out as a row it had nothing to align to —
    // an uploaded scan and the drawn fallback have different intrinsic proportions, so one sat high
    // and the other low against the caption beside it. Bottom-aligning both to a shared rule makes
    // the two cases land identically whatever the source file looks like.
    <div className="flex w-28 flex-col items-end">
      {review.signatureImage ? (
        /* eslint-disable-next-line @next/next/no-img-element -- uploaded signatures live in public/uploads and may be PNG/WebP/SVG. */
        <img
          src={review.signatureImage}
          alt={`${review.name} signature`}
          className="h-9 w-auto max-w-full object-contain object-bottom mix-blend-multiply dark:mix-blend-screen dark:invert"
          fetchPriority="low"
        />
      ) : (
        <svg viewBox="0 0 180 48" className="h-9 w-full text-slate-800 dark:text-slate-100" role="img" aria-label={`${review.signature} signature`} preserveAspectRatio="xMaxYMax meet">
          <text x="176" y="36" textAnchor="end" className="fill-current text-[26px] italic tracking-wide" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {review.signature}
          </text>
        </svg>
      )}
      <span aria-hidden="true" className="mt-0.5 h-px w-full bg-slate-300 dark:bg-slate-600" />
      <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        Signed
      </span>
    </div>
  );
}

function Slide({ review }: { review: ClientReview }) {
  return (
    // One row rather than a stack: portrait and identity on the left, the quotation beside them.
    // Stacked, a single testimonial ran taller than the boards above it for one paragraph of text.
    <div className="relative flex h-full gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:gap-5 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${review.accent}`} />

      {/* The reviewer's column carries the credibility of the quote, so it is given real size:
          a portrait you can actually recognise a face in, and a name at reading weight. The
          portrait is eager for the same reason the signature is: every slide but the current one is
          translated out of the track and clipped away, so a lazy portrait is one the browser has no
          reason to fetch until the carousel happens to reach it — and the face is the whole point of
          the column. There are only ever a handful of reviews; low priority is enough. */}
      <div className="flex w-32 shrink-0 flex-col items-center pl-1 text-center sm:w-40">
        <span className={`inline-flex h-20 w-20 shrink-0 rounded-full bg-gradient-to-br p-[3px] sm:h-24 sm:w-24 ${review.accent}`}>
          {/* Through the optimiser rather than raw. These are phone-camera portraits somebody
              uploaded through the admin form — the two on the site are 481KB and 357KB — and they
              are drawn into a 90px circle. Served as-is that is most of a megabyte to paint a
              thumbnail; at this size, in AVIF, it is a few kilobytes each. `quality` is deliberately
              below the default: nothing at 90px across can show the difference. */}
          <Image
            src={review.photo}
            alt={`${review.name} reviewer profile`}
            width={96}
            height={96}
            quality={60}
            className="h-full w-full rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
            fetchPriority="low"
          />
        </span>
        <p className="mt-2.5 flex items-center justify-center gap-1 text-sm font-bold leading-tight text-slate-900 sm:text-base dark:text-white">
          <span className="truncate">{review.name}</span>
          <svg viewBox="0 0 20 20" aria-label="Verified reviewer" role="img" className="h-4 w-4 shrink-0 fill-emerald-500">
            <path d="M10 1.5 12 4l3.3-.3.4 3.3 2.6 2-1.7 2.8 1 3.2-3.2.9-1.6 2.9-3-1.4-3 1.4-1.6-2.9-3.2-.9 1-3.2L0.3 9l2.6-2 .4-3.3L6.6 4 10 1.5Zm-1 10.9 4.6-4.6-1.2-1.2L9 10l-1.7-1.7-1.2 1.2 2.9 2.9Z" />
          </svg>
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {review.role}, {review.location}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Stars rating={review.rating} className="h-3.5 w-3.5" />
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {review.comment}
        </p>
        <div className="mt-2 flex justify-end">
          <Signature review={review} />
        </div>
      </div>
    </div>
  );
}

export function ClientReviewsCarousel({ reviews }: { reviews: ClientReview[] }) {
  const [active, setActive] = useState(0);
  /** Autoplay stops while someone is reading — hovering, or tabbed into the controls. */
  const [paused, setPaused] = useState(false);

  const count = reviews.length;
  // Guards against the list shrinking under an index that has already advanced past the end.
  const index = count > 0 ? Math.min(active, count - 1) : 0;

  useEffect(() => {
    // Nothing to rotate through, or the visitor is reading: leave the slide where it is.
    if (paused || count <= 1) return;

    const timer = window.setTimeout(() => setActive((current) => (current + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count]);

  // Hooks run first so this early exit cannot change their order between renders.
  if (count === 0) return null;

  const average = reviews.reduce((total, review) => total + review.rating, 0) / count;
  const fiveStar = reviews.filter((review) => review.rating === 5).length;
  const step = (delta: number) => setActive((current) => (current + delta + count) % count);

  return (
    <section
      id="reviews"
      className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-[0_24px_80px_-38px_rgba(15,23,42,0.35)] transition-colors dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
    >
      {/* Header on one line: the label, the title and the score, with no bordered score box —
          the figure reads perfectly well against the surface and saves a row of chrome. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3 sm:px-7">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
              <path d="m10 1.7 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" />
            </svg>
            Client reviews
          </span>
          <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg dark:text-white">
            What investors say after using StockersAI
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">
            {average.toFixed(1)}
          </span>
          <Stars rating={Math.round(average)} className="h-3.5 w-3.5" />
          <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {count} verified {count === 1 ? "review" : "reviews"}
            {fiveStar > 0 && ` · ${fiveStar} rated 5★`}
          </span>
        </div>
      </div>

      <div
        className="px-5 pb-4 sm:px-7"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="overflow-hidden" aria-roledescription="carousel" aria-label="Client review carousel">
          <div
            className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {reviews.map((review, position) => (
              <div key={review.id} role="group" aria-hidden={position !== index} className="min-w-full px-0.5">
                <Slide review={review} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls are only worth drawing when there is somewhere to go. */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-slate-200 py-2.5 dark:border-slate-800">
          <button
            type="button"
            aria-label="Previous review"
            onClick={() => step(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex items-center">
            {reviews.map((review, position) => (
              <button
                key={review.id}
                type="button"
                aria-label={`Go to review ${position + 1}: ${review.name}`}
                aria-current={position === index}
                className="flex h-8 items-center justify-center px-1.5 touch-manipulation"
                onClick={() => setActive(position)}
              >
                <span
                  aria-hidden="true"
                  className={`block h-1.5 rounded-full transition-all ${position === index ? "w-6 bg-slate-800 dark:bg-white" : "w-1.5 bg-slate-300 dark:bg-slate-600"}`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="Next review"
            onClick={() => step(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
