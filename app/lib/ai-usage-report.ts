// What the model has actually been doing — the pure half.
//
// ---------------------------------------------------------------------------
// The gap this closes
// ---------------------------------------------------------------------------
//
// This application is an AI research product, and until now the super admin dashboard could say
// exactly one thing about the model: whether `OPENROUTER_API_KEY` was set. That is the least
// interesting question about it. The ones an operator actually has are:
//
//   * Is the model answering at all, or has every panel quietly been composing its own read for
//     the last three hours because OpenRouter is returning 429s?
//   * What is it costing, and which feature is spending it?
//   * How slow is it, at the tail rather than on average — a 25-second timeout that fires one call
//     in twenty is invisible in a mean and very visible to the reader it happened to.
//
// None of those were answerable, because none of the nine call sites recorded anything. Each one
// caught its own failure, wrote it to `console.error`, and returned `null` — at which point the
// caller composed a heuristic read and the reader saw a perfectly ordinary panel. That silent
// fallback is the right behaviour for a visitor and the reason the operator was blind: a model
// that has stopped working and a model that is working look identical from every screen in the app.
//
// ---------------------------------------------------------------------------
// Why fallback rate is the headline figure
// ---------------------------------------------------------------------------
//
// Not "errors". A call that 500s and a call that returns prose where JSON was asked for have the
// same consequence — the reader gets the composed read instead of the written one — and an
// operator who only watched HTTP failures would miss half of them. So the outcome vocabulary below
// is written in terms of what the reader ended up with, and everything short of `ok` is a fallback.
//
// This module is deliberately pure: no `fetch`, no Supabase, no `process.env`. It is imported by
// the admin client component for its types, and a report that dragged the service-role key's module
// behind it into a browser bundle would be a far worse bug than the blindness it fixes.

/**
 * How one model call ended, from the reader's point of view.
 *
 * Ordered by how much of a problem it is, which is also the order the dashboard lists them in.
 */
export type AiOutcome =
  /** The model answered and the answer was usable. The reader saw a written read. */
  | "ok"
  /** The model answered, but the reply could not be used — unparseable, empty, or the wrong shape. */
  | "unusable"
  /** The request failed: non-2xx, a network error, or the 25-second timeout. */
  | "failed"
  /** There is no API key. Nothing was attempted and nothing was spent. */
  | "unconfigured";

/** Every outcome except a good one — the calls where the reader got a composed read. */
export const FALLBACK_OUTCOMES: AiOutcome[] = ["unusable", "failed", "unconfigured"];

/** One model call, as it is recorded. */
export type AiCallRecord = {
  id: string;
  /** Exact instant, ISO-8601 UTC. */
  at: string;
  /** The IST calendar date `at` falls on — what "daily" means everywhere in this app. */
  day: string;
  /**
   * Which surface asked. Free-form rather than a closed list: these name call sites, not the
   * plan-tier feature keys, and several tier features are served by more than one of them.
   */
  feature: string;
  /** The model actually asked for, or null when nothing was attempted. */
  model: string | null;
  outcome: AiOutcome;
  /** The HTTP status, when there was a response. Null for a timeout, a network error, or no key. */
  status: number | null;
  /**
   * Wall-clock duration of the request, in milliseconds. Null when nothing was attempted.
   *
   * Measured around the call including the network, because the network is the part that goes
   * wrong. For a streamed call this is time to the *end* of the stream, not to the first token.
   */
  ms: number | null;
  /**
   * Tokens, as OpenRouter reported them. Null when it did not report any — which is normal for a
   * failed call and possible for a streamed one, and is why these are nullable rather than zero.
   * A zero here would be indistinguishable from a call that genuinely used none.
   */
  promptTokens: number | null;
  completionTokens: number | null;
  /**
   * What OpenRouter said the call cost, in USD.
   *
   * Read from the response rather than estimated from a price table. A table of per-model prices
   * would be wrong the first time a model is repriced and nobody would notice, and a spend figure
   * that is quietly wrong is worse than no spend figure at all. Null when it was not reported.
   */
  costUsd: number | null;
  /** Whether this was a streamed completion. Streams often report no usage; see above. */
  streamed: boolean;
  /** The error, clipped, for a failed call. Never a request or response body. */
  error: string | null;
};

