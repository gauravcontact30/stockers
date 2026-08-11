import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getNewsStory } from "../../../lib/market-news";

export const dynamic = "force-dynamic";

/**
 * One headline, expanded: an AI brief written from the publishers' own coverage, plus that
 * coverage itself with a link to each report.
 *
 * The headline is passed in rather than looked up because the feed is a rolling cache — by the
 * time a reader opens a story, the item may have aged out of the list it was clicked from.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = params.get("title");
  const url = params.get("url");

  if (!title || !url) {
    return NextResponse.json({ error: "title and url are required" }, { status: 400 });
  }

  // A story is written once over coverage that has already been published, so it does not change
  // underneath a reader. Ten minutes at the edge — the same window the IPO board uses — keeps a
  // headline that several readers open in a row from being re-summarised for each of them.
  return NextResponse.json(await getNewsStory({ title, url, symbol: params.get("symbol") }), {
    headers: cacheHeaders(600),
  });
}
