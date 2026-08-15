// "What should I purge, and what will it cost me?"
//
// The inventory in `./cache-report` answers what the cache is holding. It does not answer the
// question the operator actually came with, which is a judgement: given that the tape is nine
// minutes past its window and the scrip master is forty megabytes and four hours old, which of
// those matters right now, and is purging it worth what refilling it costs?
//
// That judgement is what this produces. It is a *recommendation with a selection attached* rather
// than a paragraph — the panel wires `purge` straight into its checkboxes, so acting on the advice
// is one click rather than a reading exercise.
//
// ---------------------------------------------------------------------------
// The model is the optional half
// ---------------------------------------------------------------------------
//
// Everything here is decided by `assess()` from the figures: which families are past their
// windows, how expensive each is to rebuild, what a purge would cost. The model is handed that
// assessment and asked to *phrase* it. It never picks the families — a wrong recommendation here
// drops a forty-megabyte scrip master on a production instance, which is not a decision to hand to
// a language model on a page whose entire purpose is to avoid unnecessary purges.
//
// So with no OPENROUTER_API_KEY, or with a model that times out, the advice is the same advice in
// plainer words, and it says which it is. This is the same bargain the rest of the app makes: every
// AI panel still renders, composed from its own measured figures, and admits as much.

// Reads OPENROUTER_API_KEY through `./openrouter`. The `server-only` import makes a client
// component that pulls this in a build error, rather than a key that quietly ships to the browser.
import "server-only";

import { chatJson } from "./openrouter";
import type { CacheTag } from "./cache";
import { FAMILY_META, type CacheFamilyReport, type CacheReport } from "./cache-report";

export type CacheAdvice = {
  /** One line: the state of the cache. */
  headline: string;
  /** Two to four observations, each about something actually in the figures. */
  points: string[];
  /** The families the advice says to purge. Drives the panel's "apply" button. */
  purge: CacheTag[];
  /** Families deliberately left alone, with the reason. Reads as "don't touch these". */
  spare: { tag: CacheTag; reason: string }[];
  /** Feed keys worth warming after the purge — the expensive ones the advice just emptied. */
  warm: string[];
  source: "ai" | "heuristic";
};

