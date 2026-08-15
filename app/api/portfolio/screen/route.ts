import { NextRequest, NextResponse } from "next/server";
import { getBseRows } from "../../../lib/bse-market";
import { listHoldings, portfolioSetupError } from "../../../lib/portfolio";
import { DEFAULT_CRITERIA, screenStocks, type ScreenCriteria, type SectorFit } from "../../../lib/portfolio-screen";
import { userFromRequest } from "../../../lib/store";

/**
 * The listed universe, filtered against the caller's own book.
 *
 * The filtering itself is exchange data and plain arithmetic, so it is not paywalled — the same
 * figures are already public on the directory board. What the reader's portfolio adds is which
 * rows to drop and which cap tiers to reward, and that needs the session, so this is signed-in
 * only. The AI read over the shortlist is gated where every other read is.
 */

/** A number from the query string, or null when it is absent or not one. */
function numberParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

const TIERS: ScreenCriteria["tier"][] = ["all", "Large", "Mid", "Small"];
const FITS: SectorFit[] = ["any", "diversify", "concentrate"];
const SORTS: ScreenCriteria["sort"][] = ["score", "change", "mcap", "price", "turnover"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function criteriaFrom(params: URLSearchParams): ScreenCriteria {
  return {
    tier: pick(params.get("tier"), TIERS, DEFAULT_CRITERIA.tier),
    minPrice: numberParam(params, "minPrice"),
    maxPrice: numberParam(params, "maxPrice"),
    minChangePercent: numberParam(params, "minChange"),
    maxChangePercent: numberParam(params, "maxChange"),
    minMarketCapCr: numberParam(params, "minMcap"),
    minTurnoverCr: numberParam(params, "minTurnover"),
    // Absent means the default (on) rather than off, so a bare request screens for decisions still
    // to take rather than handing back a list the reader has already acted on.
    excludeHeld: params.get("excludeHeld") !== "false",
    fit: pick(params.get("fit"), FITS, DEFAULT_CRITERIA.fit),
    sort: pick(params.get("sort"), SORTS, DEFAULT_CRITERIA.sort),
  };
}

export async function GET(request: NextRequest) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in to screen against your portfolio." }, { status: 401 });

  const criteria = criteriaFrom(request.nextUrl.searchParams);

  let rows: Awaited<ReturnType<typeof getBseRows>>["rows"];
  let sessionDate: string | null;
  let holdings: Awaited<ReturnType<typeof listHoldings>>;
  try {
    [{ rows, sessionDate }, holdings] = await Promise.all([getBseRows(), listHoldings(user.id)]);
  } catch (error) {
    const setup = portfolioSetupError(error);
    if (!setup) throw error;
    return NextResponse.json({ error: setup, setup: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const result = screenStocks(
    rows,
    criteria,
    holdings.map((holding) => holding.symbol),
    // Only tiers the reader actually owns count as covered — a stock they are merely tracking is
    // not an exposure, so it must not suppress the "you hold nothing here" bonus.
    holdings
      .filter((holding) => holding.quantity > 0)
      .map((holding) => rows.find((row) => row.ticker.toUpperCase() === holding.symbol.toUpperCase())?.capTier)
      .filter((tier): tier is NonNullable<typeof tier> => Boolean(tier)),
  );

  return NextResponse.json(
    { ...result, sessionDate, universe: rows.length },
    // Shaped by the caller's own holdings, so never in a shared cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
