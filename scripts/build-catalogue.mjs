// Rebuilds the generated exchange catalogues from the exchanges themselves.
//
//   node scripts/build-catalogue.mjs
//
// Writes two files, both marked generated and neither meant to be hand-edited:
//
//   app/lib/bse-catalogue.ts   every active BSE equity, with its sector and cap tier
//   app/lib/etf-catalogue.ts   every ETF listed on NSE
//
// Four upstream calls do the work:
//
//   BSE ListofScripData   the scrip master — ticker, name, group, ISIN, market cap (~4,950 rows)
//   BSE ComHeader         one scrip's industry classification; the bulk list ships INDUSTRY null,
//                         so this is the only way to get a sector, and it is called per scrip
//   NSE EQUITY_L.csv      which of those companies also trade on the NSE, matched by ISIN — that
//                         decides whether a row's Yahoo symbol takes the .NS or the .BO suffix
//   NSE eq_etfseclist.csv the ETF master
//
// Running this needs network access and takes roughly a minute, nearly all of it in ComHeader.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BSE_HEADERS = { "User-Agent": UA, Referer: "https://www.bseindia.com/", Accept: "application/json, text/plain, */*" };
const NSE_HEADERS = { "User-Agent": UA, Referer: "https://www.nseindia.com/", Accept: "text/csv,*/*" };

const BSE_API = "https://api.bseindia.com/BseIndiaAPI/api";
const SCRIP_MASTER = `${BSE_API}/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active`;
const NSE_EQUITIES = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const NSE_ETFS = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv";

const HEADER_CONCURRENCY = 12;

// SEBI's definition, and the same one the BSE board already uses: the 100 largest companies by
// market capitalisation are large cap, the next 150 mid cap, everything below that small cap.
const LARGE_CAP_RANKS = 100;
const MID_CAP_RANKS = 250;

/**
 * BSE's 22 industry buckets, mapped onto the sector keys this app already browses by.
 *
 * The mapping is deliberately lossy in one direction only: BSE's "Healthcare" covers both drug
 * makers and hospitals, and its "Financial Services" covers banks, lenders and insurers, so a
 * generated row lands in the broader bucket while the hand-classified catalogue keeps the finer
 * one. No generated row is ever put in a sector BSE did not actually place it in.
 */
const SECTOR_FOR_INDUSTRY = {
  "Automobile and Auto Components": "auto",
  "Capital Goods": "capgoods",
  Chemicals: "chemicals",
  Construction: "infra",
  "Construction Materials": "cement",
  "Consumer Durables": "durables",
  "Consumer Services": "consumerservices",
  Diversified: "diversified",
  "Fast Moving Consumer Goods": "fmcg",
  "Financial Services": "financials",
  "Forest Materials": "forest",
  Healthcare: "healthcare",
  "Information Technology": "it",
  "Media, Entertainment & Publication": "media",
  "Metals & Mining": "metals",
  "Oil, Gas & Consumable Fuels": "energy",
  Power: "power",
  Realty: "realty",
  Services: "services",
  Telecommunication: "telecom",
  Textiles: "textiles",
  Utilities: "power",
};

/** Where a scrip BSE never classified goes. Better an honest bucket than a guessed sector. */
const UNCLASSIFIED = "unclassified";

// ---------------------------------------------------------------------------
// fetching
// ---------------------------------------------------------------------------

async function getJson(url, headers = BSE_HEADERS) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function getText(url, headers = NSE_HEADERS) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

/** Run `work` over every item, `limit` in flight at a time, keeping input order. */
async function mapWithConcurrency(items, limit, work) {
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await work(items[index], index);
      }
    }),
  );

  return results;
}

function csvRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0].split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, (cells[index] ?? "").trim()]));
  });
}

const text = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

