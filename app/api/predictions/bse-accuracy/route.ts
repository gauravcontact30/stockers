import { NextResponse } from "next/server";
import { getBseAiPredictionAccuracy } from "../../../lib/bse-ai-prediction-accuracy";

export async function GET() {
  return NextResponse.json(await getBseAiPredictionAccuracy(), {
    headers: { "Cache-Control": "no-store" },
  });
}
