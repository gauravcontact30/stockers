import { CACHE_TAGS, type CacheTag } from "../../../lib/cache";

const ALL_TAGS = Object.values(CACHE_TAGS);

/** The tag families to purge, from the request body - everything when none are named. */
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