function number(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// equities
// ---------------------------------------------------------------------------

async function buildEquities(nseByIsin) {
  const master = await getJson(SCRIP_MASTER);
  console.log(`  scrip master: ${master.length} active equities`);

  const scrips = master
    .map((row) => ({
      code: text(row.SCRIP_CD),
      symbol: text(row.scrip_id).toUpperCase(),
      name: text(row.Scrip_Name),
      group: text(row.GROUP),
      isin: text(row.ISIN_NUMBER),
      marketCapCr: number(row.Mktcap),
    }))
    .filter((scrip) => scrip.code && scrip.symbol && scrip.name);

  // The bulk list ships INDUSTRY null for every row, so the sector has to be asked for one scrip
  // at a time. A scrip that fails twice is emitted unclassified rather than dropped.
  const industries = await mapWithConcurrency(scrips, HEADER_CONCURRENCY, async (scrip) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const header = await getJson(`${BSE_API}/ComHeader/w?quotetype=EQ&scripcode=${scrip.code}&seriesid=`);
        const industry = text(header?.IndustryNew) || text(header?.Industry);
        if (industry) return industry;
      } catch {
        // Retried once, then given up on — one unhappy scrip must not fail the whole build.
      }
    }
    return "";
  });

  const classified = 0 + industries.filter(Boolean).length;
  console.log(`  sectors resolved: ${classified}/${scrips.length}`);

  // Cap tiers are ranked across the exchange, so they mean the same thing here as on the BSE board.
  const ranked = scrips.filter((scrip) => scrip.marketCapCr > 0).sort((a, b) => b.marketCapCr - a.marketCapCr);
  const tierByCode = new Map(
    ranked.map((scrip, index) => [scrip.code, index < LARGE_CAP_RANKS ? "L" : index < MID_CAP_RANKS ? "M" : "S"]),
  );

  return scrips.map((scrip, index) => ({
    ...scrip,
    sector: SECTOR_FOR_INDUSTRY[industries[index]] ?? UNCLASSIFIED,
    // A scrip with no reported market cap is small until it says otherwise; the alternative is a
    // null tier, and every filter in the app would then have to carry a fourth case.
    tier: tierByCode.get(scrip.code) ?? "S",
    onNse: nseByIsin.get(scrip.isin) === scrip.symbol,
  }));
}

// ---------------------------------------------------------------------------
// ETFs
// ---------------------------------------------------------------------------

/**
 * Which shelf an ETF belongs on, read from what it tracks.
 *
 * Matching is done on a squashed string — lower case, letters and digits only — because the
 * exchange's own text runs words together as often as not ("NipponIndiaSilverETF", "NiftyNext50").
 * Word boundaries do not survive that, so none are used.
 *
 * Order matters: a gold fund is a gold fund before it is anything else, and an ETF tracking one
 * sector is sectoral even though the thing it tracks is called an index.
 */
function etfCategory(underlying, symbol) {
  // Two views of the same text. The squashed one is needed for the run-together names the AMCs
  // file ("NipponIndiaSilverETF"), but matching short tokens against it produces nonsense —
  // "esg sector" squashes to "esgsector", which contains "gsec", and an ESG fund lands in debt.
  // So only the two unmistakable commodity words are matched loosely; everything else is matched
  // against the spaced form, on whole words.
  const squashed = `${underlying} ${symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = `${underlying} ${symbol}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  // A token counts as a match when it *starts* with the word, so "nasdaq100", "liquidbees" and
  // "automotive" all land where they should. Words of two letters or fewer have to match whole —
  // "it" as a prefix would claim every token beginning with those letters.
  const has = (...words) =>
    tokens.some((token) => words.some((word) => (word.length <= 2 ? token === word : token.startsWith(word))));

  if (squashed.includes("gold")) return "gold";
  if (squashed.includes("silver")) return "silver";
  if (has("1d", "liquid", "overnight", "gsec", "gilt", "sdl", "bond", "debt", "treasury", "tbill", "government", "securities"))
    return "debt";
  if (has("nasdaq", "sp500", "hangseng", "hang", "msci", "fang", "world", "global", "japan", "china")) return "international";
  if (
    has("bank", "banks", "financial", "it", "pharma", "healthcare", "auto", "metal", "energy", "infra",
        "infrastructure", "consumption", "fmcg", "realty", "oil", "commodities", "manufacturing", "defence",
        "capital", "chemicals", "cements", "power", "railways", "tourism", "hospitals", "insurance", "digital",
        "services")
  )
    return "sectoral";
  if (has("psu", "pse", "bharat", "cpse", "dividend", "value", "quality", "momentum", "alpha", "esg", "shariah", "ipo", "mnc"))
    return "thematic";
  return "broad";
}

/** "NiftyNext50" → "Nifty Next 50". Leaves text that is already spaced alone. */
function unsquash(value) {
  if (/\s/.test(value)) return value;
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .trim();
}

/**
 * What the fund tracks, as something a reader would recognise.
 *
 * Two sources, and the better one wins: NSE's ETF screener returns a clean `assets` string
 * ("Nifty 50", "Gold", "Nifty Bank"), while the downloadable master's `Underlying` column is
 * whatever the AMC filed and is frequently run together, quoted, or tab-padded.
 */
