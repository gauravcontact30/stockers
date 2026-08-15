import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../../lib/cache";
import { BSE_PLATFORMS, getBseTrending, type BsePlatform, type TrendingQuery, type TrendingRank } from "../../../../lib/bse-market";
import { BROKERS, type BrokerId } from "../../../../lib/brokers";

const RANKS: TrendingRank[] = ["brokers", "turnover", "trades", "volume"];
const BROKER_IDS: (BrokerId | "all")[] = ["all", ...BROKERS.map((broker) => broker.id)];
const TIERS: NonNullable<TrendingQuery["tier"]>[] = ["all", "large", "mid", "small"];
const PLATFORMS: (BsePlatform | "all")[] = ["all", ...BSE_PLATFORMS];

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

  const board = await getBseTrending({
    rank: pick(params.get("rank"), RANKS, "turnover"),
    q: params.get("q") ?? undefined,
    platform: pick(params.get("platform"), PLATFORMS, "all"),
    broker: pick(params.get("broker"), BROKER_IDS, "all"),
    tier: pick(params.get("tier"), TIERS, "all"),
    minPercent: amount(params.get("min")),
    page: count(params.get("page")) ?? 1,
    // Clamped inside getBseTrending, so a hand-edited URL cannot ask for the whole exchange —
    // or for the per-scrip sector lookups that come with every row returned.
    pageSize: count(params.get("pageSize")),
  });

  return NextResponse.json(board, { headers: cacheHeaders(60) });
}
