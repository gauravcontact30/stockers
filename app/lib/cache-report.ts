// What the cache is actually holding, and what to do about it.
//
// ---------------------------------------------------------------------------
// The problem this solves
// ---------------------------------------------------------------------------
//
// Cache Control used to be five checkboxes and a Purge button. An operator arriving at it because
// "the BSE numbers look wrong" had no way to answer the question they came with — is the tape
// stale, and if so by how much — so the only available move was to purge everything and hope. That
// is expensive: purging `bse` drops a five-thousand-row scrip master that costs seconds to rebuild,
// and purging it when the tape was fine costs those seconds for nothing.
//
// So this module answers the question first. It reports every feed the process can serve, how old
// each one's value is, how that age stands against the feed's own windows, and what it is costing
// in memory — and then rolls that up per tag family so the checkboxes above the table can say
// "3 stale, 41MB" instead of nothing at all.
//
// ---------------------------------------------------------------------------
// Why the inventory has to be coaxed into existing
// ---------------------------------------------------------------------------
//
// A feed registers itself with `./cache` when the module that declares it is first imported. An
// admin route importing nothing but the cache would therefore see an inventory of whatever else
// this process happened to have served — a different, and misleading, list on every instance.
// `loadCacheCatalogue` imports the declaring modules so the list is the same everywhere: every
// feed, whether or not anybody has asked for it yet.
//
// The imports are individually caught. A feed module that throws on import is a real problem, but
// it is not *this* page's problem, and it must not take down the panel an operator opens to
// diagnose it.

import { CACHE_TAGS, cacheInventory, type CacheEntryReport, type CacheState, type CacheTag } from "./cache";

/**
 * The modules that declare cached feeds.
 *
 * Written as thunks with literal specifiers rather than a mapped array of strings: a dynamic
 * `import(variable)` makes the bundler pull in every module that could possibly match, which here
 * would be the whole of `app/lib`.
 */
const FEED_MODULES: (() => Promise<unknown>)[] = [
  () => import("./bse-market"),
  () => import("./corporate-actions"),
  () => import("./dip-leaders"),
  () => import("./market-intel"),
  () => import("./market-news"),
  () => import("./market-pulse"),
  () => import("./nse-dividends"),
  () => import("./nse-industry"),
  () => import("./nse-ipos"),
  () => import("./nse-market"),
  () => import("./nse-stock-news"),
  () => import("./shareholding"),
  () => import("./stock-performance"),
  () => import("./subscription"),
];

