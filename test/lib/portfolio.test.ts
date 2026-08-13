/** @jest-environment node */

import { promises as fs } from "node:fs";
import {
  cleanAmount,
  cleanNote,
  cleanSymbol,
  listHoldings,
  MAX_HOLDINGS,
  portfolioBackendName,
  removeHolding,
  saveHolding,
  type Holding,
} from "../../app/lib/portfolio";
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  measureHolding,
  portfolioBrief,
  splitByPerformance,
  summarisePortfolio,
  toneFor,
  type PriceSnapshot,
} from "../../app/lib/portfolio-metrics";

// The per-worker file jest.setup.ts points `app/lib/portfolio` at, so this suite never writes the
// real `app/data/portfolio-holdings.json`.
const holdingsPath = process.env.STOCKERS_PORTFOLIO_FILE as string;

beforeEach(async () => {
  await fs.rm(holdingsPath, { force: true });
});

afterAll(async () => {
  await fs.rm(holdingsPath, { force: true });
});

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "hold_1",
    userId: "user_1",
    symbol: "RELIANCE",
    quantity: 10,
    avgPrice: 1000,
    targetPrice: null,
    note: null,
    addedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function price(overrides: Partial<PriceSnapshot> = {}): PriceSnapshot {
  return { symbol: "RELIANCE", name: "Reliance Industries", price: 1200, previousClose: 1150, capTier: "Large", ...overrides };
}

describe("what arrives from outside", () => {
  it("accepts a ticker in the shape the exchange uses", () => {
    expect(cleanSymbol(" reliance ")).toBe("RELIANCE");
    expect(cleanSymbol("BAJAJ-AUTO")).toBe("BAJAJ-AUTO");
    expect(cleanSymbol("ARE&M")).toBe("ARE&M");
    expect(cleanSymbol("has spaces")).toBeNull();
    expect(cleanSymbol(42)).toBeNull();
    expect(cleanSymbol("")).toBeNull();
  });

  it("reads an amount, tells absent from zero, and refuses nonsense", () => {
    expect(cleanAmount("1,250.50", 1000000)).toBe(1250.5);
    expect(cleanAmount(12.345, 1000000)).toBe(12.35);
    // Zero is a real answer — it is what "tracked, not owned" is stored as.
    expect(cleanAmount(0, 1000)).toBe(0);
    // Absent is not zero: the store reads null as "leave what was there alone".
    expect(cleanAmount("", 1000)).toBeNull();
    expect(cleanAmount(undefined, 1000)).toBeNull();
    expect(cleanAmount(null, 1000)).toBeNull();
    expect(cleanAmount("banana", 1000)).toBeNull();
    expect(cleanAmount(-5, 1000)).toBeNull();
    // A mistyped zero is clamped rather than refused.
    expect(cleanAmount(999999, 1000)).toBe(1000);
  });

  it("trims a note and treats an empty one as none", () => {
    expect(cleanNote("  buying the dip  ")).toBe("buying the dip");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(7)).toBeNull();
    expect(cleanNote("x".repeat(400))).toHaveLength(280);
  });
});

