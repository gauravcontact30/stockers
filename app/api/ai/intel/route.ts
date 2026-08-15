import { NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { parseIntelQuery, searchIntel } from "../../../lib/market-intel";

/**
 * The AI intelligence search: one question about one BSE-listed company, answered from the web.
 *
 * Gated on its own feature key, like every other AI surface — the panel in the browser hides
 * itself for a lapsed reader, but this is what actually refuses.
 */
export async function POST(request: Request) {
  const guard = await guardFeature(request, "intel");
  if (!guard.allowed) return lockedResponse(guard, "intel");

  const body = await request.json().catch(() => null);
  const intel = parseIntelQuery(body);
  if (!intel) {
    return NextResponse.json({ error: "Type a company, a ticker or a question to search." }, { status: 400 });
  }

  return NextResponse.json(await searchIntel(intel));
}
