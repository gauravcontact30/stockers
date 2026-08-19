import { NextResponse } from "next/server";
import { cacheHeaders } from "../../lib/cache";
import { getWelcomeBrief } from "../../lib/welcome-brief";

/**
 * The first-visit welcome: two measured suggestions and a short set of BSE tips.
 *
 * Deliberately not behind `guardFeature`. Everything else that reads the model on this site is
 * something a reader chose to open, and gating those is what the plans are for; this one greets
 * somebody who has been on the landing page for ten seconds and has no account to gate against.
 * It costs nothing extra to serve either — the whole brief is built once every half hour and
 * shared, so a thousand first visits are one model call.
 */
export async function GET() {
  return NextResponse.json(await getWelcomeBrief(), {
    // Public and short: the same greeting is correct for every new arrival, and the underlying
    // brief has its own half-hour clock, so this only decides how often a CDN re-asks for it.
    headers: cacheHeaders(300, "public"),
  });
}
