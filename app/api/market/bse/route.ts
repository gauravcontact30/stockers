import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getBseBoard } from "../../../lib/bse-market";

// Request-independent, so Next may serve the whole response without running the handler.
export const revalidate = 60;

export async function GET() {
  return NextResponse.json(await getBseBoard(), {
    headers: cacheHeaders(60),
  });
}
