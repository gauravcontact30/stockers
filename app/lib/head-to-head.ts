// Human against the machine, over five stocks each.
//
// A visitor picks five companies off the exchange, the AI picks five of its own, and both sides are
// graded by the same arithmetic on the same day. The whole point is that the reader can lose — and
// can also win — so two rules hold this file together:
//
//   1. Both sides are scored by exactly one function, `momentumScore`, the same one the compare
//      tables and sector showdowns already use. Neither side gets a formula of its own.
//   2. The AI does *not* pick by that formula. It picks with one of the skills in `AI_SKILLS`,
//      each of which reads the exchange's long-run record and its own forward view — never the
//      weighted window the grader uses. If it ranked candidates by the grading function it would be
//      marking its own homework, would win every match, and the feature would be a rigged demo
//      rather than a contest.
//
// The skill is drawn at random per match and the five are sampled from its shortlist rather than
// taken straight off the top, so the same day's data does not field the same team twice. That
// randomness is injected, not reached for, which is what lets the selection be tested.
//
// Everything here is pure: summaries and predictions in, a result out. No fetching, no clock, no
// storage. That is what lets the scoring be checked directly rather than through a rendered card.
//
// This half is deliberately client-safe: every import below is `import type`, so nothing survives
// compilation and the landing page's card can share these types and this constant without dragging
// the market-data stack into the browser bundle. The scoring itself needs `momentumScore`, which
// reaches `next/cache` through its own module, so it lives in ./head-to-head-score and is only ever
// imported by the route. Putting the two in one file put ~250KB of server code in the client
// bundle of the page this feature was added to.

import type { Outlook, Prediction } from "./daily-predictions";

/** How many companies each side fields. */
export const HEAD_TO_HEAD_PICKS = 5;

/**
 * One stock on one side of the match, with the figures the card shows for it.
 *
 * The four return windows are exactly the four `momentumScore` weighs, and they are carried so the
 * card can show them. A score with no workings behind it is something a reader has to take on
 * trust; the same score beside the four numbers it was computed from can be argued with.
 */
export type Contender = {
  symbol: string;
  name: string | null;
  price: number | null;
  /** Today's move, as a percentage. */
  oneDay: number | null;
  oneWeek: number | null;
  oneMonth: number | null;
  threeMonth: number | null;
  sixMonth: number | null;
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
  /** Since the earliest close the exchange has for it. */
  overall: number | null;
  capTier: string | null;
  /** The industry the exchange files it under, as the catalogue spells it. */
  sector: string | null;
  /** 0-100, from the shared momentum engine. 50 is "went nowhere". */
  score: number;
};

/**
 * The four windows the score is actually computed from.
 *
 * The card shows every window above, but only these four carry weight — so they are named here and
 * marked on screen. A reader looking at a five-year return next to a score deserves to know the
 * score never read it.
 */
export const SCORING_WINDOWS: (keyof Contender)[] = ["oneWeek", "oneMonth", "sixMonth", "oneYear"];

export type Side = {
  picks: Contender[];
  /** The side's score: the mean of its five, rounded. */
  score: number;
};

export type Verdict = "human" | "ai" | "draw";

export type MatchResult = {
  human: Side;
  ai: Side;
  winner: Verdict;
  /** Absolute points between the two sides, so the card can say "by 7". */
  margin: number;
  /** Whether the AI's five came from the model or from the heuristic fallback. */
  aiSource: "ai" | "heuristic";
  /** The lens the AI picked with this time, so the card can say how it was thinking. */
  aiSkill: { key: string; label: string; blurb: string };
};

/** How convincing an outlook is, before confidence is used to separate equals. */
const OUTLOOK_RANK: Record<Outlook, number> = { Bullish: 2, Neutral: 1, Bearish: 0 };

/**
 * One company the AI may field, as the exchange and the forecast together describe it.
 *
 * `longRun` is the return the whole-exchange board was ranked by — years, not today — which is what
 * "based on overall performance" means here. `outlook` and `confidence` are the forward half: what
 * the desk expects next, rather than what already happened.
 */
