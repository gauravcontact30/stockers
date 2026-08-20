// Sector classification for the BSE universe.
//
// BSE publishes a company's sector one company at a time (ComHeader) — there is no bulk file, and
// the scrip master's INDUSTRY column comes back null for every row. Classifying the whole exchange
// therefore means ~4,900 calls, which at a polite concurrency takes minutes.
//
// So it happens in the background, once a day, while the boards keep serving: whatever is already
// classified is used immediately, the progress is reported alongside it, and the rows actually on
// screen jump the queue through the same cache. Nothing waits on the walk to finish.

import { fetchBse } from "./bse-client";
import { readJsonCache, writeJsonCache } from "./data-cache";
import { toText } from "./nse-client";

export type SectorInfo = { sector: string | null; industry: string | null };

export type ClassificationProgress = {
  /** Companies whose sector is known. */
  done: number;
  /** Companies in the universe being classified. */
  total: number;
  /** True once the walk has been all the way round; sector totals are only complete then. */
  ready: boolean;
};

type RawHeader = { Sector?: unknown; IndustryNew?: unknown; Industry?: unknown };

const TTL_MS = 24 * 60 * 60 * 1000;
// One at a time, four a second at most. Eight in parallel got this app's IP answered with "Access
// Denied" part way through a full walk — and that took every other BSE board down with it, because
// they share the block. Five thousand requests to an endpoint published for a website is only
// acceptable at a rate a person browsing could plausibly produce, so a full pass takes about half
// an hour and fills the board in as it goes.
const CONCURRENCY = 1;
const PACE_MS = 250;
// A blocked or timed-out lookup is retried on a later pass rather than being written off for the
// day, but not forever — after this many passes what is left is taken as genuinely unclassified.
const MAX_PASSES = 3;
const PASS_COOLDOWN_MS = 60_000;

const classified = new Map<string, SectorInfo>();
let universeSize = 0;
let expiresAt = 0;
let walking: Promise<void> | null = null;

// How many refusals in a row mean the exchange has stopped answering us rather than that a few
// scrips are unlucky. Grinding on through thousands more requests after that is what gets an IP
// blocked, so the walk gives up and leaves the rest for the next pass.
const FAILURE_STREAK_LIMIT = 20;

let failureStreak = 0;

// Where the finished map lives between runs. Without it every restart — and in development every
// hot reload — begins the half-hour walk again from nothing, which is why the categories never
// filled: the work was being thrown away faster than it could be done. Same disk-cache pattern the
// period returns already use.
const CACHE_FILE = "bse-sectors.json";
// How often the walk writes what it has, so a restart resumes rather than repeats.
const CHECKPOINT_EVERY = 200;

type Snapshot = { savedAt: string; sectors: Record<string, SectorInfo> };

let hydratedAt = 0;
let hydrating: Promise<void> | null = null;
let sinceCheckpoint = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Merges the saved map in, whenever the file on disk is newer than what this process has read.
 *
 * Not a once-per-process load: the standalone classifier writes the same file every couple of
 * hundred companies, and a server that read it once at boot would show a half-empty set of
 * categories for the next hour while the file beside it filled up.
 */
function hydrate(): Promise<void> {
  hydrating ??= (async () => {
    try {
      const snapshot = await readJsonCache<Snapshot>(CACHE_FILE);
      if (!snapshot) return;
      const savedAt = new Date(snapshot.savedAt).getTime();
      if (!Number.isFinite(savedAt) || savedAt <= hydratedAt) return;

      const age = Date.now() - new Date(snapshot.savedAt).getTime();
      if (!Number.isFinite(age) || age > TTL_MS) return;

      for (const [code, info] of Object.entries(snapshot.sectors)) {
        // What this process already fetched wins: it is at least as fresh as the file.
        if (!classified.has(code)) classified.set(code, info);
      }
      hydratedAt = savedAt;
    } catch {
      // No cache yet, or an unreadable one: the walk simply starts from scratch.
    } finally {
      hydrating = null;
    }
  })();

  return hydrating;
}

async function save(): Promise<void> {
  const snapshot: Snapshot = { savedAt: new Date().toISOString(), sectors: Object.fromEntries(classified) };
  await writeJsonCache(CACHE_FILE, snapshot);
}

/**
 * One company's classification, remembered until the daily rebuild.
 *
 * Only an answer is remembered. A company the exchange returns with no industry is an answer — it
 * is recorded as unclassified and not asked about again — but a request that failed or was refused
 * is not, because caching a rate-limit as "this company has no sector" would leave a hole in the
 * board until tomorrow.
 */
export async function loadSector(code: string): Promise<SectorInfo> {
  const hit = classified.get(code);
  if (hit) return hit;

  const raw = await fetchBse<RawHeader>(`/ComHeader/w?quotetype=EQ&scripcode=${encodeURIComponent(code)}&seriesid=`);
  const value: SectorInfo = {
    sector: toText(raw?.Sector) || null,
    industry: toText(raw?.IndustryNew) || toText(raw?.Industry) || null,
  };

  if (raw === null) {
    failureStreak++;
  } else {
    failureStreak = 0;
    classified.set(code, value);
  }

  return value;
}

