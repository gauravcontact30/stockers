import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, clearMemoryCacheByPrefix, type CacheTag } from "../../../lib/cache";
import { clearBoardReads } from "../../../lib/board-read";
import { clearStockVerdictCache } from "../../../lib/stock-verdicts";
import { userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * Revalidating the cached feeds by hand.
 *
 * Everything in this application is cached on an interval and refreshed behind the reader, which
 * is what makes it fast — but an interval is the wrong tool when something has visibly gone stale:
 * a corrected Bhavcopy, a feed that came back wrong, an AI read written over figures that have
 * since been revised. This is the release valve for those cases.
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

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const tags = tagsFrom(await request.json().catch(() => null));

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

  return NextResponse.json({
    revalidated: tags,
    at: new Date().toISOString(),
    note: "Cleared in this process and in the Data Cache. Other running instances refresh on their own interval.",
  });
}
