import { NextRequest, NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { companyLogoUrl, indianStocks, sectors, type CapTier } from "../../../lib/indian-stocks";
import { getReturnsForPeriod, type ReturnPeriod } from "../../../lib/historical-returns";
import { getAllQuotes } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

// Defaults are tuned to auto-surface the most relevant "buy the dip" set on first load: proven
// winners over the selected lookback period that have also pulled back over a (separately
// selectable) decline period, and are trading at their biggest discount today, without the
// visitor touching a filter.
const DEFAULT_MIN_RETURN = 20;
const DEFAULT_MIN_DECLINE = 0;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const CAP_TIERS: CapTier[] = ["Large", "Mid", "Small"];

const PERIOD_OPTIONS = new Set<ReturnPeriod>(["1mo", "6mo", "1y", "3y", "5y", "max"]);
const DEFAULT_PERIOD: ReturnPeriod = "6mo";
const DEFAULT_DECLINE_PERIOD: ReturnPeriod = "1mo";

function parseNumber(value: string | null, fallback: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePeriod(value: string | null, fallback: ReturnPeriod): ReturnPeriod {
  return value && PERIOD_OPTIONS.has(value as ReturnPeriod) ? (value as ReturnPeriod) : fallback;
}

export async function GET(request: NextRequest) {
  const guard = await guardFeature(request, "dip-winners");
  if (!guard.allowed) return lockedResponse(guard, "dip-winners");

  const params = request.nextUrl.searchParams;

  const period = parsePeriod(params.get("period"), DEFAULT_PERIOD);
  const declinePeriod = parsePeriod(params.get("declinePeriod"), DEFAULT_DECLINE_PERIOD);

  const minReturn = Math.max(0, parseNumber(params.get("minReturn"), DEFAULT_MIN_RETURN));
  const minDecline = Math.max(0, parseNumber(params.get("minDecline"), DEFAULT_MIN_DECLINE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseNumber(params.get("limit"), DEFAULT_LIMIT)));

  const sectorParam = params.get("sector");
  const selectedSectorMeta = sectorParam ? sectors.find((s) => s.key === sectorParam) : null;

  const capTierParam = params.get("capTier");
  const selectedCapTiers = capTierParam
    ? capTierParam.split(",").filter((tier): tier is CapTier => (CAP_TIERS as string[]).includes(tier))
    : CAP_TIERS;

  const [quotes, periodReturns, declineReturns] = await Promise.all([
    getAllQuotes(),
    getReturnsForPeriod(period),
    // Avoid fetching (and re-writing) the same disk cache twice when both dropdowns point at
    // the same period — reuse the one result instead of racing two identical requests.
    period === declinePeriod ? Promise.resolve(null) : getReturnsForPeriod(declinePeriod),
  ]);
  const declineData = declineReturns ?? periodReturns;
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const candidates: {
    symbol: string;
    name: string;
    sector: string;
    capTier: CapTier;
    logo: string;
    price: number | null;
    changePercent: number;
    periodReturn: number;
    declineReturn: number;
  }[] = [];

  for (const stock of indianStocks) {
    if (selectedSectorMeta && stock.sector !== selectedSectorMeta.name) continue;
    if (!selectedCapTiers.includes(stock.capTier)) continue;

    const quote = quoteMap.get(stock.symbol);
    const periodReturn = periodReturns.returns[stock.symbol];
    const declineReturn = declineData.returns[stock.symbol];

    if (!quote?.live) continue;

    // "Today most cheaper rate to buy" is the constant, non-negotiable screen — a stock has to
    // be down today to appear here at all, regardless of which performance period is selected.
    if (typeof quote.changePercent !== "number" || quote.changePercent >= 0) continue;

    if (typeof periodReturn !== "number" || periodReturn <= minReturn) continue;
    if (typeof declineReturn !== "number" || declineReturn > -minDecline) continue;

    candidates.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      logo: companyLogoUrl(stock.domain),
      price: quote.price,
      changePercent: quote.changePercent,
      periodReturn,
      declineReturn,
    });
  }

  // Rank by today's steepest discount first (the literal "cheapest to buy today" signal), then
  // by the strongest performance over the selected period as a quality tiebreaker.
  candidates.sort((a, b) => a.changePercent - b.changePercent || b.periodReturn - a.periodReturn);
  const stocks = candidates.slice(0, limit);

  return NextResponse.json({
    stocks,
    period,
    declinePeriod,
    generatedAt: periodReturns.generatedAt,
    asOfDate: periodReturns.date,
    filters: {
      sector: selectedSectorMeta?.key ?? null,
      capTiers: selectedCapTiers,
      period,
      minReturn,
      declinePeriod,
      minDecline,
      limit,
    },
    availableSectors: sectors.map(({ key, name }) => ({ key, name })),
    source: "Yahoo Finance (unofficial public feed)",
  });
}