/** The rows being rendered, each with its sector beside it. */
export async function attachSectors<T extends { code: string }>(rows: T[]): Promise<(T & SectorInfo)[]> {
  // A page of rows is a handful of lookups and someone is waiting for it, so these go out together
  // rather than through the background walk's deliberately slow pacing.
  const resolved = await Promise.all(rows.map((row) => loadSector(row.code)));
  return rows.map((row, index) => ({ ...row, ...resolved[index] }));
}

/** The macro sector shown on a row — null while the company is still queued. */
export function sectorOf(code: string): string | null {
  return classified.get(code)?.sector ?? null;
}

/**
 * Data centres, as a category of our own.
 *
 * BSE has no such industry — its list stops at "Information Technology", "Telecommunication" and
 * "Realty", which is where these companies are actually filed. Traders follow the theme rather than
 * the filing, so it is offered as an extra grouping, by scrip code, and the board labels it as ours
 * rather than the exchange's. A company here keeps its official category too: this is a second way
 * of looking at it, not a reclassification.
 */
export const HOUSE_CATEGORY = "Data Centers";

// Every code checked against BSE's own scrip list rather than remembered — two of the first guesses
// here pointed at the wrong company, which on a board like this is worse than leaving one out.
const HOUSE_CATEGORY_CODES = new Set([
  "544783", // E2E Networks Ltd — cloud and GPU data centres
  "543945", // Netweb Technologies India Ltd — data centre and HPC systems
  "532668", // Aurionpro Solutions Ltd
  "500002", // ABB India Ltd — data centre power and automation
  "500575", // Voltas Ltd — data centre cooling
  "515055", // Anant Raj Ltd — data centre buildout
  "543265", // RailTel Corporation of India Ltd — edge data centres
  "500483", // Tata Communications Ltd — data centre and network infrastructure
]);

/** True when the company is one of the house category's members. */
export function inHouseCategory(code: string): boolean {
  return HOUSE_CATEGORY_CODES.has(code);
}

/** How many companies the house category can ever hold, mapped or not. */
export const HOUSE_CATEGORY_SIZE = HOUSE_CATEGORY_CODES.size;

/**
 * The category a company belongs to — null while it is still queued.
 *
 * This is BSE's sector level (the 22 names its own industry dropdown lists), not the dozen macro
 * sectors above it: "Capital Goods" and "Realty" are what a trader groups by, where the macro
 * level would put both under Industrials.
 */
export function categoryOf(code: string): string | null {
  return classified.get(code)?.industry ?? null;
}

export function classificationProgress(): ClassificationProgress {
  return { done: classified.size, total: universeSize, ready: walking === null && universeSize > 0 };
}

/**
 * Ensures the whole universe is being classified, and reports where that has got to.
 *
 * Returns immediately: callers get the progress as it stands, never a promise of the finished
 * walk. Calling it again while a walk is in flight does nothing, so every board asking for sectors
 * on every request adds no load.
 */
export function classifyUniverse(codes: string[]): ClassificationProgress {
  universeSize = codes.length;

  // Picks up whatever the classifier has written since the last board asked. Deliberately not
  // awaited: this render answers with what is known now, the next one with a little more.
  void hydrate();

  if (walking === null && Date.now() >= expiresAt) {
    // A rebuild starts from an empty map: a company's sector can change, and a stale entry would
    // otherwise survive every rebuild by looking like a cache hit.
    if (expiresAt !== 0) classified.clear();

    walking = walk(codes).finally(() => {
      walking = null;
      expiresAt = Date.now() + TTL_MS;
    });
  }

  return classificationProgress();
}

/**
 * Walks the universe, then goes back for whatever did not answer.
 *
 * A pass over five thousand scrips will always lose some to timeouts and throttling; those are the
 * ones a second pass, a minute later, usually picks up. Three passes and the rest is accepted as
 * unclassified rather than asking the exchange the same question all day.
 */
async function walk(codes: string[]): Promise<void> {
  // Anything already on disk is already answered, so the walk only ever asks for the remainder.
  await hydrate();

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const pending = codes.filter((code) => !classified.has(code));
    if (pending.length === 0) return;
    if (pass > 0) await sleep(PASS_COOLDOWN_MS);

    failureStreak = 0;
    await paced(pending, (code) => loadSector(code));
    await save();

    // The feed stopped answering. Stop asking: the pass cooldown, or tomorrow's rebuild, is a
    // better time than five thousand more requests into a closed door.
    if (failureStreak >= FAILURE_STREAK_LIMIT) return;
  }
}

/**
 * Runs `task` over `items`, `CONCURRENCY` at a time with a pause between each.
 *
 * Stops early once the feed has refused `FAILURE_STREAK_LIMIT` times in a row — the same guard the
 * walk checks, applied here so a long pass abandons the moment it stops being welcome.
 */
async function paced<T>(items: T[], task: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length && failureStreak < FAILURE_STREAK_LIMIT) {
      await task(items[next++]);

      // Checkpointed as it goes: half an hour of work should not be lost to a restart at minute 29.
      if (++sinceCheckpoint >= CHECKPOINT_EVERY) {
        sinceCheckpoint = 0;
        await save();
      }

      await sleep(PACE_MS);
    }
  });

  await Promise.all(workers);
}

/** Test seam: forgets every classification and any walk in flight. */
export function resetSectorsForTest(): void {
  classified.clear();
  universeSize = 0;
  expiresAt = 0;
  walking = null;
  failureStreak = 0;
  hydrating = null;
  hydratedAt = 0;
  sinceCheckpoint = 0;
}
