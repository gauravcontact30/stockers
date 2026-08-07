import { indianStocks, type CapTier } from "./indian-stocks";
import { stockIcon } from "./company-logos";
import { indianETFs } from "./indian-etfs";
import { getQuotesFor, type QuoteSubject } from "./market-data";

export type CompetitorQuote = {
  symbol: string;
  name: string;
  logo: string | null;
  price: number | null;
  changePercent: number | null;
  isSelf: boolean;
};

export type CompetitorsSummary = {
  symbol: string;
  group: string;
  groupType: "sector" | "category";
  peers: CompetitorQuote[];
};

const MAX_PEERS = 5;
const CAP_TIER_RANK: Record<CapTier, number> = { Large: 0, Mid: 1, Small: 2 };

type Entry = QuoteSubject & { name: string; logo: string | null; positionRank: number };

// Ranks the current stock/ETF against same-sector (or same-category, for ETFs) peers by
// market position — cap tier for stocks (Large > Mid > Small), popularity for ETFs — not by
// today's volatile price move, so the stock lands at its real standing in the sector, not
// wherever a one-day swing happens to put it.
export async function getCompetitors(symbolInput: string): Promise<CompetitorsSummary | null> {
  const symbol = symbolInput.trim().toUpperCase();

  const stock = indianStocks.find((s) => s.symbol === symbol);
  if (stock) {
    const peers = indianStocks.filter((s) => s.sector === stock.sector && s.symbol !== symbol).slice(0, MAX_PEERS);
    const entries: Entry[] = [stock, ...peers].map((s) => ({
      symbol: s.symbol,
      yahooSymbol: s.yahooSymbol,
      name: s.name,
      logo: stockIcon(s.symbol, s.domain),
      positionRank: CAP_TIER_RANK[s.capTier],
    }));
    return buildSummary(symbol, stock.sector, "sector", entries);
  }

  const etf = indianETFs.find((e) => e.symbol === symbol);
  if (etf) {
    const peers = indianETFs.filter((e) => e.category === etf.category && e.symbol !== symbol).slice(0, MAX_PEERS);
    const entries: Entry[] = [etf, ...peers].map((e) => ({
      symbol: e.symbol,
      yahooSymbol: e.yahooSymbol,
      name: e.name,
      logo: stockIcon(e.symbol, e.domain),
      positionRank: e.popular ? 0 : 1,
    }));
    return buildSummary(symbol, etf.category, "category", entries);
  }

  return null;
}

async function buildSummary(symbol: string, group: string, groupType: "sector" | "category", entries: Entry[]): Promise<CompetitorsSummary | null> {
  if (entries.length <= 1) return null;

  const quotes = await getQuotesFor(entries.map(({ symbol: s, yahooSymbol }) => ({ symbol: s, yahooSymbol })));
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const peers: (CompetitorQuote & { positionRank: number; price0: number })[] = entries.map((entry) => {
    const price = quoteMap.get(entry.symbol)?.price ?? null;
    return {
      symbol: entry.symbol,
      name: entry.name,
      logo: entry.logo,
      price,
      changePercent: quoteMap.get(entry.symbol)?.changePercent ?? null,
      isSelf: entry.symbol === symbol,
      positionRank: entry.positionRank,
      // Secondary tie-breaker within the same market-position tier — we don't have real market
      // cap figures, so price is the best available proxy for standing among same-tier peers.
      price0: price ?? -Infinity,
    };
  });

  peers.sort((a, b) => a.positionRank - b.positionRank || b.price0 - a.price0);

  return { symbol, group, groupType, peers: peers.map(({ positionRank: _positionRank, price0: _price0, ...rest }) => rest) };
}
