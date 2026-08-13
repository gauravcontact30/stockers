// What each AI feature costs, in plans.
//
// This module is deliberately free of Node and Next imports. The server needs it to decide whether
// a request may proceed, and the browser needs it to decide whether to blur a panel — and those two
// answers must come from the same table. A tier duplicated across a client copy and a server copy
// is a paywall that disagrees with the pricing page the moment either is edited.
//
// Nothing here reads the environment or the filesystem, so it is safe to import from a client
// component, a route handler, or a server-rendered page alike.

import type { PlanName } from "./auth-validation";

/** The three priced tiers, cheapest first. */
export type PlanTier = "starter" | "pro" | "elite";

export const PLAN_TIERS: PlanTier[] = ["starter", "pro", "elite"];

/**
 * Tiers as numbers, because a higher tier grants everything below it.
 *
 * Modelling this as a rank rather than a set of features per plan is what stops "Everything in
 * Starter" on the pricing page from becoming a list somebody has to remember to extend.
 */
export const TIER_RANK: Record<PlanTier, number> = { starter: 1, pro: 2, elite: 3 };

/** The name a tier is sold under — what a pill on a locked feature reads. */
export const TIER_LABEL: Record<PlanTier, PlanName> = { starter: "Starter", pro: "Pro", elite: "Elite" };

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "starter" || value === "pro" || value === "elite";
}

/**
 * The tier an account's stored plan grants.
 *
 * Tolerant of a plan string this build does not know: an account record written by an older or
 * newer version of the app resolves to the lowest tier rather than throwing, because the worst
 * outcome here should be "shown an upsell", never "the dashboard fails to render".
 */
export function tierForPlan(plan: string | null | undefined): PlanTier {
  if (plan === "Elite") return "elite";
  if (plan === "Pro") return "pro";
  return "starter";
}

/** Whether a held tier covers one that a feature requires. A null holding covers nothing. */
export function tierAtLeast(held: PlanTier | null | undefined, required: PlanTier): boolean {
  return held ? TIER_RANK[held] >= TIER_RANK[required] : false;
}

// ---------------------------------------------------------------------------
// The features themselves
// ---------------------------------------------------------------------------

export type AiFeature = {
  key: string;
  /** The admin-facing name of the feature, shown on a lock panel and in the admin switch list. */
  label: string;
  /** The lowest plan that unlocks it. */
  tier: PlanTier;
  /** One line a prospective subscriber can read, used on the landing page's plan cards. */
  blurb: string;
};

/**
 * Every AI-backed surface, grouped by the plan that buys it.
 *
 * The split is even by design — six each — so no tier looks like an afterthought on the pricing
 * page. Within a tier the grouping is by the kind of question the feature answers: Starter reports
 * what the market did, Pro makes a call on it, Elite goes looking.
 *
 * The exchange data under a board is not what a tier buys. Every board's public figures stay
 * visible to everyone (see the `gate: false` sections in ../components/dashboard-sidebar); what a
 * plan unlocks is the AI layer reading them.
 */
