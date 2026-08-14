// The contest's arithmetic, checked without rendering a card.
//
// The property this file exists to defend is fairness: both sides go through one scoring function,
// and the AI's selection never consults it. A change that let the AI rank candidates by the grading
// formula would still render fine and would quietly make the feature unwinnable — so that rule is
// asserted directly rather than left to a reviewer to notice.

import type { Prediction } from "../../app/lib/daily-predictions";
import {
  AI_SKILLS,
  HEAD_TO_HEAD_PICKS,
  chooseAiPicks,
  decideWinner,
  normalisePicks,
  pickAiSkill,
  weightedSample,
  type AiCandidate,
} from "../../app/lib/head-to-head";
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

/** One company as the exchange board plus the forecast describe it. */
function candidate(symbol: string, overrides: Partial<AiCandidate> = {}): AiCandidate {
  return {
    symbol,
    name: `${symbol} Ltd`,
    capTier: "Large",
    sector: "technology",
    longRun: 100,
    today: 1,
    outlook: "Bullish",
    confidence: 70,
    ...overrides,
  };
}

/** A random() that walks a fixed sequence, so a draw can be pinned exactly. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

/** Always takes the first ticket, which makes `weightedSample` behave as "take the top N". */
const alwaysTop = () => 0;

describe("AI_SKILLS", () => {
  it("offers several genuinely different lenses, each with something to show the reader", () => {
    expect(AI_SKILLS.length).toBeGreaterThanOrEqual(5);
    for (const skill of AI_SKILLS) {
      expect(skill.key).toBeTruthy();
      expect(skill.label).toBeTruthy();
      expect(skill.blurb.length).toBeGreaterThan(20);
    }
    // Keys are what the card is told apart by, so two skills must never share one.
    expect(new Set(AI_SKILLS.map((skill) => skill.key)).size).toBe(AI_SKILLS.length);
  });

  it("never ranks on the window the grader scores with", () => {
    // The guard against a rigged contest. A skill only ever sees the long-run return, today's
    // move, and the forward view — never the 1w/1m/6m/1y weighting `momentumScore` uses. Two
    // candidates identical in those three must rank identically under every skill, which cannot
    // hold if a skill has quietly started reading performance.
    const left = candidate("LEFT");
    const right = candidate("RIGHT");
    for (const skill of AI_SKILLS) {
      expect(skill.rank(left)).toBe(skill.rank(right));
    }
  });
});

describe("pickAiSkill", () => {
  it("draws a different lens as the roll moves across the range", () => {
    expect(pickAiSkill(() => 0)).toBe(AI_SKILLS[0]);
    expect(pickAiSkill(() => 0.999)).toBe(AI_SKILLS[AI_SKILLS.length - 1]);
  });

  it("stays in range on a roll of exactly 1", () => {
    // Math.random never returns 1, but a stubbed one can, and an out-of-range index here would be
    // an undefined skill reaching the card.
    expect(AI_SKILLS).toContain(pickAiSkill(() => 1));
  });
});

describe("weightedSample", () => {
  it("favours the top of the list but can reach past it", () => {
    const ranked = ["A", "B", "C", "D"];
    expect(weightedSample(ranked, 2, alwaysTop)).toEqual(["A", "B"]);
    // A ticket close to the total lands at the tail instead.
    expect(weightedSample(ranked, 1, () => 0.999)).toEqual(["D"]);
  });

  it("never draws the same name twice, and stops when the pool runs out", () => {
    const drawn = weightedSample(["A", "B"], 5, sequence([0.5, 0.5, 0.5]));
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn).toHaveLength(2);
  });
});

