import { NextRequest, NextResponse } from "next/server";
import { getMarketNews } from "../../lib/market-news";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const feed = await getMarketNews(symbol);

  return NextResponse.json(feed, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
  });
}
