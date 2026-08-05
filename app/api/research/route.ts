import { NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../lib/feature-guard";
import { generateAnalysis } from "../../lib/stock-analysis";

export async function POST(request: Request) {
  const guard = await guardFeature(request, "research");
  if (!guard.allowed) return lockedResponse(guard, "research");

  const body = await request.json();
  const stock = (body?.stock || "RELIANCE").toString();
  const analysis = await generateAnalysis(stock);
  return NextResponse.json(analysis);
}