describe("chooseAiPicks", () => {
  const compounder = AI_SKILLS.find((skill) => skill.key === "compounder")!;
  const contrarian = AI_SKILLS.find((skill) => skill.key === "contrarian")!;
  const spread = AI_SKILLS.find((skill) => skill.key === "spread")!;
  const explorer = AI_SKILLS.find((skill) => skill.key === "explorer")!;

  const field = [
    candidate("AAA", { longRun: 500 }),
    candidate("BBB", { longRun: 400 }),
    candidate("CCC", { longRun: 300 }),
    candidate("DDD", { longRun: 200 }),
    candidate("EEE", { longRun: 100 }),
    candidate("FFF", { longRun: 50 }),
  ];

  it("fields the skill's best when the draw always takes the top", () => {
    expect(chooseAiPicks(field, { skill: compounder, random: alwaysTop })).toEqual([
      "AAA",
      "BBB",
      "CCC",
      "DDD",
      "EEE",
    ]);
  });

  it("fields a different team on a different draw", () => {
    const first = chooseAiPicks(field, { skill: compounder, random: alwaysTop });
    const second = chooseAiPicks(field, { skill: compounder, random: sequence([0.99, 0.99, 0.99, 0.99, 0.99]) });

    expect(first).not.toEqual(second);
    expect(second).toHaveLength(HEAD_TO_HEAD_PICKS);
  });

  it("leaves out a company the forecast has turned against", () => {
    const withBear = [...field, candidate("BEAR", { longRun: 9999, outlook: "Bearish" })];
    // The best long-run record on the board, and it is still not fielded: the record is a reason
    // to look, not a reason to buy something the desk expects to fall.
    expect(chooseAiPicks(withBear, { skill: compounder, random: alwaysTop })).not.toContain("BEAR");
  });

  it("buys weakness when the contrarian lens is drawn", () => {
    const mixed = [
      candidate("UP", { longRun: 500, today: 6 }),
      candidate("DOWN", { longRun: 400, today: -6 }),
    ];
    // DOWN has the weaker record and is fielded first anyway, because it is the one on sale.
    expect(chooseAiPicks(mixed, { skill: contrarian, random: alwaysTop })[0]).toBe("DOWN");
  });

  it("takes one company per sector when the diversifier is drawn", () => {
    const sectors = [
      candidate("T1", { sector: "technology", longRun: 500 }),
      candidate("T2", { sector: "technology", longRun: 490 }),
      candidate("F1", { sector: "financials", longRun: 400 }),
      candidate("E1", { sector: "energy", longRun: 300 }),
    ];
    const picks = chooseAiPicks(sectors, { skill: spread, random: alwaysTop, count: 3 });

    expect(picks).toEqual(["T1", "F1", "E1"]);
    expect(picks).not.toContain("T2");
  });

  it("keeps unclassified companies out of one shared bucket", () => {
    const unknowns = [
      candidate("U1", { sector: null, longRun: 500 }),
      candidate("U2", { sector: null, longRun: 400 }),
    ];
    // Two companies the exchange has not classified are not "the same sector" — lumping them
    // together would let one unknown scrip block every other.
    expect(chooseAiPicks(unknowns, { skill: spread, random: alwaysTop, count: 2 })).toEqual(["U1", "U2"]);
  });

  it("looks past the megacaps when the explorer is drawn", () => {
    const tiers = [
      candidate("BIG", { capTier: "Large", longRun: 900 }),
      candidate("MID", { capTier: "Mid", longRun: 300 }),
      candidate("SMALL", { capTier: "Small", longRun: 200 }),
    ];
    const picks = chooseAiPicks(tiers, { skill: explorer, random: alwaysTop, count: 2 });

    expect(picks).not.toContain("BIG");
    expect(picks).toEqual(["MID", "SMALL"]);
  });

  it("stays off the human's picks, however they were typed", () => {
    const picks = chooseAiPicks(field, { skill: compounder, random: alwaysTop, exclude: ["aaa", "BBB"] });

    expect(picks).not.toContain("AAA");
    expect(picks).not.toContain("BBB");
    expect(picks).toHaveLength(HEAD_TO_HEAD_PICKS - 1);
  });

  it("still fields five when its own taste has filtered the board down to fewer", () => {
    // Every company up on the day, so the contrarian's eligibility rule matches nothing. Falling
    // back to the wider field beats fielding a short team or failing the match.
    const allUp = field.map((entry) => ({ ...entry, today: 5 }));
    const picks = chooseAiPicks(allUp, { skill: contrarian, random: alwaysTop });

    expect(picks).toHaveLength(HEAD_TO_HEAD_PICKS);
    expect(new Set(picks).size).toBe(HEAD_TO_HEAD_PICKS);
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
