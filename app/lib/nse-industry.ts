import { indianStocks } from "./indian-stocks";
import { cached } from "./nse-client";

// NSE publishes the constituent list of every index as a CSV, and the Nifty Total Market file
// covers ~750 names — effectively the whole investable market — with an Industry column. That is
// the sector map used to group dividends and company announcements, so those sections aren't
// limited to the handful of stocks this app tracks directly.
const TOTAL_MARKET_CSV = "https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv";
// The full equity list carries every listed company's name but no Industry column, so it is used
// purely to name the micro-caps that fall outside the Total Market index.
const EQUITY_LIST_CSV = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const TTL_MS = 24 * 60 * 60_000;

/** The label used when NSE publishes no industry for a symbol — never guessed. */
export const UNCLASSIFIED = "Unclassified";

/** `industry` is null when no published sector exists for the symbol, rather than being invented. */
export type IndustryEntry = { symbol: string; name: string; industry: string | null };

/**
 * Splits one CSV line, honouring double-quoted fields — company names routinely contain commas
 * ("Sun TV Network Ltd., Chennai"), which a naive split on "," would tear in half.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // A doubled quote inside a quoted field is an escaped literal quote.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Reads either NSE CSV layout by column name rather than position: the index files use
 * "Company Name"/"Industry"/"Symbol", the full equity list uses "SYMBOL"/"NAME OF COMPANY" and
 * has no industry at all. Headers are matched case-insensitively and trimmed, because the equity
 * list pads several of its column names with a leading space.
 */
export function parseIndustryCsv(csv: string): IndustryEntry[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((column) => column.trim().toLowerCase());
  const symbolAt = header.indexOf("symbol");
  if (symbolAt === -1) return [];

  const nameAt = header.indexOf("company name") !== -1 ? header.indexOf("company name") : header.indexOf("name of company");
  const industryAt = header.indexOf("industry");

  const entries: IndustryEntry[] = [];
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const symbol = fields[symbolAt];
    if (!symbol) continue;

    entries.push({
      symbol,
      name: (nameAt === -1 ? "" : fields[nameAt]) || symbol,
      industry: industryAt === -1 ? null : fields[industryAt] || null,
    });
  }

  return entries;
}

async function fetchCsv(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)", Accept: "text/csv,*/*" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export type IndustryMap = Map<string, IndustryEntry>;

export const getIndustryMap = cached(TTL_MS, async (): Promise<IndustryMap> => {
  const map: IndustryMap = new Map();

  // Our own curated universe seeds the map first so its hand-checked sector labels win over the
  // broader CSV, keeping sector names consistent with the rest of the app.
  for (const stock of indianStocks) {
    map.set(stock.symbol, { symbol: stock.symbol, name: stock.name, industry: stock.sector });
  }

  const [totalMarket, equityList] = await Promise.all([fetchCsv(TOTAL_MARKET_CSV), fetchCsv(EQUITY_LIST_CSV)]);

  // Industry first, so the ~750 symbols that have a published sector keep it.
  if (totalMarket) {
    for (const entry of parseIndustryCsv(totalMarket)) {
      if (!map.has(entry.symbol)) map.set(entry.symbol, entry);
    }
  }

  // Then the full equity list, which names the remaining ~1,600 listed companies. These get a
  // proper name but no industry — NSE doesn't publish one for them, and guessing would be worse
  // than admitting it.
  if (equityList) {
    for (const entry of parseIndustryCsv(equityList)) {
      if (!map.has(entry.symbol)) map.set(entry.symbol, entry);
    }
  }

  return map;
});
