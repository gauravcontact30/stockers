import { NextResponse } from "next/server";
import { getStockDetail } from "../../../lib/stock-detail";

export const dynamic = "force-dynamic";

/**
 * Everything about one company, plus the top performers of its own category.
 *
 * Public, like the rest of the exchange boards: the figures here are BSE's own published data, and
 * the AI layer that reads them is what the subscription gates.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Name a company, ticker, scrip code or ISIN." }, { status: 400 });
  }

  try {
    const detail = await getStockDetail(query);
    if (!detail) {
      return NextResponse.json({ error: `Nothing listed matches "${query}".` }, { status: 404 });
    }

    return NextResponse.json(detail, {
      headers: {
        // Prices move within a session but the archive behind the returns does not, so this is
        // held about as long as the rest of the exchange boards.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "The exchange feed could not be reached just now." }, { status: 502 });
  }
}