describe("the store", () => {
  it("reports which backend is in use", () => {
    expect(portfolioBackendName()).toBe("file");
  });

  it("saves a holding and reads it back for its owner only", async () => {
    await saveHolding("user_1", { symbol: "reliance", quantity: 10, avgPrice: 1000 });
    await saveHolding("user_2", { symbol: "TCS", quantity: 5, avgPrice: 3000 });

    const mine = await listHoldings("user_1");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ symbol: "RELIANCE", quantity: 10, avgPrice: 1000, userId: "user_1" });
    expect(await listHoldings("user_2")).toHaveLength(1);
    expect(await listHoldings("user_3")).toEqual([]);
  });

  it("treats a second add of the same stock as a top-up, not a second row", async () => {
    await saveHolding("user_1", { symbol: "RELIANCE", quantity: 10, avgPrice: 1000 });
    const result = await saveHolding("user_1", { symbol: "RELIANCE", quantity: 25, avgPrice: 1100 });

    expect(result.ok).toBe(true);
    const list = await listHoldings("user_1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ quantity: 25, avgPrice: 1100 });
  });

  it("leaves untouched fields alone, so editing the note cannot zero the position", async () => {
    await saveHolding("user_1", { symbol: "RELIANCE", quantity: 10, avgPrice: 1000, targetPrice: 1500 });
    await saveHolding("user_1", { symbol: "RELIANCE", note: "core holding" });

    expect((await listHoldings("user_1"))[0]).toMatchObject({
      quantity: 10,
      avgPrice: 1000,
      targetPrice: 1500,
      note: "core holding",
    });
  });

  it("keeps the original added date and moves the updated one", async () => {
    await saveHolding("user_1", { symbol: "RELIANCE", quantity: 1 });
    const first = (await listHoldings("user_1"))[0];

    await saveHolding("user_1", { symbol: "RELIANCE", quantity: 2 });
    const second = (await listHoldings("user_1"))[0];

    expect(second.addedAt).toBe(first.addedAt);
    expect(second.id).toBe(first.id);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
  });

  it("stores a zero quantity as a tracked, unowned row", async () => {
    await saveHolding("user_1", { symbol: "TCS", quantity: 0 });

    expect((await listHoldings("user_1"))[0]).toMatchObject({ quantity: 0, avgPrice: 0 });
  });

  it("refuses a symbol that is not one", async () => {
    expect(await saveHolding("user_1", { symbol: "not a ticker" })).toEqual({ ok: false, reason: "invalid-symbol" });
    expect(await listHoldings("user_1")).toEqual([]);
  });

  it("refuses to grow past the cap, but still lets an existing holding be edited", async () => {
    for (let index = 0; index < MAX_HOLDINGS; index++) {
      await saveHolding("user_1", { symbol: `SYM${index}`, quantity: 1 });
    }

    expect(await saveHolding("user_1", { symbol: "ONEMORE", quantity: 1 })).toEqual({ ok: false, reason: "full" });
    expect(await saveHolding("user_1", { symbol: "SYM0", quantity: 9 })).toMatchObject({ ok: true });
    expect(await listHoldings("user_1")).toHaveLength(MAX_HOLDINGS);
  });

  it("removes one holding, and only from the account that owns it", async () => {
    await saveHolding("user_1", { symbol: "RELIANCE", quantity: 1 });
    await saveHolding("user_2", { symbol: "RELIANCE", quantity: 1 });

    expect(await removeHolding("user_2", "reliance")).toBe(true);
    expect(await listHoldings("user_2")).toEqual([]);
    // The other account's identically-named row is untouched.
    expect(await listHoldings("user_1")).toHaveLength(1);
  });

  it("reports nothing removed for a stock that is not held, or a symbol that is not one", async () => {
    expect(await removeHolding("user_1", "RELIANCE")).toBe(false);
    expect(await removeHolding("user_1", null)).toBe(false);
  });

  it("treats an unreadable file as an empty portfolio", async () => {
    await fs.writeFile(holdingsPath, "{not json", "utf8");
    expect(await listHoldings("user_1")).toEqual([]);

    await fs.writeFile(holdingsPath, JSON.stringify({ notAnArray: true }), "utf8");
    expect(await listHoldings("user_1")).toEqual([]);
  });

  it("lists newest first", async () => {
    await fs.writeFile(
      holdingsPath,
      JSON.stringify([
        holding({ id: "a", symbol: "AAA", addedAt: "2026-08-01T00:00:00.000Z" }),
        holding({ id: "b", symbol: "BBB", addedAt: "2026-08-05T00:00:00.000Z" }),
      ]),
      "utf8",
    );

    expect((await listHoldings("user_1")).map((entry) => entry.symbol)).toEqual(["BBB", "AAA"]);
  });
});

describe("measuring one position", () => {
  it("values it, and measures the return against what it cost", () => {
    const measured = measureHolding(holding(), price(), 12000);

    expect(measured).toMatchObject({
      invested: 10000,
      value: 12000,
      pnl: 2000,
      pnlPercent: 20,
      dayChange: 500,
      weight: 1,
      tracked: false,
    });
  });

  it("leaves everything null when the feed had no price", () => {
    const measured = measureHolding(holding(), price({ price: null, previousClose: null }), 0);

    expect(measured).toMatchObject({ value: null, pnl: null, pnlPercent: null, dayChange: null, weight: 0 });
    // A position worth "unknown" must never read as a position worth nothing.
    expect(measured.invested).toBe(10000);
  });

  it("has no return to report for a tracked row with no cost basis", () => {
    const measured = measureHolding(holding({ quantity: 0, avgPrice: 0 }), price(), 0);

    expect(measured).toMatchObject({ tracked: true, invested: 0, value: 0, pnl: null, pnlPercent: null });
  });

  it("measures progress towards a target, clamped at both ends", () => {
    const towards = (current: number, target: number | null) =>
      measureHolding(holding({ targetPrice: target }), price({ price: current }), 1).targetProgress;

    expect(towards(1250, 1500)).toBe(0.5);
    // Past the target the bar is full; below cost it is empty.
    expect(towards(2000, 1500)).toBe(1);
    expect(towards(800, 1500)).toBe(0);
    expect(towards(1250, null)).toBeNull();
    // A target at or below the buy price is not a target to make progress against.
    expect(towards(1250, 900)).toBeNull();
  });

  it("has no target progress without a price", () => {
    expect(measureHolding(holding({ targetPrice: 1500 }), price({ price: null }), 0).targetProgress).toBeNull();
  });

  it("ignores a figure the feed sent as something other than a number", () => {
    const measured = measureHolding(holding(), price({ oneMonth: Number.NaN, oneYear: undefined }), 1);

    expect(measured.oneMonth).toBeNull();
    expect(measured.oneYear).toBeNull();
  });
});

