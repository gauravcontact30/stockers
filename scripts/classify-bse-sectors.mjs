// Builds app/data/bse-sectors.json: every listed BSE company's category, read from the exchange.
//
// BSE answers this one company at a time, so the whole exchange is ~4,900 requests. Run once and
// the boards read the file instead — this is the same map lib/bse-sectors.ts builds in the
// background, written to the same place, so either can fill it and neither repeats the other's work.
//
//   node scripts/classify-bse-sectors.mjs
//
// Deliberately slow: four requests a second. Eight in parallel got this app's IP blocked, which
// took every BSE-backed board down with it.

import { promises as fs } from "node:fs";
import path from "node:path";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.bseindia.com",
  Referer: "https://www.bseindia.com/",
};

const CACHE_FILE = path.join(process.cwd(), "app", "data", "bse-sectors.json");
const PACE_MS = 250;
const CHECKPOINT_EVERY = 200;
const FAILURE_STREAK_LIMIT = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function save(sectors) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), sectors }), "utf8");
}

const universe = await getJson(
  "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active",
);
if (!Array.isArray(universe)) {
  console.error("Could not read the scrip list — the exchange refused it. Try again shortly.");
  process.exit(1);
}

// Resume rather than restart: a run that stopped half way has already paid for what it fetched.
let sectors = {};
try {
  sectors = JSON.parse(await fs.readFile(CACHE_FILE, "utf8")).sectors ?? {};
} catch {
  // No previous run.
}

const codes = universe.map((row) => String(row.SCRIP_CD)).filter((code) => code && !sectors[code]);
console.log(`${universe.length} listed · ${Object.keys(sectors).length} already known · ${codes.length} to fetch`);

let done = 0;
let failureStreak = 0;

for (const code of codes) {
  const header = await getJson(
    `https://api.bseindia.com/BseIndiaAPI/api/ComHeader/w?quotetype=EQ&scripcode=${encodeURIComponent(code)}&seriesid=`,
  );

  if (header === null) {
    failureStreak++;
    if (failureStreak >= FAILURE_STREAK_LIMIT) {
      console.error(`\nStopped: the exchange refused ${FAILURE_STREAK_LIMIT} requests in a row. Progress is saved.`);
      break;
    }
  } else {
    failureStreak = 0;
    sectors[code] = {
      sector: String(header.Sector ?? "").trim() || null,
      industry: String(header.IndustryNew ?? header.Industry ?? "").trim() || null,
    };
  }

  if (++done % CHECKPOINT_EVERY === 0) {
    await save(sectors);
    const classified = Object.values(sectors).filter((entry) => entry.industry).length;
    console.log(`  ${done}/${codes.length} fetched · ${classified} classified`);
  }

  await sleep(PACE_MS);
}

await save(sectors);

const byCategory = {};
for (const entry of Object.values(sectors)) {
  if (entry.industry) byCategory[entry.industry] = (byCategory[entry.industry] ?? 0) + 1;
}

console.log(`\nSaved ${Object.keys(sectors).length} companies to ${CACHE_FILE}`);
for (const [category, count] of Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${category.padEnd(38)} ${count}`);
}
