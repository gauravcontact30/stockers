import "server-only";
import { readJsonCache } from "./data-cache";
import type { PeriodReturnsCache } from "./historical-returns";
import { indianStocks, type CapTier } from "./indian-stocks";

/**
 * The companies the suggestion chips offer, chosen from what has actually been performing and
 * rotated once a day.
 *
 * Two boards on the landing page open with a row of example tickers under their search box — the
 * ownership board and the accuracy lookup. Both rows were hard-coded, and both had the same problem:
 * they were a fixed handful of the largest names in the country, so the chips said the same six
 * things in August that they said in January, and none of them was a suggestion in any real sense.
 *
 * What replaces them is drawn from the one-month return table this app already keeps, ranked, and
 * then shuffled by the day — so the chips are companies that have been moving, and a reader who
 * comes back tomorrow is offered a different set.
 *
 * ---------------------------------------------------------------------------
 * Why the shuffle is seeded rather than random
 * ---------------------------------------------------------------------------
 *
 * `Math.random()` cannot be used here and the reason is not taste. These chips are rendered on the
 * server into prerendered HTML and then hydrated in the browser; a genuinely random pick would
 * differ between those two renders and React would report a hydration mismatch. Worse, the page is
 * cached — a random pick would be frozen at whatever the prerender happened to draw, which is not
 * random at all, just arbitrary and then permanent.
 *
 * Seeding on the IST calendar date gives the property actually being asked for: every render on a
 * given day agrees, and the day rolling over is what changes the answer. The market this site is
 * about opens and closes on that same clock, so the chips turn over when the session does.
 */

/** The IST calendar day, `YYYY-MM-DD`. The same clock `historical-returns` keys its cache on. */
export function istDayKey(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** FNV-1a, folded to 32 bits. Any stable string→int would do; this one is short and has no deps. */
function seedFrom(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Mulberry32: a small, well-distributed PRNG, so one seed always produces one sequence. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher–Yates, driven by the seeded generator so the order is a function of the day alone. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  const next = generator(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export type DailyPick = { symbol: string; name: string; sector?: string; capTier?: CapTier };
type RankedDailyPick = { symbol: string; name: string; sector: string; capTier: CapTier; move: number };

type PickOptions = {
  /** How many chips the board draws. */
  count: number;
  /**
   * Which cap tiers may be offered.
   *
   * The ownership board passes Large and Mid deliberately. Its chips have to be companies that
   * actually file a quarterly shareholding pattern with real institutional lines in it, and a
   * randomly surfaced micro cap tends to file a register that is 95% promoter and nothing else —
   * a chip that technically works and shows the reader nothing.
   */
  tiers?: readonly CapTier[];
  /**
   * How deep into the ranking to draw from. Larger means more variety day to day; smaller keeps
   * every chip a genuinely strong performer. The chips are a starting point rather than a ranking,
   * so this is set well wider than `count`.
   */
  pool?: number;
  /** Offered when the return table has not been generated yet — see the note in `dailyPicks`. */
  fallback: readonly DailyPick[];
  /** Overridable so tests can pin a day rather than depend on when they run. */
  day?: string;
};

/**
 * The strongest one-month performers, in a different order every day.
 *
 * Reads the return table straight off disk and never refreshes it. That is deliberate: the caller
 * is a landing-page section, and `getOneMonthReturns` in ./historical-returns will, on the first
 * request of a new day, go and fetch price history for a hundred and fifty companies before it
 * answers. Blocking the landing page on that to decide what six chips should say is the wrong
 * trade by a wide margin. The table is refreshed by whoever asks for it properly — the returns
 * boards on this same page — so reading it here is free and at most one session stale.
 *
 * Falls back to the caller's own list rather than returning nothing, so a fresh checkout with no
 * generated data still renders the row it always did.
 */
export async function dailyPicks({
  count,
  tiers,
  pool = 24,
  fallback,
  day = istDayKey(),
}: PickOptions): Promise<DailyPick[]> {
  const table = await readJsonCache<PeriodReturnsCache>("one-month-returns.json").catch(() => null);
  if (!table?.returns) return [...fallback].slice(0, count);

  const allowed = tiers ? new Set(tiers) : null;
  const ranked = indianStocks
    .filter((stock) => !allowed || allowed.has(stock.capTier))
    .map((stock) => ({ symbol: stock.symbol, name: stock.name, sector: stock.sector, capTier: stock.capTier, move: table.returns[stock.symbol] }))
    .filter((entry): entry is RankedDailyPick => typeof entry.move === "number" && entry.move > 0)
    .sort((left, right) => right.move - left.move)
    .slice(0, pool);

  if (ranked.length < count) return [...fallback].slice(0, count);

  // Seeded on the day *and* the table's own date: if the figures are refreshed the chips follow
  // them, rather than holding yesterday's order over a new ranking.
  return seededShuffle(ranked, seedFrom(`${day}|${table.date}`))
    .slice(0, count)
    .map(({ symbol, name, sector, capTier }) => ({ symbol, name, sector, capTier }));
}
