// Buy / hold / sell, and what holding on for six months, a year, three or five would have to
// believe.
//
// `stock-verdicts.ts` answers the same question for the ~390 hand-classified names, from Yahoo
// history. This answers it for any of the ~4,900 BSE scrips, from the exchange's own Bhavcopy
// baselines — and adds the thing the intelligence search needs that no board had before: a
// separate call per holding period, because "worth owning for three years" and "worth owning this
// month" are different questions and a single stance answers neither well.
//
// Everything here is arithmetic. The stance is computed from measured returns and from the tone of
// the coverage that was actually fetched; the model is never asked what the call should be, only
// to explain a call already made. That is the whole reason a number on screen can be trusted:
//
//   * trailing returns are the exchange's closes, then against now;
//   * the news tilt counts words in headlines that were really published;
//   * the weights below are fixed and stated, so the same inputs always give the same call.
//
// None of which makes it a forecast of what a stock will do. It is a reading of what a stock has
// done and what is being written about it, expressed per holding period — and the panel that
// renders it says exactly that.

export type Stance = "Buy" | "Hold" | "Sell";

/** The windows the exchange archive can measure, shortest first. */
export type TrailingKey = "1w" | "1m" | "3m" | "6m" | "1y" | "3y" | "5y";

export type TrailingReturns = Partial<Record<TrailingKey, number | null>>;

export type NewsTilt = {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  /** 25 (uniformly negative) to 75 (uniformly positive); 50 when there is nothing to read. */
  score: number;
};

export type HorizonKey = "6m" | "1y" | "3y" | "5y";

export type HorizonOutlook = {
  key: HorizonKey;
  label: string;
  stance: Stance;
  /** 0-100. Not a probability — the weighted score the stance was read off. */
  conviction: number;
  /** The measured return over this same window, or null when the archive doesn't reach back. */
  trailing: number | null;
  /** That return as a compound annual rate, which is what makes windows comparable. */
  annualised: number | null;
  basis: string;
};

export type StockOutlook = {
  stance: Stance;
  conviction: number;
  /** The 0-100 momentum reading the short end of the call rests on. */
  momentum: number;
  news: NewsTilt;
  measured: TrailingReturns;
  horizons: HorizonOutlook[];
  basis: string;
};

// The same thresholds the dashboard's verdict panels use, so one company can't be a Buy on one
// screen and a Hold on another.
const BUY_ABOVE = 62;
const SELL_BELOW = 42;

