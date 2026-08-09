import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { guardFeature } from "../../../lib/feature-guard";
import { getMarketPulse } from "../../../lib/market-pulse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const [pulse, guard] = await Promise.all([getMarketPulse(), guardFeature(request, "market-pulse")]);

  // This section is a mix: the breadth, index levels and movers are exchange data, while the
  // written summary and themes are AI. Only the AI half is withheld, so a locked-out visitor
  // still sees real market numbers rather than an empty card.
  if (!guard.allowed) {
    return NextResponse.json({
      ...pulse,
      summary: "",
      themes: [],
      sectorsToWatch: [],
      aiLocked: true,
      lockReason: guard.locked ? "admin" : "subscription",
    });
  }

  // Private, not shared: the AI half of this board is withheld or included depending on who is
  // asking, so a shared cache must never hand one reader another's entitlements.
  return NextResponse.json({ ...pulse, aiLocked: false }, { headers: cacheHeaders(60, "private") });
}
