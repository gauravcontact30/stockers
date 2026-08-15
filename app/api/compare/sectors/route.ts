import { NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { getShowdowns } from "../../../lib/sector-compare";

export async function GET(request: Request) {
  const guard = await guardFeature(request, "compare");
  if (!guard.allowed) return lockedResponse(guard, "compare");

  return NextResponse.json(await getShowdowns(), {
    headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" },
  });
}
