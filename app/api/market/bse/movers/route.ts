import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../../lib/cache";
import { getBseMovers, type MoverQuery } from "../../../../lib/bse-market";

export const dynamic = "force-dynamic";

const TIERS: NonNullable<MoverQuery["tier"]>[] = ["all", "large", "mid", "small"];
const DIRECTIONS: NonNullable<MoverQuery["direction"]>[] = ["gainers", "losers"];
const PERIODS: NonNullable<MoverQuery["period"]>[] = ["1d", "1w", "3m", "6m", "1y", "3y", "5y", "overall"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A positive integer query param, or undefined when absent or unparseable. */
function count(value: string | null): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** A positive decimal query param — the minimum-move filter arrives as "2.5". */
function amount(value: string | null): number | undefined {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const movers = await getBseMovers({
    tier: pick(params.get("tier"), TIERS, "all"),
    direction: pick(params.get("direction"), DIRECTIONS, "gainers"),
    period: pick(params.get("period"), PERIODS, "1d"),
    q: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    minPercent: amount(params.get("min")),
    page: count(params.get("page")) ?? 1,
    // Clamped inside getBseMovers, so a hand-edited URL cannot ask for the whole exchange in one
    // response — or for the sector lookups that would come with it.
    pageSize: count(params.get("pageSize")),
  });

  return NextResponse.json(movers, {
    headers: cacheHeaders(60),
  });
}