export const AI_FEATURES = [
  // Starter — the standing boards and calendars: the session as the exchanges published it.
  {
    key: "market-pulse",
    label: "AI market pulse",
    tier: "starter",
    blurb: "Live indices and breadth with an AI read on the day's mood.",
  },
  {
    key: "sectors",
    label: "AI sector rotation",
    tier: "starter",
    blurb: "Every NSE sectoral index, ranked by today's move.",
  },
  {
    key: "dividends",
    label: "AI dividend planner",
    tier: "starter",
    blurb: "Declared payouts and the ex-dates still ahead of you.",
  },
  {
    key: "ipos",
    label: "AI IPO watch",
    tier: "starter",
    blurb: "Open and upcoming issues with live subscription figures.",
  },
  {
    key: "etf-board",
    label: "AI ETF board",
    tier: "starter",
    blurb: "Every NSE ETF by asset class, ranked by money traded.",
  },
  {
    key: "news",
    label: "AI market news",
    tier: "starter",
    blurb: "The day's headlines, summarised and scored for sentiment.",
  },

  // Pro — the screeners and the research desk: the AI taking a position, not reporting one.
  {
    key: "top-picks",
    label: "Today's AI picks",
    tier: "pro",
    blurb: "The stocks our agent rates highest right now.",
  },
  {
    key: "buy-tomorrow",
    label: "Outperform tomorrow screener",
    tier: "pro",
    blurb: "Names set up for tomorrow's session, scored overnight.",
  },
  {
    key: "dip-winners",
    label: "Today's dip screener",
    tier: "pro",
    blurb: "Pullbacks whose longer trend is still intact.",
  },
  {
    key: "research",
    label: "AI stock research",
    tier: "pro",
    blurb: "One company in depth, with predictions and news sentiment.",
  },
  {
    key: "compare",
    label: "AI stock compare",
    tier: "pro",
    blurb: "Two or three stocks head to head, with a call on each.",
  },
  {
    key: "portfolio",
    label: "AI portfolio review",
    tier: "pro",
    blurb: "Your own holdings, tracked live, with an AI read on the mix and a call on each name.",
  },

  // Elite — ask-anything, the full directory, and the flow, margin and filings reads.
  {
    key: "intel",
    label: "AI intelligence search",
    tier: "elite",
    blurb: "Ask anything about a BSE stock; get the answer in points, with sources.",
  },
  {
    key: "etf-research",
    label: "AI ETF research",
    tier: "elite",
    blurb: "Every major Indian ETF, decoded by AI.",
  },
  {
    key: "directory",
    label: "AI company directory",
    tier: "elite",
    blurb: "All 4,900+ listed companies by name, ticker, code or ISIN.",
  },
  {
    key: "most-traded",
    label: "AI most-traded read",
    tier: "elite",
    blurb: "Where the day's money actually went, by turnover.",
  },
  {
    key: "mtf",
    label: "AI MTF watch",
    tier: "elite",
    blurb: "Most-traded names you can outperform on margin, and the cost.",
  },
  {
    key: "stock-news",
    label: "AI filings digest",
    tier: "elite",
    blurb: "Today's corporate filings, grouped by sector.",
  },
] as const;

export type FeatureKey = (typeof AI_FEATURES)[number]["key"];

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && AI_FEATURES.some((feature) => feature.key === value);
}

/** Every feature keyed by name, so a lookup needs no scan and no "not found" branch. */
export const FEATURE_BY_KEY = Object.fromEntries(AI_FEATURES.map((feature) => [feature.key, feature])) as Record<
  FeatureKey,
  AiFeature
>;

/** The tier a feature needs, or null when the key is not one this app gates. */
export function featureTier(feature: string): PlanTier | null {
  return isFeatureKey(feature) ? FEATURE_BY_KEY[feature].tier : null;
}

/** Features first introduced at one tier, in the order they are listed above. */
export function featuresIntroducedAtTier(tier: PlanTier): AiFeature[] {
  return AI_FEATURES.filter((feature) => feature.tier === tier);
}

/** Everything one tier includes outright, including the lower tiers bundled into it. */
export function featuresForTier(tier: PlanTier): AiFeature[] {
  return AI_FEATURES.filter((feature) => tierAtLeast(tier, feature.tier));
}

/**
 * The three features each plan leads with, best first.
 *
 * The landing page stars these — three, two and one — so a reader skimming a plan card sees what
 * it is actually for before reading the full list under it. Ordered by how much of the plan's case
 * each one carries, which is a marketing judgement and belongs in one place rather than in JSX.
 */
export const PLAN_HIGHLIGHTS: Record<PlanTier, FeatureKey[]> = {
  starter: ["market-pulse", "sectors", "dividends"],
  pro: ["top-picks", "research", "compare"],
  elite: ["intel", "directory", "etf-research"],
};

/**
 * How many stars a feature carries on its plan card: 3 for the plan's headline feature down to 1,
 * and 0 for everything that is not one of its three highlights.
 */
export function starsFor(tier: PlanTier, feature: string): number {
  const index = PLAN_HIGHLIGHTS[tier].indexOf(feature as FeatureKey);
  return index === -1 ? 0 : PLAN_HIGHLIGHTS[tier].length - index;
}
