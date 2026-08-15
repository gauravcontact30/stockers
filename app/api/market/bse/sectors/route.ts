import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../../lib/cache";
import { getBseSectorBoard } from "../../../../lib/bse-market";

export async function GET(request: NextRequest) {
  const board = await getBseSectorBoard({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });

  return NextResponse.json(board, {
    headers: {
      // While the exchange is still being classified the answer changes every few seconds, so it
      // is only held for as long as it takes to finish; after that it is as stable as the session.
      ...cacheHeaders(board.classification.ready ? 60 : 10),
    },
  });
}
