import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getTrendingSectors } from "../../../lib/nse-market";

// Request-independent: the same board for every reader, so Next may cache the whole response
// and hand it back without running this handler at all. `revalidate` is the interval past
// which it refreshes; the `nse` cache tag drops it on demand.
export const revalidate = 300;

export async function GET() {
  return NextResponse.json(await getTrendingSectors(), { headers: cacheHeaders(300) });
}
