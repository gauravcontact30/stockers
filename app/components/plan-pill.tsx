// The plan badge, in the three forms the app needs it: an inline pill, a corner ribbon, and a star
// rating.
//
// One file so a tier looks the same everywhere it appears — the sidebar, the lock overlay and the
// landing page all read from the same palette. The colours match the pricing table's own chrome
// (sky for Starter, emerald for Pro, violet for Elite) so a reader who has seen the plans once
// recognises a tier without reading the word.

import { TIER_LABEL, type PlanTier } from "../lib/plan-tiers";

type PlanChrome = {
  /** The pill: filled, because it has to read as a label rather than as a button. */
  pill: string;
  /** The ribbon corner, which sits over a blurred panel and needs the higher contrast. */
  ribbon: string;
  /** The outer corner crop and border tint for the diagonal ribbon. */
  ribbonFrame: string;
  /** Card chrome for the landing page's plan sections — deliberately pale. */
  card: string;
  /** Text accent for a heading or a star. */
  accent: string;
};

export const TIER_CHROME: Record<PlanTier, PlanChrome> = {
  starter: {
    pill: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
    ribbon: "bg-sky-100 text-sky-800 dark:bg-sky-400/25 dark:text-sky-100",
    ribbonFrame: "text-sky-800 dark:text-sky-100",
    card: "border-sky-200 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-500/10",
    accent: "text-sky-700 dark:text-sky-300",
  },
  pro: {
    pill: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    ribbon: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/25 dark:text-emerald-100",
    ribbonFrame: "text-emerald-800 dark:text-emerald-100",
    card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  elite: {
    pill: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300",
    ribbon: "bg-violet-100 text-violet-800 dark:bg-violet-400/25 dark:text-violet-100",
    ribbonFrame: "text-violet-800 dark:text-violet-100",
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-500/25 dark:bg-violet-500/10",
    accent: "text-violet-700 dark:text-violet-300",
  },
};

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}

/**
 * The tier badge as an inline pill.
 *
 * `locked` adds a padlock — the same pill labels a feature the reader has (in the sidebar) and one
 * they do not (on the blur overlay), and those must not look identical.
 */
export function PlanPill({
  tier,
  locked = false,
  className = "",
}: {
  tier: PlanTier;
  locked?: boolean;
  className?: string;
}) {
  const label = TIER_LABEL[tier];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${TIER_CHROME[tier].pill} ${className}`}
      title={locked ? `${label} plan required` : `Included in ${label}`}
    >
      {locked && <LockIcon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

/**
 * The same badge pinned to a card's top-right corner.
 *
 * Absolutely positioned, so whatever it is placed in needs `relative` — and it sits above the
 * blurred preview rather than inside it, which is the whole point of it being a separate element.
 */
export function PlanRibbon({ tier, locked = false }: { tier: PlanTier; locked?: boolean }) {
  const label = TIER_LABEL[tier];

  return (
    <span
      className={`pointer-events-none absolute right-0 top-0 z-30 block h-28 w-28 overflow-hidden rounded-tr-[28px] ${TIER_CHROME[tier].ribbonFrame}`}
      aria-label={`${label} plan`}
      title={`${label} plan`}
    >
      <span
        className={`absolute left-1 top-7 flex w-36 rotate-45 items-center justify-center gap-1 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] shadow-[0_10px_22px_-12px_rgba(15,23,42,0.9)] ${TIER_CHROME[tier].ribbon}`}
        aria-hidden="true"
      >
        {locked ? (
          <LockIcon className="h-3 w-3" />
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="m10 1.6 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L10 1.6Z" />
          </svg>
        )}
        {label}
      </span>
    </span>
  );
}

function Star({ filled, className = "" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 ${className}`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8Z" />
    </svg>
  );
}

/**
 * A feature's rating within its plan, out of three.
 *
 * The stars rank a plan's own highlights against each other — three for the feature that most
 * makes the case for that plan — so they are never a quality score for the feature in the
 * abstract, and are only rendered for the three that carry one.
 */
export function StarRating({ stars, tier, total = 3 }: { stars: number; tier: PlanTier; total?: number }) {
  if (stars <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${TIER_CHROME[tier].accent}`}
      role="img"
      aria-label={`${stars} out of ${total} stars`}
    >
      {Array.from({ length: total }, (_, index) => (
        <Star key={index} filled={index < stars} />
      ))}
    </span>
  );
}
