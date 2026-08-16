import { dailyPicks, istDayKey, seededShuffle } from "../../app/lib/daily-picks";
import { readJsonCache } from "../../app/lib/data-cache";
import { indianStocks } from "../../app/lib/indian-stocks";

jest.mock("../../app/lib/data-cache", () => ({
  readJsonCache: jest.fn(),
}));

const read = readJsonCache as jest.MockedFunction<typeof readJsonCache>;

const FALLBACK = [
  { symbol: "RELIANCE", name: "Reliance" },
  { symbol: "TCS", name: "TCS" },
];

/** A return table where the nth large/mid cap in the catalogue rises by a decreasing amount. */
function table(date = "2026-08-16") {
  const returns: Record<string, number> = {};
  indianStocks
    .filter((stock) => stock.capTier === "Large" || stock.capTier === "Mid")
    .forEach((stock, index) => {
      returns[stock.symbol] = 100 - index;
    });
  return { date, generatedAt: `${date}T00:00:00.000Z`, returns };
}

describe("seededShuffle", () => {
  it("is a permutation, never a subset or a duplication", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...seededShuffle(source, 42)].sort((a, b) => a - b)).toEqual(source);
  });

  it("gives one order per seed, so every render on a day agrees", () => {
    const source = ["a", "b", "c", "d", "e", "f"];
    expect(seededShuffle(source, 7)).toEqual(seededShuffle(source, 7));
  });

  it("gives a different order for a different seed, which is what makes the day matter", () => {
    const source = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(seededShuffle(source, 1)).not.toEqual(seededShuffle(source, 2));
  });

  it("does not mutate what it was handed", () => {
    const source = ["a", "b", "c"];
    seededShuffle(source, 3);
    expect(source).toEqual(["a", "b", "c"]);
  });
});

describe("istDayKey", () => {
  it("reads the calendar date in India, not in the machine's own zone", () => {
    // 19:00 UTC on the 15th is 00:30 on the 16th in Kolkata — the case a UTC server gets wrong.
    expect(istDayKey(new Date("2026-08-15T19:00:00.000Z"))).toBe("2026-08-16");
  });
});

describe("dailyPicks", () => {
  it("falls back when the return table has never been generated", async () => {
    read.mockResolvedValue(null);

    expect(await dailyPicks({ count: 2, fallback: FALLBACK })).toEqual(FALLBACK);
  });

  it("falls back when reading the table throws rather than propagating", async () => {
    read.mockRejectedValue(new Error("disk gone"));

    expect(await dailyPicks({ count: 2, fallback: FALLBACK })).toEqual(FALLBACK);
  });

  it("falls back when the ranked set is smaller than the number of chips asked for", async () => {
    read.mockResolvedValue({ date: "2026-08-16", generatedAt: "", returns: { TCS: 5 } });

    expect(await dailyPicks({ count: 6, fallback: FALLBACK })).toEqual(FALLBACK);
  });

  it("draws only from companies that actually rose", async () => {
    const returns = Object.fromEntries(indianStocks.map((stock, index) => [stock.symbol, index < 10 ? 5 : -5]));
    read.mockResolvedValue({ date: "2026-08-16", generatedAt: "", returns });

    const picks = await dailyPicks({ count: 4, fallback: FALLBACK, pool: 50 });
    const fallen = indianStocks.slice(10).map((stock) => stock.symbol);
    expect(picks.every((pick) => !fallen.includes(pick.symbol))).toBe(true);
  });

  it("honours the cap-tier restriction the ownership board depends on", async () => {
    read.mockResolvedValue(table());

    const picks = await dailyPicks({ count: 6, tiers: ["Large"], fallback: FALLBACK, pool: 40 });
    const largeCaps = new Set(
      indianStocks.filter((stock) => stock.capTier === "Large").map((stock) => stock.symbol),
    );
    expect(picks).toHaveLength(6);
    expect(picks.every((pick) => largeCaps.has(pick.symbol))).toBe(true);
  });

  it("returns the same set twice on the same day, so the server and the browser agree", async () => {
    read.mockResolvedValue(table());

    const first = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-16" });
    read.mockResolvedValue(table());
    const second = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-16" });

    expect(first).toEqual(second);
  });

  it("returns a different set the next day", async () => {
    read.mockResolvedValue(table());
    const today = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-16" });
    read.mockResolvedValue(table());
    const tomorrow = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-17" });

    expect(tomorrow).not.toEqual(today);
  });

  it("re-draws when the figures are refreshed, rather than holding yesterday's order", async () => {
    read.mockResolvedValue(table("2026-08-16"));
    const before = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-16" });
    read.mockResolvedValue(table("2026-08-17"));
    const after = await dailyPicks({ count: 6, fallback: FALLBACK, day: "2026-08-16" });

    expect(after).not.toEqual(before);
  });

  it("carries the company's real name, which is what the chip renders", async () => {
    read.mockResolvedValue(table());

    for (const pick of await dailyPicks({ count: 6, fallback: FALLBACK })) {
      expect(indianStocks.find((stock) => stock.symbol === pick.symbol)?.name).toBe(pick.name);
    }
  });
});
