import { NextRequest, NextResponse } from "next/server";
import { getBseStockAccuracy, searchBseAccuracyMatches } from "../../../lib/accuracy-matrix";
import { cacheHeaders } from "../../../lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const select = request.nextUrl.searchParams.get("select") === "1";

  if (query.length < 2) {
    return NextResponse.json({ matches: [], result: null }, { headers: cacheHeaders(60) });
  }

  const matches = searchBseAccuracyMatches(query);
  const exactResult = await getBseStockAccuracy(query);
  const selected = select && !exactResult ? (matches[0] ?? null) : null;
  const result = exactResult ?? (selected ? await getBseStockAccuracy(selected.scripCode) : null);

  return NextResponse.json(
    {
      matches,
      result,
      generatedAt: new Date().toISOString(),
    },
    { headers: cacheHeaders(60) },
  );
}
