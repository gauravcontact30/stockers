import { NextResponse } from "next/server";
import { cacheHeaders } from "../../lib/cache";
import { getWelcomeBrief } from "../../lib/welcome-brief";

/**
 * The welcome: every stock that cleared today's screen, and one tip about trading the BSE today.
 *
 * The dialog shows two of the stocks and draws its own pair per visit, which is why the whole
 * qualified set is sent rather than a chosen two — one cached brief cannot pick a different pair
 * for each of the readers sharing it.
 *
 * Deliberately not behind `guardFeature`. Everything else that reads the model on this site is
 * something a reader chose to open, and gating those is what the plans are for; this one greets
 * somebody who has been on the landing page for five seconds and has no account to gate against.
 * It costs nothing extra to serve either — the whole brief is built once every half hour and
 * shared, so a thousand first visits are one model call.
 */
export async function GET() {
  return NextResponse.json(await getWelcomeBrief(), {
    // Public and short: the same brief is correct for every arrival — the two names differ per
    // visit, but that is drawn in the browser — and the underlying
    // brief has its own half-hour clock, so this only decides how often a CDN re-asks for it.
    headers: cacheHeaders(300, "public"),
  });
}
