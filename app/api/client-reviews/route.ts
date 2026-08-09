import { NextResponse } from "next/server";
import { listClientReviews } from "../../lib/client-reviews";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ reviews: await listClientReviews() });
}
