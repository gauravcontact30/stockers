import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, cacheHeaders } from "../../../lib/cache";
import { companyLogoUrl } from "../../../lib/indian-stocks";
import { anticipatedIpos } from "../../../lib/open-ipos";
import { getIpoFeed } from "../../../lib/nse-ipos";

/**
 * Request-independent, so the whole payload is cached rather than rebuilt per reader.
 *
 * The shaping below — ids, the curated anticipated list, the source line — is deterministic given
 * the feed, so it is cached along with it rather than re-run on every request. `use cache` cannot
 * sit on the `GET` export, which is why this is a separate function. The `calendar` profile in
 * next.config.ts carries the interval `revalidate = 600` used to.
 */
async function ipoBoard() {
  "use cache";
  cacheLife("calendar");
  cacheTag(CACHE_TAGS.nse);

  const feed = await getIpoFeed();

  // No logo is attached here: the issue already carries the ticker it will list under, which the
  // card resolves against the logo store. Guessing a website from the company name — the old
  // approach — produced another business's icon more often than the right one.
  const ipos = feed.ipos.map((ipo) => ({ ...ipo, id: ipo.symbol }));

  // Still curated: no public feed lists companies that haven't filed a window yet. These have no
  // ticker to look up either, but their websites are hand-checked rather than guessed, so the
  // favicon is a real mark for the real company.
  const anticipated = anticipatedIpos.map((ipo) => ({ ...ipo, logo: companyLogoUrl(ipo.domain) }));

  return {
    ipos,
    anticipated,
    counts: feed.counts,
    today: feed.today,
    live: feed.live,
    generatedAt: feed.fetchedAt,
    source: feed.live
      ? "Live IPO calendar and subscription figures from NSE India"
      : "NSE IPO feed unreachable right now",
  };
}

export async function GET() {
  return NextResponse.json(await ipoBoard(), { headers: cacheHeaders(600) });
}