export function stanceFor(score: number): Stance {
  if (score >= BUY_ABOVE) return "Buy";
  if (score < SELL_BELOW) return "Sell";
  return "Hold";
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

// Words that move a headline's tone. Deliberately the market-news lists, kept short and blunt:
// a classifier that hedges gives every stock a tilt of 50 and adds nothing to the call.
const POSITIVE_TERMS = [
  "rally", "surge", "gain", "jump", "rise", "soar", "record high", "upgrade", "beats", "profit",
  "strong", "growth", "bullish", "boost", "outperform", "win", "order", "expansion", "recovery",
  "dividend", "bonus", "buyback", "approval",
];

const NEGATIVE_TERMS = [
  "fall", "slump", "crash", "plunge", "drop", "decline", "slip", "loss", "downgrade", "weak",
  "bearish", "selloff", "sell-off", "cut", "miss", "probe", "fraud", "worst", "penalty", "default",
  "resign", "stake sale", "pledge",
];

/** One headline's direction, or null when it points neither way. */
export function headlineTone(title: string): 1 | -1 | 0 {
  const value = title.toLowerCase();
  const positives = POSITIVE_TERMS.filter((term) => value.includes(term)).length;
  const negatives = NEGATIVE_TERMS.filter((term) => value.includes(term)).length;
  if (positives > negatives) return 1;
  if (negatives > positives) return -1;
  return 0;
}

/**
 * How the week's coverage leans, as a score on the same 0-100 scale as everything else.
 *
 * Capped at ±25 around neutral on purpose: news is the softest of the three inputs — a headline is
 * a claim about a company, not a measurement of it — so it can tilt a call but never make one.
 */
export function newsTilt(titles: string[]): NewsTilt {
  let positive = 0;
  let negative = 0;

  for (const title of titles) {
    const tone = headlineTone(title);
    if (tone === 1) positive++;
    else if (tone === -1) negative++;
  }

  const total = titles.length;
  const neutral = total - positive - negative;
  const score = total === 0 ? 50 : 50 + ((positive - negative) / total) * 25;

  return { positive, negative, neutral, total, score: Math.round(score) };
}

// Momentum leans on the medium term for the same reason the verdict engine does: a week says
// little about whether to own something, six months and a year say most of it.
const MOMENTUM_WEIGHTS: { key: TrailingKey; weight: number }[] = [
  { key: "1w", weight: 0.1 },
  { key: "1m", weight: 0.2 },
  { key: "3m", weight: 0.2 },
  { key: "6m", weight: 0.25 },
  { key: "1y", weight: 0.25 },
];

/** 0-100 from the recent trend. 50 is "went nowhere", and is also what no history at all scores. */
export function momentumScore(returns: TrailingReturns): number {
  let weighted = 0;
  let covered = 0;

  for (const { key, weight } of MOMENTUM_WEIGHTS) {
    const value = returns[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    weighted += value * weight;
    covered += weight;
  }

  if (covered === 0) return 50;
  return Math.round(clamp(50 + (weighted / covered) * 1.5));
}

/** A total return over `years` as a compound annual rate — what makes 3Y and 5Y comparable. */
export function annualise(totalPercent: number | null | undefined, years: number): number | null {
  if (typeof totalPercent !== "number" || !Number.isFinite(totalPercent)) return null;
  // A scrip down more than 100% is not a thing the archive can produce, but a bad baseline could
  // make it look like one, and a fractional power of a negative base is NaN.
  const growth = 1 + totalPercent / 100;
  if (growth <= 0) return -100;
  return (Math.pow(growth, 1 / years) - 1) * 100;
}

/**
 * The long record, scored.
 *
 * Three points of score per point of annual return, against momentum's 1.5: over years, the
 * difference between compounding at 8% and at 22% is the whole decision, and a scale that treats
 * it as a fourteen-point nudge would flatten it into nothing.
 */
export function recordScore(annualisedPercent: number | null): number {
  if (annualisedPercent === null) return 50;
  return Math.round(clamp(50 + annualisedPercent * 3));
}

type HorizonSpec = {
  key: HorizonKey;
  label: string;
  /** The window whose measured return stands in for the company's record at this horizon. */
  trailing: TrailingKey;
  years: number;
  weights: { momentum: number; record: number; news: number };
};

/**
 * The four holding periods, and what each one should weigh.
 *
 * The shift across the table is the point of it: a six-month view is mostly "what is it doing
 * now", a five-year view is mostly "what has it done for five years", and today's headlines matter
 * least exactly where they should — over the longest hold.
 */
export const HORIZONS: HorizonSpec[] = [
  { key: "6m", label: "Hold 6 months", trailing: "6m", years: 0.5, weights: { momentum: 0.5, record: 0.3, news: 0.2 } },
  { key: "1y", label: "Hold 1 year", trailing: "1y", years: 1, weights: { momentum: 0.4, record: 0.42, news: 0.18 } },
  { key: "3y", label: "Hold 3 years", trailing: "3y", years: 3, weights: { momentum: 0.25, record: 0.63, news: 0.12 } },
  { key: "5y", label: "Hold 5 years", trailing: "5y", years: 5, weights: { momentum: 0.15, record: 0.77, news: 0.08 } },
];

function percent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no reading";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const WINDOW_WORDS: Record<TrailingKey, string> = {
  "1w": "a week",
  "1m": "a month",
  "3m": "three months",
  "6m": "six months",
  "1y": "a year",
  "3y": "three years",
  "5y": "five years",
};

/** One holding period's call, and the measured line that produced it. */
export function horizonOutlook(spec: HorizonSpec, returns: TrailingReturns, momentum: number, news: NewsTilt): HorizonOutlook {
  const trailing = returns[spec.trailing] ?? null;
  const annualised = annualise(trailing, spec.years);
  const record = recordScore(annualised);

  const conviction = Math.round(
    momentum * spec.weights.momentum + record * spec.weights.record + news.score * spec.weights.news,
  );
  const stance = stanceFor(conviction);

  // The basis says which of the three inputs is missing rather than quietly scoring it as neutral,
  // because "no reading" and "flat" are very different things to a reader deciding on five years.
  const basis =
    trailing === null
      ? `No ${WINDOW_WORDS[spec.trailing]} of price history for this scrip, so this rests on the recent trend (${momentum}/100) and on ${news.total} report${news.total === 1 ? "" : "s"}.`
      : `${percent(trailing)} over ${WINDOW_WORDS[spec.trailing]} — ${percent(annualised)} a year — with the recent trend at ${momentum}/100 and coverage at ${news.score}/100.`;

  return { key: spec.key, label: spec.label, stance, conviction, trailing, annualised, basis };
}

function overallBasis(stance: Stance, returns: TrailingReturns, news: NewsTilt): string {
  const trend =
    stance === "Buy" ? "Momentum is with it" : stance === "Sell" ? "The trend is against it" : "It is holding its ground";

  const coverage =
    news.total === 0
      ? "with nothing published under this filter"
      : `across ${news.total} report${news.total === 1 ? "" : "s"} (${news.positive} positive, ${news.negative} negative)`;

  return `${trend}: ${percent(returns["3m"] ?? null)} over three months, ${percent(returns["1y"] ?? null)} over a year and ${percent(returns["3y"] ?? null)} over three — ${coverage}.`;
}

/**
 * The whole read: one standing call, and one call per holding period.
 *
 * The headline stance is the one-year horizon's, not an average of the four. A single blended
 * number would call a stock a Hold when it is a clear Buy for five years and a clear Sell for six
 * months, which is the one answer that helps nobody.
 */
export function buildOutlook(returns: TrailingReturns, headlines: string[]): StockOutlook {
  const news = newsTilt(headlines);
  const momentum = momentumScore(returns);
  const horizons = HORIZONS.map((spec) => horizonOutlook(spec, returns, momentum, news));
  const oneYear = horizons.find((horizon) => horizon.key === "1y") as HorizonOutlook;

  return {
    stance: oneYear.stance,
    conviction: oneYear.conviction,
    momentum,
    news,
    measured: returns,
    horizons,
    basis: overallBasis(oneYear.stance, returns, news),
  };
}
