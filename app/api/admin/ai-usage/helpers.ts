/** The windows the dashboard offers. Anything else is snapped into range. */
export const RANGE_OPTIONS = [1, 7, 30] as const;

const DEFAULT_DAYS = 1;

/**
 * How far back this will look, whatever is asked for.
 *
 * Shorter than the analytics window on purpose: model calls are recorded per call rather than
 * throttled per visitor, so a busy month is a great many more rows than a month of traffic, and
 * this is a panel that re-reads on a timer.
 */
export const MAX_DAYS = 30;

/** Reads the requested window, refusing to be talked into an unbounded one. */
export function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}
