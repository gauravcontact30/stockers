import { NextResponse } from "next/server";
import { getMarketPulse } from "../../../lib/market-pulse";

export const dynamic = "force-dynamic";

export async function GET() {
  const pulse = await getMarketPulse();
  return NextResponse.json(pulse);
}
