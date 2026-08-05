import { NextResponse } from "next/server";
import { generateComparison } from "../../lib/stock-compare";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const stockA = typeof body?.stockA === "string" ? body.stockA.trim() : "";
  const stockB = typeof body?.stockB === "string" ? body.stockB.trim() : "";

  if (!stockA || !stockB) {
    return NextResponse.json({ error: "stockA and stockB are required" }, { status: 400 });
  }

  const result = await generateComparison(stockA, stockB);
  return NextResponse.json(result);
}