/** Bytes as something readable. Kept here rather than imported so this module stands alone. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A duration as something readable, to the nearest useful unit. */
export function formatAge(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * How long this instance has to have been up before an empty cache is worth remarking on.
 *
 * Below this, an empty family means "nobody has asked for it yet", which is the normal state of a
 * cache thirty seconds after a deploy and not something to advise a purge over.
 */
const COLD_START_MS = 2 * 60_000;

/**
 * Feeds expensive enough that emptying one without refilling it hands a multi-second wait to
 * whichever visitor arrives next. These are the ones the advice offers to warm.
 *
 * The numbers are from the measurements in the header of `./cache`.
 */
const EXPENSIVE_KEYS = new Set(["bse:universe", "bse:tape", "nse:most-traded", "nse:trending-sectors", "nse:etf-board"]);

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

export type Assessment = {
  purge: CacheTag[];
  spare: { tag: CacheTag; reason: string }[];
  warm: string[];
  /** The figures the headline and points are drawn from, in the order they should be mentioned. */
  observations: string[];
  /** Nothing wrong anywhere — worth knowing, because the advice then is "do nothing". */
  clean: boolean;
};

/**
 * Which families to purge, decided from the figures alone.
 *
 * The rule is narrower than "anything not fresh" on purpose. A stale entry is being served *and
 * refreshed behind the reader* — that is the cache working as designed, and purging it converts a
 * background refresh into a foreground one for the next visitor. Only an expired entry, one past
 * the point where the app will still stand behind it, is genuinely costing anybody anything.
 */
export function assess(report: CacheReport): Assessment {
  const purge: CacheTag[] = [];
  const spare: { tag: CacheTag; reason: string }[] = [];
  const observations: string[] = [];
  const cold = report.uptimeMs < COLD_START_MS;

  for (const family of report.families) {
    const { counts } = family;

    if (family.feeds === 0) {
      spare.push({ tag: family.tag, reason: "No feed in this family has been registered in this instance." });
      continue;
    }

    if (counts.expired > 0) {
      purge.push(family.tag);
      observations.push(
        `${family.label}: ${counts.expired} of ${family.feeds} feeds are past the point where a stale value is still served, so the next reader waits for the upstream instead of being handed something.`,
      );
      continue;
    }

    if (counts.stale > 0) {
      spare.push({
        tag: family.tag,
        reason: `${counts.stale} stale, but each is being served while it refreshes behind the reader. Purging would make the next visitor wait for what is already on its way.`,
      });
      observations.push(
        `${family.label}: ${counts.stale} feeds are past their window and refreshing behind the reader — working as designed, not a fault.`,
      );
      continue;
    }

    if (counts.empty === family.feeds) {
      spare.push({
        tag: family.tag,
        reason: cold
          ? `Nothing held yet, but this instance is only ${formatAge(report.uptimeMs)} old. There is nothing to purge.`
          : "Nothing held. Purging an empty family does nothing; warm it instead if the panels are blank.",
      });
      if (!cold) {
        observations.push(
          `${family.label}: holding nothing after ${formatAge(report.uptimeMs)} of uptime, so either nobody has opened those panels or the upstream is refusing.`,
        );
      }
      continue;
    }

    spare.push({ tag: family.tag, reason: `All ${family.held} held values are within their window.` });
  }

  // Warming is offered only for the expensive feeds inside families being purged — warming a feed
  // whose refill costs ten milliseconds is noise, and warming one that is not being purged would
  // throw away a perfectly good value.
  const warm = report.entries
    .filter((entry) => EXPENSIVE_KEYS.has(entry.key) && entry.tags.some((tag) => purge.includes(tag)))
    .map((entry) => entry.key);

  const heaviest = [...report.families].sort((a, b) => b.bytes - a.bytes)[0];
  if (heaviest && heaviest.bytes > 0) {
    observations.push(
      `${heaviest.label} is the heaviest family at ${formatBytes(heaviest.bytes)} across ${heaviest.held} held values; purging it is the one that costs real seconds to rebuild.`,
    );
  }

  return { purge, spare, warm, observations, clean: purge.length === 0 };
}

// ---------------------------------------------------------------------------
// Phrasing
// ---------------------------------------------------------------------------

/** The assessment in plain words, used as-is when there is no model and as the fallback when there is. */
export function composeAdvice(report: CacheReport, assessment: Assessment): CacheAdvice {
  const { counts } = report.totals;

  const headline = assessment.clean
    ? report.totals.held === 0
      ? "Nothing cached in this instance yet — there is nothing to purge."
      : `All ${report.totals.held} held feeds are within their windows. No purge needed.`
    : `${counts.expired} feed${counts.expired === 1 ? "" : "s"} past the point of being served — purge ${assessment.purge
        .map((tag) => FAMILY_META[tag].label)
        .join(" and ")}.`;

  const points = assessment.observations.slice(0, 4);

  return {
    headline,
    points: points.length > 0 ? points : [`${report.totals.feeds} feeds registered, ${formatBytes(report.totals.bytes)} held.`],
    purge: assessment.purge,
    spare: assessment.spare,
    warm: assessment.warm,
    source: "heuristic",
  };
}

/** The figures the model is shown. Deliberately small: it is phrasing a decision, not making one. */
export function briefFor(report: CacheReport, assessment: Assessment): string {
  const family = (entry: CacheFamilyReport) =>
    `${entry.label}: ${entry.feeds} feeds, ${entry.held} holding a value (${entry.counts.fresh} fresh, ${entry.counts.stale} stale, ${entry.counts.expired} expired, ${entry.counts.empty} empty), ${formatBytes(entry.bytes)}, oldest ${entry.oldestAgeMs === null ? "n/a" : formatAge(entry.oldestAgeMs)}`;

  const oldest = report.entries
    .filter((entry) => entry.ageMs !== null)
    .slice(0, 6)
    .map((entry) => `${entry.label} (${entry.key}): ${formatAge(entry.ageMs ?? 0)} old, ${entry.state}`);

  return [
    `Instance uptime: ${formatAge(report.uptimeMs)}`,
    "",
    "Families:",
    ...report.families.map(family),
    "",
    "Oldest values held:",
    ...(oldest.length > 0 ? oldest : ["(nothing held)"]),
    "",
    `Decision already taken: purge ${assessment.purge.length > 0 ? assessment.purge.join(", ") : "nothing"}.`,
    ...assessment.spare.map((entry) => `Leaving ${entry.tag} alone: ${entry.reason}`),
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are the cache advisor on the admin console of an Indian stock market application.",
  "You are given an inventory of what the server's cache holds, and a purge decision that has already been made from those figures.",
  "Explain that decision to the operator: one headline of at most sixteen words, then two to four short points.",
  "Do not change the decision, do not recommend purging anything that is not in it, and never invent a feed, a size or an age.",
  "Assume the operator knows what a cache is; tell them what is true of theirs and what purging would cost.",
  "Write the headline on the first line, prefixed exactly with 'HEADLINE: '.",
  "Write each point on its own line after it, prefixed exactly with '- '.",
  "Write nothing else: no preamble, no JSON, no closing remark.",
].join(" ");

/** Model output turned into a headline and points, or null when it carried neither. */
export function parseAdvice(text: string): { headline: string; points: string[] } | null {
  let headline = "";
  const points: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matchedHeadline = trimmed.match(/^HEADLINE:\s*(.+)$/i);
    if (matchedHeadline) {
      headline = matchedHeadline[1].trim().slice(0, 200);
      continue;
    }

    const point = trimmed.match(/^[-*•]\s*(.+)$/);
    if (point) points.push(point[1].trim().slice(0, 300));
  }

  if (!headline && points.length === 0) return null;
  return { headline, points: points.slice(0, 4) };
}

async function phraseWithModel(brief: string): Promise<{ headline: string; points: string[] } | null> {
  // A refused or slow model is not a failed diagnosis — the composed advice is the same advice,
  // and the panel says which one it got.
  return chatJson({
    feature: "cache-advisor",
    system: SYSTEM_PROMPT,
    user: brief,
    temperature: 0.3,
    // Shorter than the reader-facing calls: an admin waiting on a diagnosis wants the composed
    // answer at fifteen seconds far more than the written one at twenty-five.
    timeoutMs: 15_000,
    parse: parseAdvice,
  });
}

/**
 * The advice for a cache report: the same decision either way, phrased by the model when there is
 * one and composed from the figures when there is not.
 */
export async function adviseOnCache(report: CacheReport): Promise<CacheAdvice> {
  const assessment = assess(report);
  const composed = composeAdvice(report, assessment);

  const written = await phraseWithModel(briefFor(report, assessment));
  if (!written) return composed;

  return {
    ...composed,
    // A model that wrote points but dropped the headline prefix keeps the composed headline rather
    // than showing an empty one.
    headline: written.headline || composed.headline,
    points: written.points.length > 0 ? written.points : composed.points,
    source: "ai",
  };
}
