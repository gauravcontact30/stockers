import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, cacheHeaders } from "../../../lib/cache";
import { getBseBoard } from "../../../lib/bse-market";

/**
 * Request-independent, so the board is cached rather than rebuilt per reader.
 *
 * `use cache` cannot sit on the `GET` export itself, which is why the read lives in its own
 * function. This is what `export const revalidate = 60` used to say; the window now comes from the
 * `market` profile in next.config.ts, and the `bse` tag is what the admin purge drops.
 */
async function board() {
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.bse);

  return getBseBoard();
}

export async function GET() {
  return NextResponse.json(await board(), {
    headers: cacheHeaders(60),
  });
}
