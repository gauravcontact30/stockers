import { cached, fetchNse, toText } from "./nse-client";
import { getIndustryMap, UNCLASSIFIED } from "./nse-industry";

// Company-level news from NSE's corporate-announcements feed: filings companies are legally
// obliged to make, which is why this is the primary source rather than a press aggregator —
// every item is first-hand and carries the company's own signed document.
const TTL_MS = 10 * 60_000;

export type StockNewsItem = {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  /** NSE's category, e.g. "Financial Results" or "Shareholders meeting". */
  category: string;
  headline: string;
  /** Link to the company's own signed filing — never a paraphrase of it. */
  documentUrl: string | null;
  publishedAt: string | null;
};

export type StockNewsSector = { sector: string; items: StockNewsItem[]; total: number };

export type StockNewsBoard = {
  sectors: StockNewsSector[];
  total: number;
  fetchedAt: string;
  live: boolean;
};

/**
 * NSE stamps announcements as "05-Aug-2026 20:37:32" in IST with no zone marker. Parsed
 * explicitly as +05:30 rather than handed to Date(), which would read it as server-local time
 * and shift every timestamp by the host's offset.
 */
export function parseAnnouncementTime(value: unknown): string | null {
  const text = toText(value);
  const match = text.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const month = months[match[2].toLowerCase()];
  if (!month) return null;

  const parsed = new Date(`${match[3]}-${month}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** NSE's filing text runs long and repeats the company name; trimmed to a readable headline. */
export function toHeadline(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}…` : cleaned;
}

export const getStockNews = cached(TTL_MS, async (): Promise<StockNewsBoard> => {
  const [payload, industries] = await Promise.all([
    fetchNse<unknown>("/corporate-announcements?index=equities"),
    getIndustryMap(),
  ]);

  const rows = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
  const bySector = new Map<string, StockNewsItem[]>();
  let total = 0;

  for (const row of rows) {
    const symbol = toText(row.symbol);
    if (!symbol) continue;

    const meta = industries.get(symbol);
    const company = toText(row.sm_name) || meta?.name || symbol;
    const category = toText(row.desc) || "Announcement";

    const item: StockNewsItem = {
      id: toText(row.seq_id) || `${symbol}-${toText(row.an_dt)}`,
      symbol,
      company,
      // NSE's own smIndustry is usually null on this feed, so the sector comes from the industry
      // map built off the Total Market constituent list.
      sector: meta?.industry || toText(row.smIndustry) || UNCLASSIFIED,
      category,
      headline: toHeadline(toText(row.attchmntText), category),
      documentUrl: toText(row.attchmntFile) || null,
      publishedAt: parseAnnouncementTime(row.an_dt),
    };

    const bucket = bySector.get(item.sector) ?? [];
    bucket.push(item);
    bySector.set(item.sector, bucket);
    total++;
  }

  const sectors: StockNewsSector[] = Array.from(bySector.entries())
    .map(([sector, items]) => {
      items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
      // Every filing in the sector, not the first eight: the card beside the tab quotes this
      // total, and a list that shows fewer than it claims is simply wrong.
      return { sector, items, total: items.length };
    })
    // The unclassified bucket sorts last so it never heads a list of real industries.
    .sort((a, b) => {
      if (a.sector !== b.sector) {
        if (a.sector === UNCLASSIFIED) return 1;
        if (b.sector === UNCLASSIFIED) return -1;
      }
      return b.total - a.total || a.sector.localeCompare(b.sector);
    });

  return { sectors, total, fetchedAt: new Date().toISOString(), live: total > 0 };
});
