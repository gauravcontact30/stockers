import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../../lib/cache";
import {
  BSE_PLATFORMS,
  getBseTrending,
  type BsePlatform,
  type TrendingDirection,
  type TrendingQuery,
  type TrendingRank,
} from "../../../../lib/bse-market";
import { BROKERS, type BrokerId } from "../../../../lib/brokers";

const RANKS: TrendingRank[] = ["brokers", "turnover", "trades", "volume"];
const BROKER_IDS: (BrokerId | "all")[] = ["all", ...BROKERS.map((broker) => broker.id)];
const TIERS: NonNullable<TrendingQuery["tier"]>[] = ["all", "large", "mid", "small"];
const PLATFORMS: (BsePlatform | "all")[] = ["all", ...BSE_PLATFORMS];
const DIRECTIONS: TrendingDirection[] = ["all", "bought", "sold"];
/** The trailing windows the board's return column offers. Anything else falls back to one month. */
const RETURN_PERIODS: NonNullable<TrendingQuery["returnPeriod"]>[] = ["1m", "1y", "3y", "5y"];

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
    direction: pick(params.get("direction"), DIRECTIONS, "all"),
    returnPeriod: pick(params.get("period"), RETURN_PERIODS, "1m"),
    minPercent: amount(params.get("min")),
    page: count(params.get("page")) ?? 1,
    // Clamped inside getBseTrending, so a hand-edited URL cannot ask for the whole exchange —
    // or for the per-scrip sector lookups that come with every row returned.
    pageSize: count(params.get("pageSize")),
    // Every caller of this endpoint is a board on somebody's screen, and during market hours the
    // price beside a company should be the one it is trading at. Ignored outside the session.
    live: true,
  });

  // Half the window while the exchange is open, because that is the only time the answer changes
  // inside a minute — the boards on the other end poll every 30s during a session, and a 60s cache
  // would hand half of those polls back the figures they already had.
  return NextResponse.json(board, { headers: cacheHeaders(board.marketSession === "live" ? 30 : 60) });
}