export type AiCandidate = {
  symbol: string;
  name: string | null;
  capTier: string | null;
  sector: string | null;
  /** Long-run return, as a percentage. Null when the exchange has no history for it. */
  longRun: number | null;
  /** Today's move, for the skills that care about the entry rather than the company. */
  today: number | null;
  outlook: Outlook | null;
  /** 0-100. Zero when nothing has an opinion on this name. */
  confidence: number;
};

/**
 * One way of thinking about which five to field.
 *
 * Five genuinely different arguments, not five weightings of the same one: compounding, buying
 * weakness, backing conviction, spreading risk, and hunting outside the megacaps. Every one of them
 * blends the long-run record with the forward view, and none of them touches the 1w/1m/6m/1y
 * weighting the grader uses — that separation is what keeps the contest winnable.
 */
export type AiSkill = {
  key: string;
  /** Shown to the reader on the result card. */
  label: string;
  blurb: string;
  /** Higher is better. Candidates are ranked by this, then sampled. */
  rank: (candidate: AiCandidate) => number;
  /** Which candidates this skill will consider at all. Defaults to all of them. */
  eligible?: (candidate: AiCandidate) => boolean;
  /** True when the skill wants at most one name per sector. */
  spread?: boolean;
};

/** Forward conviction as a single number: a bullish 80 beats a neutral 90 beats a bearish 99. */
function conviction(candidate: AiCandidate): number {
  const rank = candidate.outlook ? OUTLOOK_RANK[candidate.outlook] : 1;
  return rank * 1000 + candidate.confidence;
}

export const AI_SKILLS: AiSkill[] = [
  {
    key: "compounder",
    label: "Long-run compounder",
    blurb: "Ranked on what each company has actually compounded over the exchange's full history, with a forward view that has not turned.",
    rank: (candidate) => (candidate.longRun ?? 0) + candidate.confidence,
    // A bearish forecast disqualifies a good record: the record is the reason to look, not to buy.
    eligible: (candidate) => candidate.outlook !== "Bearish",
  },
  {
    key: "contrarian",
    label: "Contrarian buyer",
    blurb: "Strong long-run records that are having a bad day — the AI buying weakness in companies it still rates.",
    rank: (candidate) => (candidate.longRun ?? 0) - (candidate.today ?? 0) * 12,
    eligible: (candidate) => candidate.outlook !== "Bearish" && (candidate.today ?? 0) <= 0,
  },
  {
    key: "conviction",
    label: "Conviction backer",
    blurb: "Whatever the desk is most confident about for the sessions ahead, with the long record only breaking ties.",
    rank: (candidate) => conviction(candidate) * 10 + (candidate.longRun ?? 0),
  },
  {
    key: "spread",
    label: "Diversifier",
    blurb: "One name per sector, best of each — a portfolio built so a single bad industry cannot sink it.",
    rank: (candidate) => (candidate.longRun ?? 0) + candidate.confidence,
    eligible: (candidate) => candidate.outlook !== "Bearish",
    spread: true,
  },
  {
    key: "explorer",
    label: "Small-cap explorer",
    blurb: "Outside the megacaps: mid and small companies with long records the index crowd tends to miss.",
    rank: (candidate) => (candidate.longRun ?? 0) + candidate.confidence * 2,
    eligible: (candidate) => {
      const tier = candidate.capTier?.toLowerCase();
      return tier !== "large" && candidate.outlook !== "Bearish";
    },
  },
];

/** How many of the skill's best are put in the hat before five are drawn. */
const SHORTLIST = 20;

/** The skill for one match. `random` is injected so a test can pin the draw. */
export function pickAiSkill(random: () => number = Math.random): AiSkill {
  const index = Math.min(AI_SKILLS.length - 1, Math.floor(random() * AI_SKILLS.length));
  return AI_SKILLS[index];
}

/**
 * Draws `count` from a ranked shortlist, favouring the top without being bound to it.
 *
 * Weight falls as 1/sqrt(rank+1), so the best name is still picked most often but the twentieth
 * turns up often enough to matter. A steeper 1/(rank+1) curve concentrated so hard on the first
 * two or three that two matches in a row fielded much the same team — which is the thing this
 * function exists to prevent. Taking the top five outright would be worse again.
 */