describe("summarising the book", () => {
  const prices = new Map<string, PriceSnapshot>([
    ["RELIANCE", price({ symbol: "RELIANCE", price: 1200, previousClose: 1150, capTier: "Large" })],
    ["SMALLCO", price({ symbol: "SMALLCO", price: 90, previousClose: 100, capTier: "Small" })],
  ]);

  const book = [
    holding({ id: "a", symbol: "RELIANCE", quantity: 10, avgPrice: 1000 }),
    holding({ id: "b", symbol: "SMALLCO", quantity: 100, avgPrice: 100 }),
  ];

  it("adds up cost, value and the gap between them", () => {
    const summary = summarisePortfolio(book, prices);

    expect(summary.invested).toBe(20000);
    expect(summary.value).toBe(21000);
    expect(summary.pnl).toBe(1000);
    expect(summary.pnlPercent).toBe(5);
    // 10 x (1200-1150) = +500, and 100 x (90-100) = -1000.
    expect(summary.dayChange).toBe(-500);
  });

  it("weights every position against the same total, not a running one", () => {
    const summary = summarisePortfolio(book, prices);
    const weights = summary.holdings.map((entry) => Math.round(entry.weight * 100));

    expect(weights).toEqual([57, 43]);
    expect(summary.concentration).toBeCloseTo(12000 / 21000, 5);
  });

  it("names the best and worst positions by return, not by size", () => {
    const summary = summarisePortfolio(book, prices);

    expect(summary.best?.symbol).toBe("RELIANCE");
    expect(summary.worst?.symbol).toBe("SMALLCO");
  });

  it("has no worst position when there is only one to rank", () => {
    const summary = summarisePortfolio([book[0]], prices);

    expect(summary.best?.symbol).toBe("RELIANCE");
    expect(summary.worst).toBeNull();
  });

  it("counts tracked rows apart from owned ones and keeps them out of the totals", () => {
    const summary = summarisePortfolio([...book, holding({ id: "c", symbol: "WATCHME", quantity: 0, avgPrice: 0 })], prices);

    expect(summary).toMatchObject({ owned: 2, tracked: 1, invested: 20000 });
  });

  it("says how many owned positions it could not price, and leaves them out", () => {
    const summary = summarisePortfolio([...book, holding({ id: "c", symbol: "NOPRICE", quantity: 5, avgPrice: 200 })], prices);

    expect(summary.unpriced).toBe(1);
    // The unpriced position's cost is excluded too, so the percentage compares like with like.
    expect(summary.invested).toBe(20000);
  });

  it("splits market value by company size, largest tier first", () => {
    const summary = summarisePortfolio(book, prices);

    expect(summary.mix).toEqual([
      { label: "Large", value: 12000, weight: 12000 / 21000 },
      { label: "Small", value: 9000, weight: 9000 / 21000 },
    ]);
  });

  it("files a position the feed could not classify under Unclassified", () => {
    const summary = summarisePortfolio(
      [holding({ symbol: "MYSTERY", quantity: 1, avgPrice: 10 })],
      new Map([["MYSTERY", price({ symbol: "MYSTERY", price: 20, capTier: null })]]),
    );

    expect(summary.mix).toEqual([{ label: "Unclassified", value: 20, weight: 1 }]);
  });

  it("reports zeroes rather than dividing by nothing for an empty book", () => {
    const summary = summarisePortfolio([], new Map());

    expect(summary).toMatchObject({ invested: 0, value: 0, pnl: 0, pnlPercent: 0, dayChangePercent: 0, concentration: 0 });
    expect(summary.mix).toEqual([]);
  });
});

