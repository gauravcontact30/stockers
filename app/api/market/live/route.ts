import { NextResponse } from "next/server";
import { getBenchmarkIndices } from "../../../lib/market-indices";

export const dynamic = "force-dynamic";

/**
 * How fresh an index level may be before it is fetched again.
 *
 * The pulse panel polls this twice a second so the board visibly ticks, but the upstream feed is
 * not a tick stream and would rate-limit at that rate. Two seconds is the compromise: the browser
 * repaints on its own cadence while any given index is pulled from Yahoo at most every 2s, no
 * matter how many people are watching.
 */
const LIVE_MAX_AGE_MS = 2_000;

export async function GET() {
  const indices = await getBenchmarkIndices(LIVE_MAX_AGE_MS);

  return NextResponse.json(
    { indices, asOf: new Date().toISOString() },
    // Never stored: a cached copy at the edge would freeze the very thing this endpoint exists
    // to keep moving.
    { headers: { "Cache-Control": "no-store" } },
  );
}
