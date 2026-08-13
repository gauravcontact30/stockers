import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getCompetitors } from "../../../lib/competitors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param is required" }, { status: 400 });
  }

  const data = await getCompetitors(symbol);
  // Public, not private: who a company's competitors are is the same answer for every reader and
  // is gated on nothing. Marked private it could only ever sit in one browser's cache, so every
  // reader paid the full lookup for a figure the edge could have handed them.
  return NextResponse.json(data, { headers: cacheHeaders(300) });
}