export function weightedSample<T>(ranked: T[], count: number, random: () => number): T[] {
  const pool = [...ranked];
  const drawn: T[] = [];

  while (drawn.length < count && pool.length > 0) {
    const weights = pool.map((_, index) => 1 / Math.sqrt(index + 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    let ticket = random() * total;
    let chosen = pool.length - 1;
    for (let index = 0; index < pool.length; index++) {
      ticket -= weights[index];
      if (ticket <= 0) {
        chosen = index;
        break;
      }
    }

    drawn.push(pool[chosen]);
    pool.splice(chosen, 1);
  }

  return drawn;
}

/**
 * Who took it.
 *
 * Compared on the rounded scores the reader is actually shown, so a card never reads "68 vs 68 —
 * AI wins" off a hundredth of a point they cannot see.
 */
export function decideWinner(humanScore: number, aiScore: number): Verdict {
  if (humanScore === aiScore) return "draw";
  return humanScore > aiScore ? "human" : "ai";
}

/** Keeps a skill that asked for spread to one name per sector, best of each, unknowns kept apart. */
function oneEach(ranked: AiCandidate[]): AiCandidate[] {
  const seen = new Set<string>();

  return ranked.filter((candidate) => {
    // A missing sector is its own bucket per company rather than one shared "unknown" bucket —
    // otherwise four unclassified scrips would compete for a single slot.
    const bucket = candidate.sector?.toLowerCase() ?? `unknown:${candidate.symbol}`;
    if (seen.has(bucket)) return false;
    seen.add(bucket);
    return true;
  });
}

/**
 * The AI's five, chosen with one skill.
 *
 * The skill decides who is eligible and how they rank; the sample decides which of its best
 * actually get fielded. Ties inside the ranking break on the symbol so the ordering is stable, and
 * everything random arrives through `random` — the route passes `Math.random`, a test passes a
 * sequence, and neither the ranking nor the shortlist changes between them.
 *
 * `exclude` keeps the AI off the human's own picks. Fielding the same company on both sides is a
 * guaranteed draw on that row and reads, wrongly, as the AI copying its opponent.
 */
export function chooseAiPicks(
  candidates: AiCandidate[],
  {
    skill,
    exclude = [],
    count = HEAD_TO_HEAD_PICKS,
    random = Math.random,
    shortlist = SHORTLIST,
  }: {
    skill: AiSkill;
    exclude?: string[];
    count?: number;
    random?: () => number;
    shortlist?: number;
  },
): string[] {
  const barred = new Set(exclude.map((symbol) => symbol.toUpperCase()));

  const eligible = candidates
    .filter((candidate) => !barred.has(candidate.symbol.toUpperCase()))
    .filter((candidate) => (skill.eligible ? skill.eligible(candidate) : true))
    .sort((a, b) => skill.rank(b) - skill.rank(a) || a.symbol.localeCompare(b.symbol));

  const pool = skill.spread ? oneEach(eligible) : eligible;

  // A skill can filter itself down to nothing — "contrarian" on a day the whole exchange is up,
  // say. Falling back to the unfiltered field is better than fielding four names, and better than
  // failing the match over a taste in stocks.
  const drawn = weightedSample(pool.slice(0, shortlist), count, random);
  if (drawn.length === count) return drawn.map((candidate) => candidate.symbol);

  const already = new Set(drawn.map((candidate) => candidate.symbol));
  const filler = candidates
    .filter((candidate) => !barred.has(candidate.symbol.toUpperCase()) && !already.has(candidate.symbol))
    .sort((a, b) => skill.rank(b) - skill.rank(a) || a.symbol.localeCompare(b.symbol))
    .slice(0, count - drawn.length);

  return [...drawn, ...filler].map((candidate) => candidate.symbol);
}

/** The five symbols a submitted line-up actually amounts to: upper-cased, de-duplicated, trimmed. */
export function normalisePicks(input: unknown, limit = HEAD_TO_HEAD_PICKS): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const picks: string[] = [];

  for (const value of input) {
    if (typeof value !== "string") continue;
    const symbol = value.trim().toUpperCase();
    // The same company twice is one pick, not two — otherwise a side could field one stock five
    // times and have the mean report it as a five-strong team.
    if (!symbol || seen.has(symbol)) continue;

    seen.add(symbol);
    picks.push(symbol);
    if (picks.length === limit) break;
  }

  return picks;
}
