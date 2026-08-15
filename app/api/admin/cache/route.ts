import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  CACHE_TAGS,
  cacheInventory,
  clearMemoryCacheByKeys,
  clearMemoryCacheByPrefix,
  warmCacheKeys,
  type CacheTag,
} from "../../../lib/cache";
import { buildCacheReport, loadCacheCatalogue } from "../../../lib/cache-report";
import { clearBoardReads } from "../../../lib/board-read";
import { clearStockVerdictCache } from "../../../lib/stock-verdicts";
import { userFromRequest } from "../../../lib/store";

/**
 * Reading and revalidating the cached feeds by hand.
 *
 * Everything in this application is cached on an interval and refreshed behind the reader, which
 * is what makes it fast — but an interval is the wrong tool when something has visibly gone stale:
 * a corrected Bhavcopy, a feed that came back wrong, an AI read written over figures that have
 * since been revised. This is the release valve for those cases.
 *
 * `GET` is the half that was missing. Purging used to be blind — an operator arriving because "the
 * BSE numbers look wrong" could only drop everything and hope, which costs seconds of rebuild for
 * feeds that were fine. Now they can see what is held and how old it is before deciding.
 *
 * Both layers have to be dropped for a purge to mean anything. `revalidateTag` invalidates what
 * Next persisted to its Data Cache; the in-process entries are separate, live in this process's
 * memory, and would otherwise keep answering from a cache the operator believes they just cleared.
 */
const ALL_TAGS = Object.values(CACHE_TAGS);

/** The tag families to purge, from the request body — everything when none are named. */
export function tagsFrom(value: unknown): CacheTag[] {
  const asked = Array.isArray((value as { tags?: unknown })?.tags) ? ((value as { tags: unknown[] }).tags) : null;
  if (!asked) return [...ALL_TAGS];

  const known = asked.filter((tag): tag is CacheTag => ALL_TAGS.includes(tag as CacheTag));
  return known.length > 0 ? known : [...ALL_TAGS];
}

/** The named feed keys in a request body, or `[]` when none were named. */
export function keysFrom(value: unknown, field: "keys" | "warm"): string[] {
  const asked = (value as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(asked)) return [];
  return [...new Set(asked.filter((key): key is string => typeof key === "string" && key.trim() !== ""))];
}

/**
 * The in-memory key prefixes each tag family owns.
 *
 * The memory layer is keyed by feed rather than by tag, so a tag maps to the prefixes its feeds
 * were registered under. Kept beside the tags themselves so adding a feed under a new prefix is a
 * one-line change in one place.
 */
const PREFIXES: Record<CacheTag, string[]> = {
  bse: ["bse:"],
  nse: ["nse:", "compare:"],
  ai: ["pulse:", "intel:", "compare:"],
  news: ["news:", "intel:"],
  quotes: ["quotes:"],
};

async function requireAdmin(request: Request) {
  const user = await userFromRequest(request);
  return user?.role === "admin" ? user : null;
}

/** Drops whole families from both layers, and the two stores that sit outside the shared cache. */
function purgeTags(tags: CacheTag[]): void {
  for (const tag of tags) {
    // `{ expire: 0 }` leaves the tagged entries with no remaining life, which is what makes this a
    // purge rather than a nudge — Next 16 takes the profile as a second argument and would
    // otherwise apply a default that keeps them serviceable for a while yet.
    revalidateTag(tag, { expire: 0 });
    for (const prefix of PREFIXES[tag]) clearMemoryCacheByPrefix(prefix);
  }

  // Board reads and stock verdicts are held in their own bounded stores rather than in the shared
  // cache, because both are produced by a stream rather than by a loader that could be re-run for
  // them. Verdicts were previously missed here, so a call written over figures that had since been
  // revised outlived the purge that was meant to drop it, by up to its full ten-minute window.
  if (tags.includes(CACHE_TAGS.ai)) {
    clearBoardReads();
    clearStockVerdictCache();
  }
}

/**
 * Drops named feeds, and reports the families the Data Cache had to be revalidated for.
 *
 * A persisted feed also has a copy in Next's Data Cache, and dropping only the memory entry would
 * let that copy answer the very next read — a purge that purged nothing the operator could see.
 * There is no key-level handle on the Data Cache, so the feed's own families go too, and the
 * response names them rather than quietly leaving the second layer intact.
 */
function purgeKeys(keys: string[]): { purgedKeys: string[]; collateral: CacheTag[] } {
  const collateral = new Set<CacheTag>();
  for (const entry of cacheInventory()) {
    if (entry.persist && keys.includes(entry.key)) for (const tag of entry.tags) collateral.add(tag);
  }

  const purgedKeys = clearMemoryCacheByKeys(keys);
  for (const tag of collateral) revalidateTag(tag, { expire: 0 });

  return { purgedKeys, collateral: [...collateral] };
}

/**
 * What this instance is holding, feed by feed.
 *
 * "This instance" is load-bearing and the response says so: a serverless deployment runs several,
 * each with its own memory, so these figures describe whichever one answered — not the fleet.
 */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const report = await buildCacheReport();
  return NextResponse.json(
    {
      ...report,
      note: "These figures describe the instance that answered this request. Other running instances hold their own.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const keys = keysFrom(body, "keys");
  const warm = keysFrom(body, "warm");

  // Naming keys means "these and nothing else". Falling through to the tag default here would turn
  // a request to drop one feed into a purge of all five families, which is the opposite of what
  // was asked and by far the more expensive mistake.
  const tags = keys.length > 0 ? [] : tagsFrom(body);

  // Both a key purge and a warm need the catalogue: one to know a key's tags, the other to have a
  // loader to call. Neither is guaranteed to have been imported by whatever else this instance
  // has served.
  if (keys.length > 0 || warm.length > 0) await loadCacheCatalogue();

  purgeTags(tags);
  const { purgedKeys, collateral } = keys.length > 0 ? purgeKeys(keys) : { purgedKeys: [], collateral: [] };

  // Warming last, and only after the drops: refilling a feed and then purging it would leave the
  // cache colder than doing neither. A feed that fails to reload is reported rather than thrown —
  // warming eight and having one upstream refuse is a partial success, not a 500.
  const warmed = warm.length > 0 ? await warmCacheKeys(warm) : [];

  return NextResponse.json({
    revalidated: tags,
    purgedKeys,
    /** Families the Data Cache had to be revalidated for because a named key was persisted. */
    alsoRevalidated: collateral,
    warmed,
    at: new Date().toISOString(),
    note: "Cleared in this process and in the Data Cache. Other running instances refresh on their own interval.",
  });
}
