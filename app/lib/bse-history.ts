// Reference closing prices for the whole exchange, one trading day per return period.
//
// Ranking 4,900 companies by their one-year return needs a price for each of them a year ago. Per
// company that is 4,900 requests — the sort of thing that got this app's IP blocked once already.
// BSE publishes the same information as one file per session, though: the Bhavcopy carries every
// scrip's close, so one download answers the whole universe for that date.
//
// Two formats are in play. Sessions from 2024 onward are a plain CSV; older ones are a zipped CSV
// in a different column layout, which is why both are parsed here and tried in turn.

import zlib from "node:zlib";
import { fetchBseText } from "./bse-client";
import { CACHE_TAGS } from "./cache";
import { cached, toNumber } from "./nse-client";

export type ReturnPeriod = "1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "3y" | "5y" | "overall";

/** How far back each period looks, in calendar days. 1d and overall are handled separately. */
const LOOKBACK_DAYS: Record<Exclude<ReturnPeriod, "1d" | "overall">, number> = {
  "1w": 7,
  "1m": 30,
  "3m": 91,
  "6m": 182,
  "1y": 365,
  "3y": 1095,
  "5y": 1826,
};

/** Longest window first: "overall" takes the earliest baseline a company actually appears in. */
export const HISTORY_PERIODS: Exclude<ReturnPeriod, "1d" | "overall">[] = ["5y", "3y", "1y", "6m", "3m", "1m", "1w"];

export type Baseline = {
  /** Scrip code to that session's close. */
  prices: Map<string, number>;
  /** The session the prices are from, as YYYY-MM-DD, or null when none was found. */
  date: string | null;
};

const TTL_MS = 12 * 60 * 60 * 1000;
// Markets close for weekends and festivals, so the exact date N days ago is often not a session.
const LOOKBACK_TRIES = 8;
// A file this short is a placeholder rather than a session — BSE serves a stub for dates its
// current-format archive does not reach.
const MIN_ROWS = 500;
// The archives are being asked for one file at a time, deliberately.
const PACE_MS = 200;

const CURRENT_CSV = (yyyymmdd: string) =>
  `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd}_F_0000.CSV`;
const LEGACY_ZIP = (ddmmyy: string) => `https://www.bseindia.com/download/BhavCopy/Equity/EQ${ddmmyy}_CSV.ZIP`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function istParts(at: Date): { yyyymmdd: string; ddmmyy: string; iso: string } {
  const iso = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [year, month, day] = iso.split("-");
  return { yyyymmdd: `${year}${month}${day}`, ddmmyy: `${day}${month}${year.slice(2)}`, iso };
}

/**
 * The first file inside a ZIP, inflated.
 *
 * BSE's legacy Bhavcopy is a single CSV in a single-entry archive, so this reads that one local
 * header rather than pulling in a ZIP library for it.
 */
export function unzipSingleEntry(archive: Buffer): string | null {
  if (archive.length < 30 || archive.readUInt32LE(0) !== 0x04034b50) return null;

  const method = archive.readUInt16LE(8);
  const compressedSize = archive.readUInt32LE(18);
  const start = 30 + archive.readUInt16LE(26) + archive.readUInt16LE(28);
  // A zero size means the length was only written to the trailing descriptor; the rest of the
  // buffer is then the entry, since there is only one.
  const body = compressedSize > 0 ? archive.subarray(start, start + compressedSize) : archive.subarray(start);

  try {
    if (method === 0) return body.toString("latin1");
    if (method === 8) return zlib.inflateRawSync(body).toString("latin1");
  } catch {
    return null;
  }

  return null;
}

function identifiersFor(cells: string[], indexes: number[]): string[] {
  return [...new Set(indexes.map((index) => cells[index]?.trim()).filter((value): value is string => Boolean(value)))];
}

function closeFor(prices: Map<string, number>, identifiers: string | readonly string[]): number | null {
  const keys = Array.isArray(identifiers) ? identifiers : [identifiers];
  for (const key of keys) {
    const then = prices.get(key);
    if (then !== undefined && then > 0) return then;
  }
  return null;
}

