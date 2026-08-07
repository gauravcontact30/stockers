import { NextResponse } from "next/server";
import { getBseBoard } from "../../../lib/bse-market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBseBoard(), {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