function trackedIndex(row, assets) {
  const clean = (value) =>
    value
      .replace(/[ -]+/g, " ")
      .replace(/[""']/g, "")
      // The master is served as cp1252 and mis-decodes to U+FFFD in a handful of rows.
      .replace(/�/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const fromScreener = clean(assets ?? "");
  if (fromScreener && fromScreener !== "-" && !/^index$/i.test(fromScreener)) return fromScreener;

  return unsquash(clean(text(row.Underlying)));
}

async function buildEtfs() {
  const rows = csvRows(await getText(NSE_ETFS));
  console.log(`  ETF master: ${rows.length} funds`);

  // The screener carries a far cleaner description of what each fund tracks than the master does.
  // It is a nice-to-have, not a dependency: if NSE refuses the call the master still names them.
  let assetsBySymbol = new Map();
  try {
    const screener = await getJson("https://www.nseindia.com/api/etf", {
      ...NSE_HEADERS,
      Accept: "application/json",
      Referer: "https://www.nseindia.com/market-data/exchange-traded-funds-etf",
    });
    assetsBySymbol = new Map((screener?.data ?? []).map((etf) => [text(etf.symbol).toUpperCase(), text(etf.assets)]));
    console.log(`  ETF screener: ${assetsBySymbol.size} descriptions`);
  } catch {
    console.log("  ETF screener unavailable — falling back to the master's own Underlying column");
  }

  const etfs = rows
    .map((row) => {
      const symbol = text(row.Symbol).toUpperCase();
      const tracks = trackedIndex(row, assetsBySymbol.get(symbol));
      // Roughly a third of these already say "ETF" or "Exchange Traded Fund"; the rest name only
      // the index, and read as a fund once the word is added.
      const named = !tracks || /\b(etf|exchange traded fund)\b/i.test(tracks);
      return { symbol, tracks, name: tracks ? (named ? tracks : `${tracks} ETF`) : `${symbol} ETF`, category: etfCategory(tracks, symbol) };
    })
    .filter((etf) => etf.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Fourteen funds track the Nifty 50, so "Nifty 50 ETF" alone does not identify one. Where a name
  // repeats, the ticker goes on the end — which is what tells them apart on an exchange anyway.
  const nameCounts = new Map();
  for (const etf of etfs) nameCounts.set(etf.name, (nameCounts.get(etf.name) ?? 0) + 1);
  for (const etf of etfs) {
    if (nameCounts.get(etf.name) > 1) etf.name = `${etf.name} (${etf.symbol})`;
  }

  return etfs;
}

// ---------------------------------------------------------------------------
// emitting
// ---------------------------------------------------------------------------

// The rows are emitted as one newline-separated string rather than an array of object literals.
// It is the same data either way, but the string is a third of the size on disk and costs the
// parser one pass instead of building 4,950 object literals at module load.
const pack = (rows) => rows.map((cells) => cells.join("|")).join("\n");

function emitEquities(equities) {
  const rows = equities.map((equity) => [
    equity.symbol,
    equity.name,
    equity.sector,
    equity.tier,
    equity.code,
    equity.onNse ? "1" : "0",
  ]);

  const body = `// GENERATED FILE — do not edit. Run \`node scripts/build-catalogue.mjs\` to rebuild.
//
// Every active equity on the BSE: ${equities.length} scrips, with the sector BSE files it under and
// a cap tier ranked by market capitalisation across the whole exchange.
//
// This is a server-side module by design. Packed, the table is still ~${Math.round(pack(rows).length / 1024)} KB — an order of
// magnitude more than the hand-classified catalogue in indian-stocks.ts — so it is reached through
// /api/stocks/search rather than shipped to every visitor. Importing it from a client component
// would put the whole exchange in the browser bundle.

import type { CapTier } from "./indian-stocks";

export type CatalogueEntry = {
  symbol: string;
  name: string;
  /** The sector key, as defined in indian-stocks.ts. */
  sector: string;
  capTier: CapTier;
  /** BSE's own scrip code, which is what the exchange's own pages are keyed by. */
  scripCode: string;
  /** NSE when the company trades there too, BSE otherwise — matched by ISIN at build time. */
  yahooSymbol: string;
};

const TIERS: Record<string, CapTier> = { L: "Large", M: "Mid", S: "Small" };

// symbol|name|sectorKey|tier|scripCode|listedOnNse
const PACKED = ${JSON.stringify(pack(rows))};

let parsed: CatalogueEntry[] | null = null;

/** Every active BSE equity. Parsed once, on first use, and held for the life of the process. */
export function bseCatalogue(): CatalogueEntry[] {
  if (parsed) return parsed;

  parsed = PACKED.split("\\n").map((line) => {
    const [symbol, name, sector, tier, scripCode, onNse] = line.split("|");
    return {
      symbol,
      name,
      sector,
      capTier: TIERS[tier],
      scripCode,
      yahooSymbol: onNse === "1" ? \`\${symbol}.NS\` : \`\${symbol}.BO\`,
    };
  });

  return parsed;
}
`;

  writeFileSync(join(ROOT, "app/lib/bse-catalogue.ts"), body, "utf8");
  console.log(`  wrote app/lib/bse-catalogue.ts (${equities.length} rows)`);
}

function emitEtfs(etfs) {
  const rows = etfs.map((etf) => [etf.symbol, etf.name, etf.category, etf.tracks]);

  const body = `// GENERATED FILE — do not edit. Run \`node scripts/build-catalogue.mjs\` to rebuild.
//
// Every ETF listed on the NSE: ${etfs.length} funds, from the exchange's own ETF master, with the shelf
// each one sits on read from what it tracks.
//
// There is deliberately no fund house on these rows. NSE publishes no AMC column, and every way of
// inferring one — the AMC block of the ISIN, the prefix of the ticker — put funds under the wrong
// house often enough to be worse than saying nothing. The sixteen hand-checked funds in
// indian-etfs.ts keep their AMC; these carry the index they track instead, which is the thing that
// actually distinguishes one Nifty 50 ETF from another.
//
// Unlike the equity catalogue this is small enough to ship to the browser, so indian-etfs.ts
// folds it in directly.

export type EtfCatalogueEntry = {
  symbol: string;
  name: string;
  category: string;
  /** The index or commodity the fund tracks, as the exchange describes it. */
  tracks: string;
};

// symbol|name|categoryKey|tracks
const PACKED = ${JSON.stringify(pack(rows))};

let parsed: EtfCatalogueEntry[] | null = null;

/** Every listed ETF. Parsed once, on first use. */
export function etfCatalogue(): EtfCatalogueEntry[] {
  if (parsed) return parsed;

  parsed = PACKED.split("\\n").map((line) => {
    const [symbol, name, category, tracks] = line.split("|");
    return { symbol, name, category, tracks };
  });

  return parsed;
}
`;

  writeFileSync(join(ROOT, "app/lib/etf-catalogue.ts"), body, "utf8");
  console.log(`  wrote app/lib/etf-catalogue.ts (${etfs.length} rows)`);
}

/**
 * Every sector key the generated catalogue uses must already be defined in indian-stocks.ts.
 *
 * A key that is not defined there resolves to no sector name at runtime, and the stock quietly
 * disappears from every category filter. Failing the build is the cheaper way to find that out.
 */
function checkSectorKeys(equities) {
  const source = readFileSync(join(ROOT, "app/lib/indian-stocks.ts"), "utf8");
  const defined = new Set([...source.matchAll(/\{\s*key:\s*"([a-z]+)"/g)].map((match) => match[1]));
  const used = new Set(equities.map((equity) => equity.sector));
  const undefinedKeys = [...used].filter((key) => !defined.has(key));

  if (undefinedKeys.length) {
    throw new Error(`sector keys used by the catalogue but not defined in indian-stocks.ts: ${undefinedKeys.join(", ")}`);
  }
}

async function main() {
  // Rebuilding the equity catalogue costs ~4,950 ComHeader calls; the ETF side costs two. When only
  // the ETF list needs redoing, `--etfs-only` skips the expensive half.
  if (process.argv.includes("--etfs-only")) {
    console.log("NSE ETFs…");
    emitEtfs(await buildEtfs());
    return;
  }

  console.log("NSE equity list…");
  const nseByIsin = new Map(
    csvRows(await getText(NSE_EQUITIES)).map((row) => [text(row["ISIN NUMBER"]), text(row.SYMBOL).toUpperCase()]),
  );
  console.log(`  ${nseByIsin.size} NSE symbols`);

  console.log("BSE equities…");
  const equities = await buildEquities(nseByIsin);
  checkSectorKeys(equities);

  console.log("NSE ETFs…");
  const etfs = await buildEtfs();

  emitEquities(equities);
  emitEtfs(etfs);

  const dual = equities.filter((equity) => equity.onNse).length;
  console.log(`\ndone — ${equities.length} equities (${dual} also on NSE), ${etfs.length} ETFs`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
