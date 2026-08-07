import { NextRequest, NextResponse } from "next/server";
import { getBseMovers, type MoverQuery } from "../../../../lib/bse-market";

export const dynamic = "force-dynamic";

const TIERS: NonNullable<MoverQuery["tier"]>[] = ["all", "large", "mid", "small"];
const DIRECTIONS: NonNullable<MoverQuery["direction"]>[] = ["gainers", "losers"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number.parseInt(params.get("page") ?? "1", 10);

  const movers = await getBseMovers({
    tier: pick(params.get("tier"), TIERS, "all"),
    direction: pick(params.get("direction"), DIRECTIONS, "gainers"),
    page: Number.isFinite(page) ? page : 1,
  });

  return NextResponse.json(movers, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
