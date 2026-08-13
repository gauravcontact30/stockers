import { NextResponse } from "next/server";
import { cacheHeaders } from "../../lib/cache";
import { listClientReviews } from "../../lib/client-reviews";

export const dynamic = "force-dynamic";

export async function GET() {
  // The same handful of published testimonials for every visitor, changing only when an admin
  // publishes one — so five minutes at the edge, and half an hour of serving a stale copy while
  // the next read refreshes it behind them. This is on the landing page, where it was previously
  // recomputed from disk on every single request.
  return NextResponse.json({ reviews: await listClientReviews() }, { headers: cacheHeaders(300) });
}
