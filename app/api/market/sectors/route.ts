import { NextResponse } from "next/server";
import { getTrendingSectors } from "../../../lib/nse-market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getTrendingSectors());
}
