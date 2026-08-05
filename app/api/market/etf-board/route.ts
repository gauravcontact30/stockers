import { NextResponse } from "next/server";
import { getEtfBoard } from "../../../lib/nse-market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getEtfBoard());
}
