import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getBseMarketSnapshot } from "../../../lib/bse-market-snapshot";
import { getOwnership } from "../../../lib/shareholding";

export const dynamic = "force-dynamic";

/**
 * Who owns one listed company, from its own quarterly filing.
 *
 * Public, like the other exchange boards: this is a certified disclosure the exchange republishes,
 * not an AI reading of it.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param is required" }, { status: 400 });
  }

  const [ownership, market] = await Promise.all([
    getOwnership(symbol),
    getBseMarketSnapshot(symbol).catch(() => null),
  ]);
  if (!ownership) {
    return NextResponse.json(
      { error: `No shareholding pattern is published for ${symbol.toUpperCase()}.`, market },
      { status: 404 },
    );
  }

  // Filed quarterly, so an hour at the edge is nothing next to how often it changes.
  return NextResponse.json({ ...ownership, market }, { headers: cacheHeaders(3600) });
}
