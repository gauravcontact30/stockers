import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { getMostBoughtToday } from "../../../lib/most-bought";

/**
 * The buying board behind the landing ribbon.
 *
 * Request-independent — the same board for every reader — but deliberately *not* on the long
 * `board` cache profile the other exchange endpoints use: this one is the thing on the page that
 * claims to move with the session, so it is held for thirty seconds and no longer. The reads
 * underneath it are themselves cached (the BSE tape, the broker lists, the live quotes each carry
 * their own TTL), so a miss here costs a join, not a scrape.
 */
export async function GET() {
  return NextResponse.json(await getMostBoughtToday(), { headers: cacheHeaders(30) });
}