/** Closes keyed by every exchange identifier the Bhavcopy row carries. Returns null when the file is a stub. */
export function parseBhavcopyCloses(csv: string): Map<string, number> | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= MIN_ROWS) return null;

  const header = lines[0].split(",").map((column) => column.trim().toUpperCase());
  // Current layout: FinInstrmId / ClsPric, with non-equity instruments mixed in. Legacy: SC_CODE /
  // CLOSE, equities only.
  const codeAt = header.indexOf("FININSTRMID") !== -1 ? header.indexOf("FININSTRMID") : header.indexOf("SC_CODE");
  const symbolAt = header.indexOf("TCKRSYMB");
  const isinAt = header.indexOf("ISIN");
  const closeAt = header.indexOf("CLSPRIC") !== -1 ? header.indexOf("CLSPRIC") : header.indexOf("CLOSE");
  const typeAt = header.indexOf("FININSTRMTP");
  if (codeAt === -1 || closeAt === -1) return null;

  const identifierIndexes = [codeAt, symbolAt, isinAt].filter((index) => index !== -1);
  const prices = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (typeAt !== -1 && cells[typeAt]?.trim() !== "STK") continue;

    const close = toNumber(cells[closeAt]);
    if (close !== null && close > 0) {
      for (const identifier of identifiersFor(cells, identifierIndexes)) {
        prices.set(identifier, close);
      }
    }
  }

  return prices.size > 0 ? prices : null;
}

/** The most recent session on or before `target`, as closes for every scrip that traded. */
async function loadBaseline(target: Date): Promise<Baseline> {
  for (let back = 0; back < LOOKBACK_TRIES; back++) {
    const { yyyymmdd, ddmmyy, iso } = istParts(new Date(target.getTime() - back * 86_400_000));

    const current = await fetchBseText(CURRENT_CSV(yyyymmdd));
    const fromCurrent = current === null ? null : parseBhavcopyCloses(current);
    if (fromCurrent) return { prices: fromCurrent, date: iso };

    await sleep(PACE_MS);

    // Older sessions predate the current format; the same date is published as a zipped CSV.
    const archive = await fetchBseArchive(LEGACY_ZIP(ddmmyy));
    const fromLegacy = archive === null ? null : parseBhavcopyCloses(archive);
    if (fromLegacy) return { prices: fromLegacy, date: iso };

    await sleep(PACE_MS);
  }

  return { prices: new Map(), date: null };
}

async function fetchBseArchive(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "*/*",
        Origin: "https://www.bseindia.com",
        Referer: "https://www.bseindia.com/",
      },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!response.ok) return null;

    return unzipSingleEntry(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

// One memo per period, so a board asking for one-year returns does not also download five years of
// reference files it has no use for.
const baselines = new Map<string, () => Promise<Baseline>>();

export function getBaseline(period: Exclude<ReturnPeriod, "1d" | "overall">): Promise<Baseline> {
  let load = baselines.get(period);
  if (!load) {
    load = cached<Baseline>(
      TTL_MS,
      () => loadBaseline(new Date(Date.now() - LOOKBACK_DAYS[period] * 86_400_000)),
      // Keyed by period so each window gets its own entry and its own clock. Not persisted: a
      // baseline holds its closes in a Map, which does not survive the Data Cache's JSON round trip.
      { key: `bse:baseline:${period}`, tags: [CACHE_TAGS.bse] },
    );
    baselines.set(period, load);
  }

  return load();
}

/**
 * Return from a company's earliest available baseline to its current price.
 *
 * "Overall" cannot mean "since listing" from these files — the Bhavcopy only knows the sessions it
 * covers — so it means the longest window this company can be measured over: five years for one
 * listed then, and its first appearance in the archive for anything newer.
 */
export function overallReturn(identifiers: string | readonly string[], price: number, ordered: Baseline[]): number | null {
  for (const baseline of ordered) {
    const then = closeFor(baseline.prices, identifiers);
    if (then !== null) return ((price - then) / then) * 100;
  }

  return null;
}

export function periodReturn(identifiers: string | readonly string[], price: number, baseline: Baseline): number | null {
  const then = closeFor(baseline.prices, identifiers);
  if (then === null) return null;
  return ((price - then) / then) * 100;
}