/** Imports every feed module so the inventory is the full catalogue rather than a sample. */
export async function loadCacheCatalogue(): Promise<void> {
  await Promise.all(FEED_MODULES.map((load) => load().catch(() => undefined)));
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Readable names for the feeds worth naming.
 *
 * Not exhaustive, and not meant to be — `prettyKey` handles the rest well enough that a feed added
 * tomorrow reads sensibly here without anyone remembering to come back. This table exists for the
 * handful whose key is genuinely opaque.
 */
const FEED_LABELS: Record<string, string> = {
  "bse:universe": "BSE scrip master",
  "bse:tape": "BSE Bhavcopy tape",
  "bse:industries": "BSE industry list",
  "nse:mtf-universe": "MTF-eligible universe",
  "nse:most-traded": "Most traded",
  "nse:trending-sectors": "Sectoral indices",
  "nse:etf-board": "ETF board",
  "nse:dividends": "Dividend calendar",
  "nse:industry-map": "NSE industry map",
  "nse:stock-news": "Corporate filings",
  "nse:corporate-actions": "Corporate actions",
  "nse:trading-holidays": "Trading holidays",
  "nse:ipos": "IPO calendar",
};

/** A key turned into something a person can read: `nse:most-traded` becomes "Most traded". */
export function prettyKey(key: string): string {
  const named = FEED_LABELS[key];
  if (named) return named;

  // `family:name:argument` — the argument half is reader input (a symbol, a question) and is kept
  // verbatim, because that is the part telling the operator *which* of a family they are looking at.
  const [, name = key, ...rest] = key.split(":");
  const label = name.replace(/[-_]/g, " ").replace(/^./, (character) => character.toUpperCase());
  return rest.length > 0 ? `${label} · ${rest.join(":")}` : label;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export const FAMILY_META: Record<CacheTag, { label: string; description: string }> = {
  bse: { label: "BSE data", description: "Scrip master, Bhavcopy tape and sector classification." },
  nse: { label: "NSE boards", description: "Most traded, sectoral indices, ETFs, dividends, filings and IPOs." },
  ai: { label: "AI reads", description: "Board reads, pulse narrative, comparisons and intelligence answers." },
  news: { label: "News", description: "Market headlines and story pages." },
  quotes: { label: "Quote snapshots", description: "Yahoo stock, ETF and benchmark index quote snapshots." },
};

export type CacheFamilyReport = {
  tag: CacheTag;
  label: string;
  description: string;
  /** Feeds registered under this family. */
  feeds: number;
  /** Of those, how many are holding a value. */
  held: number;
  counts: Record<CacheState, number>;
  /** Total held bytes. Unmeasurable values contribute nothing rather than distorting the figure. */
  bytes: number;
  /** The age of the oldest value held, or null when the family holds nothing. */
  oldestAgeMs: number | null;
  /** The worst state present in the family — what the family's chip should say. */
  worst: CacheState;
  /** Whether a background refresh is running for any feed in the family. */
  refreshing: boolean;
};

export type CacheReport = {
  families: CacheFamilyReport[];
  entries: (CacheEntryReport & { label: string })[];
  totals: {
    feeds: number;
    held: number;
    bytes: number;
    counts: Record<CacheState, number>;
  };
  /** How long this instance has been up. A cold instance holding nothing is not a fault. */
  uptimeMs: number;
  checkedAt: string;
};

const EMPTY_COUNTS = (): Record<CacheState, number> => ({ empty: 0, fresh: 0, stale: 0, expired: 0 });

/** Worst-first, so a family reports the most alarming state it contains. */
const SEVERITY: Record<CacheState, number> = { fresh: 0, empty: 1, stale: 2, expired: 3 };

export function worstState(states: CacheState[]): CacheState {
  return states.reduce<CacheState>((worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst), "fresh");
}

/**
 * The moment this module was first loaded — near enough to when the process started.
 *
 * It is here so the report can distinguish "the cache is empty because something purged it" from
 * "the cache is empty because this instance came up forty seconds ago", which look identical in the
 * inventory and mean entirely different things.
 */
const STARTED_AT = Date.now();

/** Rolls the raw inventory up into families and totals. */
export function summarise(entries: CacheEntryReport[], now = Date.now()): CacheReport {
  const labelled = entries.map((entry) => ({ ...entry, label: prettyKey(entry.key) }));

  const families = (Object.keys(FAMILY_META) as CacheTag[]).map((tag): CacheFamilyReport => {
    const mine = labelled.filter((entry) => entry.tags.includes(tag));
    const counts = EMPTY_COUNTS();
    let bytes = 0;
    let oldestAgeMs: number | null = null;

    for (const entry of mine) {
      counts[entry.state] += 1;
      bytes += entry.bytes ?? 0;
      if (entry.ageMs !== null && (oldestAgeMs === null || entry.ageMs > oldestAgeMs)) oldestAgeMs = entry.ageMs;
    }

    return {
      tag,
      ...FAMILY_META[tag],
      feeds: mine.length,
      held: mine.filter((entry) => entry.state !== "empty").length,
      counts,
      bytes,
      oldestAgeMs,
      // A family nothing has registered into yet is "empty", not "fresh" — `worstState` starts at
      // fresh, which would otherwise read as a clean bill of health for a family with no feeds.
      worst: mine.length === 0 ? "empty" : worstState(mine.map((entry) => entry.state)),
      refreshing: mine.some((entry) => entry.refreshing),
    };
  });

  const counts = EMPTY_COUNTS();
  for (const entry of labelled) counts[entry.state] += 1;

  return {
    families,
    entries: labelled,
    totals: {
      feeds: labelled.length,
      held: labelled.filter((entry) => entry.state !== "empty").length,
      bytes: labelled.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      counts,
    },
    uptimeMs: Math.max(0, now - STARTED_AT),
    checkedAt: new Date(now).toISOString(),
  };
}

/** The catalogue, loaded and rolled up. */
export async function buildCacheReport(): Promise<CacheReport> {
  await loadCacheCatalogue();
  return summarise(cacheInventory());
}

/** Every tag family, for callers that need the canonical list. */
export const ALL_TAGS: CacheTag[] = Object.values(CACHE_TAGS);
