import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, cacheHeaders } from "../../../lib/cache";
import { getEtfBoard } from "../../../lib/nse-market";

// Request-independent: the same board for every reader, so it is cached rather than rebuilt per
// request. `use cache` cannot go on the `GET` export, hence the helper. The `board` profile in
// next.config.ts carries the interval `revalidate = 300` used to; the `nse` tag drops it on demand.
async function etfBoard() {
  "use cache";
  cacheLife("board");
  cacheTag(CACHE_TAGS.nse);

  return getEtfBoard();
}

export async function GET() {
  return NextResponse.json(await etfBoard(), { headers: cacheHeaders(300) });
}
