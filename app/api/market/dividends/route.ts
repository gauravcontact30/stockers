import { NextResponse } from "next/server";
import { getDividendBoard } from "../../../lib/nse-dividends";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getDividendBoard());
}
