import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, cacheHeaders } from "../../../lib/cache";
import { getDividendBoard } from "../../../lib/nse-dividends";

// Request-independent: the same board for every reader, so it is cached rather than rebuilt per
// request. `use cache` cannot go on the `GET` export, hence the helper. The `filings` profile in
// next.config.ts carries the interval `revalidate = 900` used to; the `nse` tag drops it on demand.
async function dividends() {
  "use cache";
  cacheLife("filings");
  cacheTag(CACHE_TAGS.nse);

  return getDividendBoard();
}

export async function GET() {
  return NextResponse.json(await dividends(), { headers: cacheHeaders(900) });
}
