import { NextRequest, NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { compareCustom, MAX_CUSTOM_STOCKS } from "../../../lib/sector-compare";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardFeature(request, "compare");
  if (!guard.allowed) return lockedResponse(guard, "compare");

  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_STOCKS);

  if (symbols.length < 2) {
    return NextResponse.json({ error: "pick at least two stocks to compare" }, { status: 400 });
  }

  return NextResponse.json(await compareCustom(symbols));
}
