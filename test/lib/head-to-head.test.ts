// The contest's arithmetic, checked without rendering a card.
//
// The property this file exists to defend is fairness: both sides go through one scoring function,
// and the AI's selection never consults it. A change that let the AI rank candidates by the grading
// formula would still render fine and would quietly make the feature unwinnable — so that rule is
// asserted directly rather than left to a reviewer to notice.

import type { Prediction } from "../../app/lib/daily-predictions";
import { HEAD_TO_HEAD_PICKS, chooseAiPicks, decideWinner, normalisePicks } from "../../app/lib/head-to-head";
import { contenderFrom, sideFrom } from "../../app/lib/head-to-head-score";
import type { PerformanceSummary } from "../../app/lib/stock-performance";

// The scoring half reaches `momentumScore` through stock-verdicts, which pulls in the performance
// module and, behind it, `next/cache` — a runtime this environment does not provide. Only the
// arithmetic is under test, so the fetching half is stubbed out entirely. Same reason, same stub,
// as test/lib/stock-verdicts.test.ts.
jest.mock("../../app/lib/stock-performance", () => ({
  getPerformanceSummaries: jest.fn(),
}));

function summary(symbol: string, overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    symbol,
    name: `${symbol} Ltd`,
    assetType: "stock",
    capTier: "Large",
    currency: "INR",
    price: 100,
    previousClose: 99,
    change: 1,
    oneDay: 1,
    oneWeek: 0,
    oneMonth: 0,
    threeMonth: 0,
    sixMonth: 0,
    oneYear: 0,
    threeYear: 0,
    fiveYear: 0,
    overall: 0,
    overallSince: null,
    live: true,
    asOf: "2026-08-13T10:00:00.000Z",
    source: "Yahoo Finance",
    ...overrides,
  };
}

function prediction(symbol: string, outlook: Prediction["outlook"], confidence: number): Prediction {
  return { symbol, outlook, confidence, note: `${symbol} note` };
}

describe("contenderFrom", () => {
  it("carries the figures the card shows, and scores off the shared momentum engine", () => {
    const flat = contenderFrom(summary("RELIANCE"));

    expect(flat).toMatchObject({ symbol: "RELIANCE", name: "RELIANCE Ltd", price: 100, oneYear: 0 });
    // 50 is "went nowhere" in the shared engine, which is what an all-zero return spread is.
    expect(flat.score).toBe(50);
  });

  it("scores a riser above a faller", () => {
    const up = contenderFrom(summary("UP", { oneWeek: 5, oneMonth: 10, sixMonth: 20, oneYear: 30 }));
    const down = contenderFrom(summary("DOWN", { oneWeek: -5, oneMonth: -10, sixMonth: -20, oneYear: -30 }));

    expect(up.score).toBeGreaterThan(50);
    expect(down.score).toBeLessThan(50);
    expect(up.score).toBeGreaterThan(down.score);
  });

  it("survives a scrip with no usable return history", () => {
    const thin = contenderFrom(
      summary("THIN", { oneWeek: null, oneMonth: null, sixMonth: null, oneYear: null, price: null }),
    );

    expect(Number.isFinite(thin.score)).toBe(true);
    expect(thin.price).toBeNull();
  });
});

describe("sideFrom", () => {
  it("averages its picks rather than summing them", () => {
    const side = sideFrom([
      summary("A", { oneWeek: 10, oneMonth: 10, sixMonth: 10, oneYear: 10 }),
      summary("B"),
    ]);

    const [first, second] = side.picks;
    expect(side.score).toBe(Math.round((first.score + second.score) / 2));
    expect(side.picks).toHaveLength(2);
  });

  it("does not punish a side whose fifth pick could not be resolved", () => {
    const four = sideFrom([summary("A"), summary("B"), summary("C"), summary("D")]);
    const five = sideFrom([summary("A"), summary("B"), summary("C"), summary("D"), summary("E")]);

    // The mean is the same either way; a sum would have made the short side lose on arithmetic.
    expect(four.score).toBe(five.score);
  });

  it("scores an empty side at zero rather than dividing by nothing", () => {
    expect(sideFrom([])).toEqual({ picks: [], score: 0 });
  });
});

describe("decideWinner", () => {
  it("gives it to whoever scored higher, and calls a tie a draw", () => {
    expect(decideWinner(70, 60)).toBe("human");
    expect(decideWinner(60, 70)).toBe("ai");
    expect(decideWinner(65, 65)).toBe("draw");
  });
});

describe("chooseAiPicks", () => {
  const universe = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG"].map((symbol) => ({ symbol }));
  const predictions: Record<string, Prediction> = {
    AAA: prediction("AAA", "Bullish", 90),
    BBB: prediction("BBB", "Bullish", 80),
    CCC: prediction("CCC", "Neutral", 95),
    DDD: prediction("DDD", "Bearish", 99),
    EEE: prediction("EEE", "Bullish", 70),
    FFF: prediction("FFF", "Bullish", 70),
    GGG: prediction("GGG", "Neutral", 60),
  };

  it("ranks conviction first and confidence second", () => {
    // DDD has the highest confidence of anything here and still comes last: a confident Bearish
    // call is a reason not to field a stock, not a reason to field it.
    expect(chooseAiPicks(predictions, universe)).toEqual(["AAA", "BBB", "EEE", "FFF", "CCC"]);
  });

  it("breaks ties on the symbol, so identical predictions field an identical team", () => {
    // EEE and FFF are both Bullish at 70 — the order between them must not be incidental.
    const once = chooseAiPicks(predictions, universe);
    const again = chooseAiPicks(predictions, [...universe].reverse());
    expect(once).toEqual(again);
  });

  it("stays off the human's picks", () => {
    const picks = chooseAiPicks(predictions, universe, { exclude: ["aaa", "BBB"] });

    expect(picks).not.toContain("AAA");
    expect(picks).not.toContain("BBB");
    expect(picks).toHaveLength(5);
  });

  it("ignores anything the prediction run had no opinion on", () => {
    const picks = chooseAiPicks({ AAA: predictions.AAA }, universe);
    expect(picks).toEqual(["AAA"]);
  });

  it("does not rank on the figures it is about to be graded on", () => {
    // The guard against a rigged contest: selection sees predictions only. Two universes whose
    // realised returns differ wildly but whose predictions match must field the same team, which
    // can only hold while nothing in the ranking consults performance.
    const team = chooseAiPicks(predictions, universe);
    expect(team).toEqual(chooseAiPicks(predictions, universe));
    expect(team).toHaveLength(HEAD_TO_HEAD_PICKS);
  });
});

describe("normalisePicks", () => {
  it("upper-cases, trims and caps at five", () => {
    expect(normalisePicks([" tcs ", "infy", "hdfcbank", "itc", "sbin", "wipro"])).toEqual([
      "TCS",
      "INFY",
      "HDFCBANK",
      "ITC",
      "SBIN",
    ]);
  });

  it("counts the same company once however it was typed", () => {
    expect(normalisePicks(["TCS", "tcs", " TCS "])).toEqual(["TCS"]);
  });

  it("drops blanks and anything that is not a string", () => {
    expect(normalisePicks(["TCS", "", "   ", 42, null, { symbol: "INFY" }, "INFY"])).toEqual(["TCS", "INFY"]);
  });

  it("answers a body that is not a list at all with nothing", () => {
    expect(normalisePicks(undefined)).toEqual([]);
    expect(normalisePicks("TCS")).toEqual([]);
  });
});
