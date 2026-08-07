import { NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { isFeatureKey } from "../../../lib/subscription";
import { verdictsFor } from "../../../lib/stock-verdicts";

export const dynamic = "force-dynamic";

// One panel per dashboard section, each asking about the handful of stocks that section is
// already showing. More than this and the panel stops being a summary.
const MAX_SYMBOLS = 6;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // The caller names the section it is speaking for, and the paywall is applied against that
  // section's own feature — so a locked screener cannot be read through this endpoint instead.
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!isFeatureKey(feature)) {
    return NextResponse.json({ error: "a known feature is required" }, { status: 400 });
  }

  const guard = await guardFeature(request, feature);
  if (!guard.allowed) return lockedResponse(guard, feature);

  const symbols = Array.isArray(body?.symbols)
    ? body.symbols.filter((symbol: unknown): symbol is string => typeof symbol === "string").slice(0, MAX_SYMBOLS)
    : [];

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols must list at least one stock" }, { status: 400 });
  }

  return NextResponse.json({ verdicts: await verdictsFor(symbols) });
}
