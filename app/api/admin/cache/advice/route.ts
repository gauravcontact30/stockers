import { NextResponse } from "next/server";
import { adviseOnCache } from "../../../../lib/cache-advisor";
import { buildCacheReport } from "../../../../lib/cache-report";
import { userFromRequest } from "../../../../lib/store";

/**
 * What to purge, and what it would cost.
 *
 * Split from `GET /api/admin/cache` rather than folded into it because the two have very different
 * costs: the inventory is a walk over a map and the panel polls it, while this may wait on a model.
 * Bundling them would put a fifteen-second worst case in front of a table that renders instantly.
 *
 * The recommendation itself is decided from the figures either way — see the header of
 * `../../../../lib/cache-advisor` for why the model is only ever allowed to phrase it.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const advice = await adviseOnCache(await buildCacheReport());
  return NextResponse.json(advice, { headers: { "Cache-Control": "no-store" } });
}
