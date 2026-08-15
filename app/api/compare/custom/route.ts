import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { compareCustom, MAX_CUSTOM_STOCKS } from "../../../lib/sector-compare";

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

  // Private, because the route is gated: a shared cache must never hand one reader a comparison
  // another reader's entitlement paid for. Five minutes matches the verdict window underneath it,
  // so re-ordering the same two stocks costs the browser nothing.
  return NextResponse.json(await compareCustom(symbols), { headers: cacheHeaders(300, "private") });
}
