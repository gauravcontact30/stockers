import { cached, fetchNse, toNumber, toText } from "./nse-client";
import { getIndustryMap, type IndustryMap } from "./nse-industry";

const TTL_MS = 5 * 60_000;
const LIST_LIMIT = 12;

export type TradedStock = {
  symbol: string;
  name: string;
  sector: string | null;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  /** Shares traded today across the exchange. */
  volume: number | null;
  /** Rupee value of everything traded today — the honest measure of "how much money moved". */
  turnover: number | null;
  /** True when the stock is in NSE's derivatives universe, which is what brokers fund on MTF. */
  mtfEligible: boolean;
};

function mapTraded(
  record: Record<string, unknown>,
  mtfUniverse: Set<string>,
  industries: IndustryMap,
): TradedStock | null {
  const symbol = toText(record.symbol);
  if (!symbol) return null;

  const meta = industries.get(symbol);

  return {
    symbol,
    // NSE's most-active feed carries no company name or sector, so both come from the industry
    // map built off NSE's own constituent lists, falling back to the ticker.
    name: meta?.name ?? symbol,
    sector: meta?.industry ?? null,
    lastPrice: toNumber(record.lastPrice),
    change: toNumber(record.change),
    changePercent: toNumber(record.pChange),
    previousClose: toNumber(record.previousClose),
    open: toNumber(record.open),
    dayHigh: toNumber(record.dayHigh),
    dayLow: toNumber(record.dayLow),
    yearHigh: toNumber(record.yearHigh),
    yearLow: toNumber(record.yearLow),
    volume: toNumber(record.totalTradedVolume ?? record.quantityTraded),
    turnover: toNumber(record.totalTradedValue),
    mtfEligible: mtfUniverse.has(symbol),
  };
}

function readRows(payload: unknown): Record<string, unknown>[] {
  const data = (payload as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/**
 * NSE's derivatives universe, which is the basis brokers use for margin-trading eligibility.
 * SEBI permits MTF on Group-1 securities; in practice every broker's MTF list is this F&O set
 * plus a broker-specific tail, so this is the eligible universe, not any one broker's book.
 */
const loadMtfUniverse = cached(30 * 60_000, async (): Promise<Set<string>> => {
  const payload = await fetchNse<unknown>("/master-quote");
  if (!Array.isArray(payload)) return new Set<string>();
  return new Set(payload.filter((value): value is string => typeof value === "string"));
});

export type MostTradedBoard = {
  byVolume: TradedStock[];
  byValue: TradedStock[];
  /** Most-traded stocks restricted to the MTF-eligible universe, ranked by turnover. */
  mtf: TradedStock[];
  mtfUniverseSize: number;
  fetchedAt: string;
  live: boolean;
};

export const getMostTraded = cached(TTL_MS, async (): Promise<MostTradedBoard> => {
  const [volumePayload, valuePayload, mtfUniverse, industries] = await Promise.all([
    fetchNse("/live-analysis-most-active-securities?index=volume"),
    fetchNse("/live-analysis-most-active-securities?index=value"),
    loadMtfUniverse(),
    getIndustryMap(),
  ]);

  const byVolume = readRows(volumePayload)
    .map((row) => mapTraded(row, mtfUniverse, industries))
    .filter((row): row is TradedStock => row !== null);

  const byValue = readRows(valuePayload)
    .map((row) => mapTraded(row, mtfUniverse, industries))
    .filter((row): row is TradedStock => row !== null);

  // Both feeds are merged before filtering so the MTF list draws on the widest pool NSE gives us;
  // a stock can top the value board without appearing on the volume board and vice versa.
  const merged = new Map<string, TradedStock>();
  for (const row of [...byValue, ...byVolume]) {
    if (!merged.has(row.symbol)) merged.set(row.symbol, row);
  }

  const mtf = Array.from(merged.values())
    .filter((row) => row.mtfEligible)
    .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0))
    .slice(0, LIST_LIMIT);

  return {
    byVolume: byVolume.slice(0, LIST_LIMIT),
    byValue: byValue.slice(0, LIST_LIMIT),
    mtf,
    mtfUniverseSize: mtfUniverse.size,
    fetchedAt: new Date().toISOString(),
    live: byVolume.length > 0 || byValue.length > 0,
  };
});

export type SectorTrend = {
  symbol: string;
  name: string;
  last: number | null;
  change: number | null;
  changePercent: number | null;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  peRatio: number | null;
  changePercent30d: number | null;
  changePercent365d: number | null;
  yearHigh: number | null;
  yearLow: number | null;
};

export type SectorBoard = {
  sectors: SectorTrend[];
  fetchedAt: string;
  live: boolean;
};

/**
 * Sector performance taken from NSE's own sectoral indices rather than averaged from our tracked
 * stocks — these are the official, cap-weighted benchmarks, so "NIFTY IT is up 1.2%" here means
 * exactly what it means everywhere else.
 */
