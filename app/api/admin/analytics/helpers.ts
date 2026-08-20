import { ANALYTICS_RETENTION_DAYS } from "../../../lib/analytics";

/** The windows the dashboard offers. Anything else is snapped to the nearest of these. */
export const RANGE_OPTIONS = [1, 7, 30, 90] as const;

const DEFAULT_DAYS = 1;

/**
 * Reads the requested window, refusing to be talked into an unbounded one.
 *
 * A range is a database query someone can set from a URL, so it is clamped rather than trusted:
 * the retention window is the most that exists, and asking for more than that would only ever
 * scan rows that are not there.
 */
export function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), ANALYTICS_RETENTION_DAYS);
}
