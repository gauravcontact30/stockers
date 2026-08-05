import { NextResponse } from "next/server";
import { generateAnalysis } from "../../lib/stock-analysis";

export async function POST(request: Request) {
  const body = await request.json();
  const stock = (body?.stock || "RELIANCE").toString();
  const analysis = await generateAnalysis(stock);
  return NextResponse.json(analysis);
}