export const getTrendingSectors = cached(TTL_MS, async (): Promise<SectorBoard> => {
  const payload = await fetchNse("/allIndices");

  const sectors = readRows(payload)
    .filter((row) => toText(row.key) === "SECTORAL INDICES")
    .map((row) => ({
      symbol: toText(row.indexSymbol),
      name: toText(row.index),
      last: toNumber(row.last),
      change: toNumber(row.variation),
      changePercent: toNumber(row.percentChange),
      advances: toNumber(row.advances),
      declines: toNumber(row.declines),
      unchanged: toNumber(row.unchanged),
      peRatio: toNumber(row.pe),
      changePercent30d: toNumber(row.perChange30d),
      changePercent365d: toNumber(row.perChange365d),
      yearHigh: toNumber(row.yearHigh),
      yearLow: toNumber(row.yearLow),
    }))
    .filter((sector) => sector.name !== "")
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));

  return { sectors, fetchedAt: new Date().toISOString(), live: sectors.length > 0 };
});

export type EtfRow = {
  symbol: string;
  /** NSE's own one-line description of what the fund tracks. */
  tracks: string;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  turnover: number | null;
  nav: number | null;
  /** Traded price minus NAV, as a percentage — a fund trading far above NAV is a costly entry. */
  premiumPercent: number | null;
  changePercent30d: number | null;
  changePercent365d: number | null;
};

export type EtfGroupKey = "gold" | "silver" | "nifty50" | "international" | "bank" | "debt" | "other";

export type EtfGroup = {
  key: EtfGroupKey;
  name: string;
  description: string;
  etfs: EtfRow[];
  totalTurnover: number;
};

export const ETF_GROUPS: { key: EtfGroupKey; name: string; description: string }[] = [
  { key: "gold", name: "Gold", description: "Funds holding physical gold, priced off the LBMA spot fix." },
  { key: "silver", name: "Silver", description: "Funds holding physical silver, priced off the LBMA spot fix." },
  { key: "nifty50", name: "Nifty 50", description: "Funds tracking the Nifty 50 — India's headline large-cap index." },
  { key: "international", name: "International", description: "Overseas exposure: Nasdaq 100, S&P 500 and other global indices." },
  { key: "bank", name: "Banking", description: "Funds tracking the banking and PSU-bank indices." },
  { key: "debt", name: "Debt & Liquid", description: "Gilt, G-Sec, SDL and liquid funds used to park cash." },
  { key: "other", name: "Other themes", description: "Sectoral, thematic, factor and mid/small-cap funds." },
];

/**
 * NSE doesn't tag ETFs by asset class, so the group is read off the fund's own "tracks"
 * description with the symbol as a backstop. Order matters: a gold fund must be caught before
 * the broad-index rules, and "Nifty Bank" before "Nifty".
 */
export function classifyEtf(symbol: string, tracks: string): EtfGroupKey {
  const text = `${tracks} ${symbol}`.toLowerCase();

  if (/gold/.test(text)) return "gold";
  if (/silver/.test(text)) return "silver";
  if (/nasdaq|s&p 500|hang seng|ftse|msci|global|world equity|china|japan|us equity|united states/.test(text)) {
    return "international";
  }
  if (/bank/.test(text)) return "bank";
  if (/liquid|gilt|g-sec|gsec|sdl|bond|debt|overnight|treasury|money market|1d rate/.test(text)) return "debt";
  if (/nifty 50/.test(text)) return "nifty50";
  return "other";
}

export type EtfBoard = {
  groups: EtfGroup[];
  fetchedAt: string;
  live: boolean;
};

/**
 * "Most bought" is ranked by rupee turnover. Nobody publishes net buy orders for an ETF, so
 * turnover — how much money actually changed hands today — is the closest honest measure, and it
 * is stated as such in the UI rather than dressed up as inflows.
 */
export const getEtfBoard = cached(TTL_MS, async (): Promise<EtfBoard> => {
  const payload = await fetchNse("/etf");

  const buckets = new Map<EtfGroupKey, EtfRow[]>();

  for (const row of readRows(payload)) {
    const symbol = toText(row.symbol);
    if (!symbol) continue;

    const tracks = toText(row.assets);
    const lastPrice = toNumber(row.ltP);
    const nav = toNumber(row.nav);

    const etf: EtfRow = {
      symbol,
      tracks,
      lastPrice,
      change: toNumber(row.chn),
      changePercent: toNumber(row.per),
      volume: toNumber(row.qty),
      turnover: toNumber(row.trdVal),
      nav,
      premiumPercent: lastPrice !== null && nav !== null && nav > 0 ? ((lastPrice - nav) / nav) * 100 : null,
      changePercent30d: toNumber(row.perChange30d),
      changePercent365d: toNumber(row.perChange365d),
    };

    const key = classifyEtf(symbol, tracks);
    const bucket = buckets.get(key) ?? [];
    bucket.push(etf);
    buckets.set(key, bucket);
  }

  const groups: EtfGroup[] = ETF_GROUPS.map((group) => {
    const etfs = (buckets.get(group.key) ?? []).sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0));
    return {
      ...group,
      etfs: etfs.slice(0, LIST_LIMIT),
      totalTurnover: etfs.reduce((sum, etf) => sum + (etf.turnover ?? 0), 0),
    };
  }).filter((group) => group.etfs.length > 0);

  return { groups, fetchedAt: new Date().toISOString(), live: groups.length > 0 };
});
