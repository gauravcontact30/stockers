import { NextResponse } from "next/server";
import { getBenchmarkIndices } from "../../../lib/market-indices";

export const dynamic = "force-dynamic";

/**
 * How fresh an index level may be before it is fetched again.
 *
 * One second, so a new print is on the cards within a second of the feed carrying it. This was two,
 * which put a second of hold on top of the client's own poll and meant a level could be up to ~2.5s
 * behind — visibly slower than the "updates every second" the panel implies.
 *
 * The rate this costs upstream is bounded by the cache, not by the audience: the loader is keyed by
 * symbol on the server, so this is at most three Yahoo calls a second in total no matter how many
 * people have the dashboard open. Going below a second would not help — the feed itself does not
 * reprint the benchmarks faster than that.
 */
const LIVE_MAX_AGE_MS = 1_000;

export async function GET() {
  const indices = await getBenchmarkIndices(LIVE_MAX_AGE_MS);

  return NextResponse.json(
    { indices, asOf: new Date().toISOString() },
    // Never stored: a cached copy at the edge would freeze the very thing this endpoint exists
    // to keep moving.
    { headers: { "Cache-Control": "no-store" } },
  );
}