describe("splitting the book into what is working and what is not", () => {
  const prices = new Map<string, PriceSnapshot>([
    ["WINNER", price({ symbol: "WINNER", price: 200 })],
    ["ALSOUP", price({ symbol: "ALSOUP", price: 110 })],
    ["LOSER", price({ symbol: "LOSER", price: 50 })],
    ["WORSE", price({ symbol: "WORSE", price: 10 })],
    ["FLAT", price({ symbol: "FLAT", price: 100 })],
  ]);

  const book = [
    holding({ id: "a", symbol: "WINNER", quantity: 1, avgPrice: 100 }),
    holding({ id: "b", symbol: "ALSOUP", quantity: 1, avgPrice: 100 }),
    holding({ id: "c", symbol: "LOSER", quantity: 1, avgPrice: 100 }),
    holding({ id: "d", symbol: "WORSE", quantity: 1, avgPrice: 100 }),
    holding({ id: "e", symbol: "FLAT", quantity: 1, avgPrice: 100 }),
    holding({ id: "f", symbol: "TRACKED", quantity: 0, avgPrice: 0 }),
    holding({ id: "g", symbol: "NOPRICE", quantity: 1, avgPrice: 100 }),
  ];

  const split = () => splitByPerformance(summarisePortfolio(book, prices).holdings);

  it("puts everything at or above its cost under performing, best first", () => {
    expect(split().performing.map((entry) => entry.symbol)).toEqual(["WINNER", "ALSOUP", "FLAT"]);
  });

  it("puts everything below its cost under not performing, worst first", () => {
    expect(split().lagging.map((entry) => entry.symbol)).toEqual(["WORSE", "LOSER"]);
  });

  it("keeps a tracked stock and an unpriceable one out of both verdicts", () => {
    // The point of the third group: a stock nobody has bought is not a loss.
    expect(split().watching.map((entry) => entry.symbol)).toEqual(["NOPRICE", "TRACKED"]);
  });

  it("totals each side, so a card can carry its own figure", () => {
    expect(split().performingPnl).toBe(110);
    expect(split().laggingPnl).toBe(-140);
  });

  it("copes with an empty book", () => {
    expect(splitByPerformance([])).toMatchObject({ performing: [], lagging: [], watching: [], performingPnl: 0, laggingPnl: 0 });
  });
});

describe("formatting", () => {
  it("writes rupees the Indian way, dropping paise on the larger figures", () => {
    expect(formatMoney(1234567)).toBe("₹12,34,567");
    expect(formatMoney(12.5)).toBe("₹12.5");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });

  it("puts the direction on the front of a figure that can go either way", () => {
    expect(formatSignedMoney(1200)).toBe("+₹1,200");
    expect(formatSignedMoney(-1200)).toBe("−₹1,200");
    expect(formatSignedMoney(null)).toBe("—");
  });

  it("writes a percentage with its sign", () => {
    expect(formatPercent(5.126)).toBe("+5.13%");
    expect(formatPercent(-5)).toBe("−5.00%");
    expect(formatPercent(null)).toBe("—");
  });

  it("tones a figure by its direction, and greys an unknown one", () => {
    expect(toneFor(1)).toContain("emerald");
    expect(toneFor(-1)).toContain("rose");
    expect(toneFor(null)).toContain("slate");
  });
});

describe("the brief the AI reads", () => {
  it("is built only from figures already on the page", () => {
    const summary = summarisePortfolio(
      [holding({ symbol: "RELIANCE", quantity: 10, avgPrice: 1000 })],
      new Map([["RELIANCE", price()]]),
    );
    const brief = portfolioBrief(summary);

    expect(brief?.facts).toContainEqual({ label: "Market value", value: "₹12,000" });
    expect(brief?.facts).toContainEqual({ label: "Invested", value: "₹10,000" });
    expect(brief?.highlights).toContain("RELIANCE is the strongest position at +20.00%.");
    expect(brief?.highlights).toContain("Large cap holdings are 100% of market value.");
  });

  it("says when positions were left out of the totals", () => {
    const summary = summarisePortfolio([holding({ symbol: "NOPRICE", quantity: 5, avgPrice: 200 })], new Map());

    expect(portfolioBrief(summary)?.highlights).toContain(
      "1 owned position(s) could not be priced and are outside these totals.",
    );
  });

  it("has nothing to say about an empty portfolio", () => {
    expect(portfolioBrief(summarisePortfolio([], new Map()))).toBeNull();
  });
});
