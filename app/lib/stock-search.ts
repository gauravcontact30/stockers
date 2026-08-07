// Search across every listed company, not just the ones we classified by hand.
//
// Two catalogues sit behind this. `indianStocks` is ~390 companies with a hand-picked sector and a
// checked website; `bseCatalogue()` is all ~4,950 active BSE equities with the sector BSE files
// them under. A symbol in both takes the hand-classified version, because its sector is the finer
// one — "Pharmaceuticals" rather than BSE's "Healthcare".
//
// This module is server-side. Packed, the full catalogue is ~260 KB, which is why the browser asks
// /api/stocks/search rather than filtering a copy of the exchange locally.

import { bseCatalogue } from "./bse-catalogue";
import { indianStocks, sectors, type CapTier } from "./indian-stocks";

export type SearchHit = {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  /** True for the hand-classified names, which is what the empty-query view shows. */
  curated: boolean;
};

export type SearchGroup = { sector: string; stocks: SearchHit[]; total: number };

export type SearchResult = {
  groups: SearchGroup[];
  /** Every match, including the ones held back by the per-group cap. */
  total: number;
  /** How many are actually in `groups`. */
  shown: number;
  sectors: string[];
};

export const ALL_SECTORS = "All categories";

/** How much of the answer is drawn at once. Enough to browse, not enough to scroll forever. */
const MAX_GROUPS = 8;
const MAX_PER_GROUP = 6;

const sectorNameFor = (key: string) => sectors.find((sector) => sector.key === key)?.name ?? "Unclassified";

let index: SearchHit[] | null = null;

/** Every listed company, hand-classified entries first. Built once, on first search. */
export function searchIndex(): SearchHit[] {
  if (index) return index;

  const bySymbol = new Map<string, SearchHit>();

  for (const stock of indianStocks) {
    bySymbol.set(stock.symbol, {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      curated: true,
    });
  }

  for (const entry of bseCatalogue()) {
    if (bySymbol.has(entry.symbol)) continue;
    bySymbol.set(entry.symbol, {
      symbol: entry.symbol,
      name: entry.name,
      sector: sectorNameFor(entry.sector),
      capTier: entry.capTier,
      curated: false,
    });
  }

  index = [...bySymbol.values()];
  return index;
}

let presentSectors: string[] | null = null;

/**
 * Every sector with at least one listed company behind it, in the order the app defines them.
 *
 * Memoised because it is returned with every search and walking ~4,950 rows per keystroke is
 * work for an answer that cannot change until the catalogue is regenerated.
 */
export function searchSectors(): string[] {
  if (presentSectors) return presentSectors;

  const present = new Set(searchIndex().map((hit) => hit.sector));
  presentSectors = sectors.map((sector) => sector.name).filter((name) => present.has(name));
  return presentSectors;
}

/**
 * How well a hit answers the query. Lower sorts first.
 *
 * An exact ticker beats a ticker that starts with the term, which beats a name that starts with
 * it, which beats a match buried anywhere. Someone typing "TCS" means the ticker, not the three
 * letters inside "Rashtriya Chemicals". Within a rank the hand-classified name wins, so a search
 * for "tata" leads with the companies we know rather than a dormant shell with Tata in its name.
 */
function rank(hit: SearchHit, term: string): number {
  const symbol = hit.symbol.toLowerCase();
  const name = hit.name.toLowerCase();

  const base = symbol === term ? 0 : symbol.startsWith(term) ? 1 : name.startsWith(term) ? 2 : symbol.includes(term) ? 3 : 4;
  return base * 2 + (hit.curated ? 0 : 1);
}

/**
 * Matches for a query, bucketed by sector.
 *
 * An empty query is not "everything" — 4,950 rows grouped by sector is not a list anyone reads.
 * It answers with the hand-classified names only, which is the browsable catalogue.
 */
export function searchStocks(query: string, sector: string = ALL_SECTORS): SearchResult {
  const term = query.trim().toLowerCase();

  const matches = searchIndex().filter((hit) => {
    if (sector !== ALL_SECTORS && hit.sector !== sector) return false;
    if (!term) return hit.curated;
    return hit.symbol.toLowerCase().includes(term) || hit.name.toLowerCase().includes(term);
  });

  const buckets = new Map<string, SearchHit[]>();
  for (const hit of matches) {
    const bucket = buckets.get(hit.sector);
    if (bucket) bucket.push(hit);
    else buckets.set(hit.sector, [hit]);
  }

  // Sectors with the strongest single match lead, so a one-word query does not open on whichever
  // sector happens to come first in the catalogue.
  const groups = [...buckets.entries()]
    .map(([name, hits]) => {
      const sorted = [...hits].sort((a, b) => rank(a, term) - rank(b, term) || a.symbol.localeCompare(b.symbol));
      return { sector: name, total: sorted.length, stocks: sorted.slice(0, MAX_PER_GROUP), best: rank(sorted[0], term) };
    })
    .sort((a, b) => a.best - b.best || b.total - a.total)
    .slice(0, MAX_GROUPS)
    .map(({ sector: name, total, stocks }) => ({ sector: name, total, stocks }));

  return {
    groups,
    total: matches.length,
    shown: groups.reduce((sum, group) => sum + group.stocks.length, 0),
    sectors: searchSectors(),
  };
}

/** One company by ticker, or null. Used to name a stock the browser only knows the symbol of. */
export function findStock(symbol: string): SearchHit | null {
  const wanted = symbol.trim().toUpperCase();
  return searchIndex().find((hit) => hit.symbol === wanted) ?? null;
}
