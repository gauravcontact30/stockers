import { NextResponse } from "next/server";
import { parseBrief, readBoard } from "../../../lib/board-read";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { isFeatureKey } from "../../../lib/subscription";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Same rule as the verdicts route: the caller names the section it speaks for and is charged
  // against that section's own feature, so a locked board can't be read through this endpoint.
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!isFeatureKey(feature)) {
    return NextResponse.json({ error: "a known feature is required" }, { status: 400 });
  }

  const guard = await guardFeature(request, feature);
  if (!guard.allowed) return lockedResponse(guard, feature);

  const brief = parseBrief(body?.brief);
  if (!brief) {
    return NextResponse.json({ error: "brief must carry a subject, a question and some figures" }, { status: 400 });
  }

  return NextResponse.json({ read: await readBoard(brief) });
}
