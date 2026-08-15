import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../lib/cache";
import { guardFeature, lockedResponse } from "../../lib/feature-guard";
import { getMarketNews } from "../../lib/market-news";

export async function GET(request: NextRequest) {
  const guard = await guardFeature(request, "news");
  if (!guard.allowed) return lockedResponse(guard, "news");

  const symbol = request.nextUrl.searchParams.get("symbol");
  const feed = await getMarketNews(symbol);

  return NextResponse.json(feed, {
    headers: cacheHeaders(300, "private"),
  });
}
