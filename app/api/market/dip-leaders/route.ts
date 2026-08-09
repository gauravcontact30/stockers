import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getDipLeaders } from "../../../lib/dip-leaders";

/**
 * The year's winners that are on sale today.
 *
 * Deliberately public and ungated, unlike `/api/market/dip-winners` next door. That one is a
 * screener a subscriber drives with their own filters; this is the fixed three the landing page's
 * hero shows to a visitor who has not signed up yet, so gating it would leave the hero blank for
 * exactly the audience it exists for.
 *
 * Deliberately *not* prerendered, unlike the other request-independent feeds here. This screen
 * needs the Bhavcopy tape and four reference sessions, and a build machine reaching a cold BSE
 * cannot always get them — the first attempt baked an empty board into the build and served it to
 * the landing page for the whole revalidate window. Resolving it at runtime instead means a bad
 * build can never do that, and costs nothing after the first request: the board underneath is held
 * for a quarter of an hour and refreshed behind the reader.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getDipLeaders(), { headers: cacheHeaders(900) });
}
