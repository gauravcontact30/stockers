import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, cacheHeaders } from "../../../lib/cache";
import { getStockNews } from "../../../lib/nse-stock-news";

// Request-independent: the same board for every reader, so it is cached rather than rebuilt per
// request. `use cache` cannot go on the `GET` export, hence the helper. The `board` profile in
// next.config.ts carries the interval `revalidate = 300` used to. Tagged `nse` and `news` both: it
// is an NSE feed of headlines, and either purge should drop it.
async function stockNews() {
  "use cache";
  cacheLife("board");
  cacheTag(CACHE_TAGS.nse, CACHE_TAGS.news);

  return getStockNews();
}

export async function GET() {
  return NextResponse.json(await stockNews(), { headers: cacheHeaders(300) });
}
