import { NextResponse } from "next/server";
import { getBseSectorBoard } from "../../../../lib/bse-market";

export const dynamic = "force-dynamic";

export async function GET() {
  const board = await getBseSectorBoard();

  return NextResponse.json(board, {
    headers: {
      // While the exchange is still being classified the answer changes every few seconds, so it
      // is only held for as long as it takes to finish; after that it is as stable as the session.
      "Cache-Control": board.classification.ready
        ? "public, max-age=60, stale-while-revalidate=300"
        : "public, max-age=10",
    },
  });
}