/** A latency distribution. Null throughout when no call in the window reached the model. */
export type LatencySpread = {
  p50: number | null;
  p95: number | null;
  max: number | null;
};

/** How a set of calls came out. */
export type OutcomeCounts = {
  ok: number;
  unusable: number;
  failed: number;
  unconfigured: number;
  total: number;
};

export type AiUsageSlice = {
  key: string;
  label: string;
  counts: OutcomeCounts;
  /** Share of calls that did not produce a written read, 0-100. */
  fallbackRate: number;
  latency: LatencySpread;
  promptTokens: number;
  completionTokens: number;
  /** Summed cost of the calls that reported one, in USD. */
  costUsd: number;
  /** How many calls reported a cost, so the figure above can say what it covers. */
  costedCalls: number;
  /** The most recent call in this slice, ISO-8601. */
  lastAt: string | null;
};

export type AiDailyPoint = {
  day: string;
  counts: OutcomeCounts;
  costUsd: number;
  /** Median latency for the day — the tail is too noisy at a day's volume to chart. */
  p50: number | null;
};

export type AiUsageReport = {
  /** How many days the window covers. */
  days: number;
  /** The IST day the window ends on. */
  today: string;
  counts: OutcomeCounts;
  /** Share of calls that did not produce a written read, 0-100. */
  fallbackRate: number;
  latency: LatencySpread;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  costedCalls: number;
  /** Per call site, busiest first. */
  features: AiUsageSlice[];
  /** Per model, busiest first. */
  models: AiUsageSlice[];
  /** Oldest day first, so it charts left to right. */
  daily: AiDailyPoint[];
  /** The most recent calls that did not produce a written read, newest first. */
  recentFailures: AiCallRecord[];
  /** Where the records came from, so the panel can say how much history it is looking at. */
  backend: "supabase" | "memory";
  /**
   * True when the records are only this process's, so the panel can warn that a serverless
   * deployment has several processes and this is one of them.
   */
  processLocal: boolean;
  /** How many records the store is holding in total, before the window was applied. */
  held: number;
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function countOutcomes(calls: AiCallRecord[]): OutcomeCounts {
  const counts: OutcomeCounts = { ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: calls.length };
  for (const call of calls) counts[call.outcome] += 1;
  return counts;
}

/**
 * The share of calls that left the reader with a composed read, 0-100.
 *
 * Rounded to a whole number: this is read as a percentage on a tile, and "12.7%" implies a
 * precision that a few dozen calls do not have.
 */
export function fallbackRateOf(counts: OutcomeCounts): number {
  if (counts.total === 0) return 0;
  return Math.round(((counts.total - counts.ok) / counts.total) * 100);
}

/**
 * Nearest-rank percentile over an ascending list.
 *
 * Nearest-rank rather than interpolated because these are measured durations of real calls, and a
 * p95 that is a weighted average of two calls is a number no call took. At the volumes here the
 * distinction also matters practically: with twenty calls, an interpolated p95 blends the slowest
 * two and hides the timeout that is the whole reason to look.
 */
export function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/**
 * The latency spread of the calls that actually reached the model.
 *
 * Calls with no duration are excluded rather than counted as zero — an unconfigured call took no
 * time because it never happened, and folding those in would drag every percentile towards zero
 * exactly on the deployments where the model is not working at all.
 */
export function latencyOf(calls: AiCallRecord[]): LatencySpread {
  const durations = calls
    .map((call) => call.ms)
    .filter((ms): ms is number => typeof ms === "number" && Number.isFinite(ms))
    .sort((a, b) => a - b);

  if (durations.length === 0) return { p50: null, p95: null, max: null };

  return {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    max: durations[durations.length - 1],
  };
}

/** Sums a nullable numeric field, treating "not reported" as absent rather than as zero. */
function sumOf(calls: AiCallRecord[], pick: (call: AiCallRecord) => number | null): number {
  return calls.reduce((total, call) => {
    const value = pick(call);
    return typeof value === "number" && Number.isFinite(value) ? total + value : total;
  }, 0);
}

/**
 * Cost, rounded to a cent of a cent.
 *
 * Individual calls here cost fractions of a cent, so summing them raw leaves a float with fifteen
 * digits of noise that would be rendered verbatim. Six places keeps a day of small calls honest
 * while producing a number that reads as money.
 */
function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sliceOf(key: string, label: string, calls: AiCallRecord[]): AiUsageSlice {
  const counts = countOutcomes(calls);

  return {
    key,
    label,
    counts,
    fallbackRate: fallbackRateOf(counts),
    latency: latencyOf(calls),
    promptTokens: sumOf(calls, (call) => call.promptTokens),
    completionTokens: sumOf(calls, (call) => call.completionTokens),
    costUsd: roundCost(sumOf(calls, (call) => call.costUsd)),
    costedCalls: calls.filter((call) => typeof call.costUsd === "number").length,
    lastAt: calls.reduce<string | null>((latest, call) => (latest === null || call.at > latest ? call.at : latest), null),
  };
}

/** Groups calls by a key, then reports each group, busiest first. */
function groupBy(calls: AiCallRecord[], pick: (call: AiCallRecord) => string | null, fallbackLabel: string): AiUsageSlice[] {
  const groups = new Map<string, AiCallRecord[]>();

  for (const call of calls) {
    const key = pick(call) ?? fallbackLabel;
    const bucket = groups.get(key);
    if (bucket) bucket.push(call);
    else groups.set(key, [call]);
  }

  return [...groups.entries()]
    .map(([key, group]) => sliceOf(key, key, group))
    .sort((a, b) => b.counts.total - a.counts.total || a.label.localeCompare(b.label));
}

/** How many of the most recent fallbacks to carry, so an operator has something to act on. */
const RECENT_FAILURE_LIMIT = 25;

export type BuildAiReportInput = {
  calls: AiCallRecord[];
  /** Oldest IST day to include, inclusive. */
  fromDay: string;
  /** The IST day the window ends on. */
  today: string;
  days: number;
  /** Every IST day in the window, oldest first — passed in so this module needs no clock. */
  window: string[];
  backend: AiUsageReport["backend"];
  processLocal: boolean;
  held: number;
};

/**
 * The whole report, from a list of calls.
 *
 * Every day in the window appears in `daily` whether or not anything happened on it. A chart that
 * skipped empty days would draw a flat line through an outage and read as steady traffic.
 */
export function buildAiUsageReport(input: BuildAiReportInput): AiUsageReport {
  const calls = input.calls.filter((call) => call.day >= input.fromDay && call.day <= input.today);
  const counts = countOutcomes(calls);

  const byDay = new Map<string, AiCallRecord[]>();
  for (const call of calls) {
    const bucket = byDay.get(call.day);
    if (bucket) bucket.push(call);
    else byDay.set(call.day, [call]);
  }

  return {
    days: input.days,
    today: input.today,
    counts,
    fallbackRate: fallbackRateOf(counts),
    latency: latencyOf(calls),
    promptTokens: sumOf(calls, (call) => call.promptTokens),
    completionTokens: sumOf(calls, (call) => call.completionTokens),
    costUsd: roundCost(sumOf(calls, (call) => call.costUsd)),
    costedCalls: calls.filter((call) => typeof call.costUsd === "number").length,
    features: groupBy(calls, (call) => call.feature, "unattributed"),
    models: groupBy(calls, (call) => call.model, "none attempted"),
    daily: input.window.map((day) => {
      const forDay = byDay.get(day) ?? [];
      return {
        day,
        counts: countOutcomes(forDay),
        costUsd: roundCost(sumOf(forDay, (call) => call.costUsd)),
        p50: latencyOf(forDay).p50,
      };
    }),
    recentFailures: calls
      .filter((call) => call.outcome !== "ok")
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, RECENT_FAILURE_LIMIT),
    backend: input.backend,
    processLocal: input.processLocal,
    held: input.held,
  };
}
