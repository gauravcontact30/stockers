// Fetches what India's largest retail brokers say their own customers are buying.
//
// The registry of tracked platforms — and the note on why only one of the five contributes any
// data at all — lives in ./brokers, which is dependency-free so the client board can read it.

import { BROKERS, type BrokerPick } from "./brokers";
import { CACHE_TAGS } from "./cache";
import { cached } from "./nse-client";

const GROWW = BROKERS[0];
const POPULARITY_TTL_MS = 30 * 60 * 1000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

type GrowwStock = {
  company?: {
    bseScriptCode?: unknown;
    isin?: unknown;
    companyName?: unknown;
  };
};

/** The script tag carries a nonce and a crossorigin attribute, so the opening tag is not fixed. */
const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export type GrowwEntry = { code: string; isin: string; name: string; rank: number };

/**
 * A scalar field from the embedded payload, or "".
 *
 * Deliberately not `String(value)`: this is a third party's JSON, and an object arriving where a
 * scrip code is expected would stringify to "[object Object]" — a truthy value that would then be
 * carried all the way to a join key.
 */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * Groww's published most-bought list, as BSE scrip codes.
 *
 * Read from the page's own embedded JSON rather than its rendered HTML: the payload carries each
 * company's BSE scrip code and ISIN outright, so the join to the exchange is exact rather than a
 * name match — "Cupid" against "Cupid Ltd" is the kind of guess that silently mislabels a row.
 *
 * Degrades to an empty list on any failure, the same way the BSE feeds do. This is somebody else's
 * marketing page rather than a contract, and the board is worth rendering without the badges.
 */
export async function fetchGrowwMostBought(): Promise<GrowwEntry[]> {
  try {
    const response = await fetch(GROWW.feed?.url ?? "", {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return [];

    const embedded = NEXT_DATA.exec(await response.text());
    if (!embedded) return [];

    const stocks = JSON.parse(embedded[1])?.props?.pageProps?.stocks;
    if (!Array.isArray(stocks)) return [];

    return stocks
      .map((stock: GrowwStock, index: number) => ({
        code: text(stock?.company?.bseScriptCode),
        isin: text(stock?.company?.isin),
        name: text(stock?.company?.companyName),
        rank: index + 1,
      }))
      // The list carries ETFs alongside shares; one without a scrip code cannot be joined at all.
      .filter((entry: GrowwEntry) => entry.code.length > 0);
  } catch {
    return [];
  }
}

/**
 * Every tracked broker's published picks, keyed by BSE scrip code.
 *
 * Held for half an hour: these lists move on the scale of a session, and the source is a courtesy
 * rather than an API, so it is polled gently.
 */
export const getBrokerPopularity = cached<Record<string, BrokerPick[]>>(
  POPULARITY_TTL_MS,
  async () => {
    const picks: Record<string, BrokerPick[]> = {};

    for (const entry of await fetchGrowwMostBought()) {
      picks[entry.code] = [
        ...(picks[entry.code] ?? []),
        { broker: GROWW.id, brokerName: GROWW.name, label: GROWW.feed?.label ?? "", rank: entry.rank },
      ];
    }

    return picks;
  },
  { key: "broker:popularity", tags: [CACHE_TAGS.nse], persist: true },
);
