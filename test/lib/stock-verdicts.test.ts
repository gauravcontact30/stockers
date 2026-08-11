import {
  clearStockVerdictCache,
  explainVerdict,
  momentumScore,
  stanceFor,
  streamVerdicts,
  verdictsFor,
  type VerdictFrame,
} from "../../app/lib/stock-verdicts";
import { getPerformanceSummaries } from "../../app/lib/stock-performance";

jest.mock("../../app/lib/stock-performance", () => ({
  getPerformanceSummaries: jest.fn(),
}));

const summaries = getPerformanceSummaries as jest.MockedFunction<typeof getPerformanceSummaries>;

/** A performance row with everything the score reads, overridable per test. */
function summary(symbol: string, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    name: symbol,
    assetType: "stock",
    capTier: "Large",
    currency: "INR",
    price: 100,
    previousClose: 99,
    change: 1,
    oneDay: 1,
    oneWeek: 2,
    oneMonth: 3,
    sixMonth: 5,
    oneYear: 6,
    live: true,
    asOf: "2026-08-11T09:00:00.000Z",
    source: "Yahoo Finance",
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof getPerformanceSummaries>>[number];
}

/** The model's reply, as OpenRouter would return it. */
function openRouterReply(rationales: { symbol: string; rationale: string }[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ rationales }) } }] }),
  };
}

async function collect(symbols: string[]): Promise<VerdictFrame[]> {
  const frames: VerdictFrame[] = [];
  for await (const frame of streamVerdicts(symbols)) frames.push(frame);
  return frames;
}

beforeEach(() => {
  clearStockVerdictCache();
  jest.clearAllMocks();
  delete process.env.OPENROUTER_API_KEY;
  summaries.mockImplementation(async (wanted: string[]) => wanted.map((symbol) => summary(symbol)));
});

describe("momentumScore", () => {
  it("scores a stock that went nowhere at the midpoint", () => {
    expect(momentumScore({ oneWeek: 0, oneMonth: 0, sixMonth: 0, oneYear: 0 })).toBe(50);
  });

  it("scores a compounding stock above the midpoint and a falling one below", () => {
    expect(momentumScore({ oneWeek: 20, oneMonth: 20, sixMonth: 20, oneYear: 20 })).toBe(80);
    expect(momentumScore({ oneWeek: -20, oneMonth: -20, sixMonth: -20, oneYear: -20 })).toBe(20);
  });

  it("falls back to the midpoint when no period has a usable reading", () => {
    expect(momentumScore({ oneWeek: null, oneMonth: null, sixMonth: null, oneYear: null })).toBe(50);
    expect(momentumScore({ oneWeek: NaN, oneMonth: null, sixMonth: null, oneYear: null })).toBe(50);
  });

  // A missing period is skipped rather than counted as zero, so the periods that did report
  // decide the score between them instead of being dragged toward the midpoint.
  it("weighs only the periods that reported", () => {
    expect(momentumScore({ oneWeek: null, oneMonth: null, sixMonth: 20, oneYear: 20 })).toBe(80);
  });

  it("clamps the score to the 0-100 range", () => {
    expect(momentumScore({ oneWeek: 500, oneMonth: 500, sixMonth: 500, oneYear: 500 })).toBe(100);
    expect(momentumScore({ oneWeek: -500, oneMonth: -500, sixMonth: -500, oneYear: -500 })).toBe(0);
  });
});

describe("stanceFor", () => {
  it("splits the score into the three calls at its documented thresholds", () => {
    expect(stanceFor(62)).toBe("Buy");
    expect(stanceFor(100)).toBe("Buy");
    expect(stanceFor(61)).toBe("Hold");
    expect(stanceFor(42)).toBe("Hold");
    expect(stanceFor(41)).toBe("Sell");
    expect(stanceFor(0)).toBe("Sell");
  });
});

describe("explainVerdict", () => {
  it("names the trend, the sector and the three periods behind the call", () => {
    const text = explainVerdict(summary("TCS", { oneMonth: 3, sixMonth: 5, oneYear: 6 }), "Buy", "IT");
    expect(text).toBe("Momentum is with it within IT: +3.0% over a month, +5.0% over six months and +6.0% over a year.");
  });

  it("writes each stance in its own words and drops the sector when there is none", () => {
    expect(explainVerdict(summary("X"), "Sell", null)).toContain("The trend is against it:");
    expect(explainVerdict(summary("X"), "Hold", null)).toContain("It is holding its ground:");
  });

  it("says so rather than printing a number it does not have", () => {
    expect(explainVerdict(summary("X", { oneMonth: null }), "Hold", null)).toContain("no reading");
  });
});

describe("streamVerdicts", () => {
  it("sends the scored calls before the model has written anything", async () => {
    const frames = await collect(["TCS"]);

    // No key configured, so there is no second frame at all — the computed sentence stands.
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe("verdicts");
    const [frame] = frames;
    if (frame.type !== "verdicts") throw new Error("expected a verdicts frame");
    expect(frame.verdicts[0].symbol).toBe("TCS");
    expect(frame.verdicts[0].source).toBe("heuristic");
    expect(frame.verdicts[0].rationale).toContain("over a month");
  });

  it("follows the calls with the model's prose in a second frame", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn(async () =>
      openRouterReply([{ symbol: "TCS", rationale: "Deal wins are holding up billing." }]),
    ) as unknown as typeof fetch;

    const frames = await collect(["TCS"]);

    expect(frames.map((frame) => frame.type)).toEqual(["verdicts", "rationales"]);
    const [first, second] = frames;
    if (first.type !== "verdicts" || second.type !== "rationales") throw new Error("unexpected frames");
    // The first frame is the answer already; the second only improves how it reads.
    expect(first.verdicts[0].source).toBe("heuristic");
    expect(second.rationales).toEqual([{ symbol: "TCS", rationale: "Deal wins are holding up billing." }]);
  });

  it("normalises and de-duplicates the symbols it was asked for", async () => {
    await collect([" tcs ", "TCS", "", "infy"]);
    expect(summaries).toHaveBeenCalledWith(["TCS", "INFY"]);
  });

  it("yields nothing when there are no symbols to score", async () => {
    expect(await collect([])).toEqual([]);
    expect(await collect(["", "   "])).toEqual([]);
    expect(summaries).not.toHaveBeenCalled();
  });

  it("yields nothing when the performance feed knows none of the symbols", async () => {
    summaries.mockResolvedValue([]);
    expect(await collect(["NOSUCH"])).toEqual([]);
  });

  // A warm set is the whole point of caching it: one frame, no model call, no performance lookup.
  it("serves a finished set from cache in a single frame", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn(async () =>
      openRouterReply([{ symbol: "TCS", rationale: "Written once." }]),
    ) as unknown as typeof fetch;

    await collect(["TCS"]);
    const again = await collect(["TCS"]);

    expect(again).toHaveLength(1);
    if (again[0].type !== "verdicts") throw new Error("expected a verdicts frame");
    expect(again[0].verdicts[0].rationale).toBe("Written once.");
    expect(again[0].verdicts[0].source).toBe("ai");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(summaries).toHaveBeenCalledTimes(1);
  });

  it("drops the cached set when the AI tag is revalidated", async () => {
    await collect(["TCS"]);
    clearStockVerdictCache();
    await collect(["TCS"]);
    expect(summaries).toHaveBeenCalledTimes(2);
  });

  // Two readers opening the same section at once must not buy the same completion twice.
  it("makes a second reader wait on the first reader's model call", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    global.fetch = jest.fn(async () => {
      await gate;
      return openRouterReply([{ symbol: "TCS", rationale: "Bought once." }]);
    }) as unknown as typeof fetch;

    // Started back to back with no chance to settle in between: the slot is claimed before the
    // first caller's own performance lookup, so the second one is coalesced onto it regardless.
    const first = collect(["TCS"]);
    const second = collect(["TCS"]);
    release();

    const [, secondFrames] = await Promise.all([first, second]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(secondFrames).toHaveLength(1);
    if (secondFrames[0].type !== "verdicts") throw new Error("expected a verdicts frame");
    expect(secondFrames[0].verdicts[0].rationale).toBe("Bought once.");
  });

  it("leaves the computed sentences standing when the model fails", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;

    const frames = await collect(["TCS"]);

    expect(frames).toHaveLength(1);
    if (frames[0].type !== "verdicts") throw new Error("expected a verdicts frame");
    expect(frames[0].verdicts[0].source).toBe("heuristic");
  });

  it("ignores a reply that is not the shape it asked for", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    jest.spyOn(console, "error").mockImplementation(() => {});
    for (const content of ["no json here", '{"rationales":"not-a-list"}', '{"nothing":1}']) {
      clearStockVerdictCache();
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
      })) as unknown as typeof fetch;

      const frames = await collect(["TCS"]);
      expect(frames).toHaveLength(1);
    }
  });

  it("keeps only the rationales that name a symbol and carry text", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn(async () =>
      openRouterReply([
        { symbol: "TCS", rationale: "  Kept, and trimmed.  " },
        { symbol: "TCS", rationale: "   " },
        { symbol: 7, rationale: "no symbol" },
        { rationale: "missing symbol" },
      ] as unknown as { symbol: string; rationale: string }[]),
    ) as unknown as typeof fetch;

    const frames = await collect(["TCS"]);
    const last = frames[frames.length - 1];
    if (last.type !== "rationales") throw new Error("expected a rationales frame");
    expect(last.rationales).toEqual([{ symbol: "TCS", rationale: "Kept, and trimmed." }]);
  });

  // The model is handed the call and told not to contradict it; nothing it returns is allowed to
  // move the stance or the score, only the sentence under them.
  it("never lets the model change a call", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    summaries.mockResolvedValue([summary("TCS", { oneWeek: -30, oneMonth: -30, sixMonth: -30, oneYear: -30 })]);
    global.fetch = jest.fn(async () =>
      openRouterReply([{ symbol: "TCS", rationale: "A screaming buy." }]),
    ) as unknown as typeof fetch;

    const verdicts = await verdictsFor(["TCS"]);

    expect(verdicts[0].stance).toBe("Sell");
    expect(verdicts[0].score).toBe(5);
    expect(verdicts[0].rationale).toBe("A screaming buy.");
  });
});

describe("verdictsFor", () => {
  it("returns the scored calls with the model's prose merged in", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn(async () =>
      openRouterReply([{ symbol: "TCS", rationale: "Written by the model." }]),
    ) as unknown as typeof fetch;

    const verdicts = await verdictsFor(["TCS", "INFY"]);

    expect(verdicts.map((verdict) => verdict.symbol)).toEqual(["TCS", "INFY"]);
    expect(verdicts[0]).toMatchObject({ rationale: "Written by the model.", source: "ai" });
    // INFY got no rationale back, so it keeps the sentence built from its own numbers.
    expect(verdicts[1].source).toBe("heuristic");
  });

  it("returns nothing for an empty request", async () => {
    expect(await verdictsFor([])).toEqual([]);
  });

  it("falls back to the computed sentences with no key configured", async () => {
    const verdicts = await verdictsFor(["TCS"]);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].source).toBe("heuristic");
  });

  it("carries the catalogue's sector and cap tier onto the verdict", async () => {
    summaries.mockResolvedValue([summary("TCS", { capTier: null })]);
    const [verdict] = await verdictsFor(["TCS"]);
    expect(verdict.sector).toBe("Information Technology");
    expect(verdict.capTier).toBe("Large");
  });

  it("falls back to the symbol when the feed carries no name", async () => {
    summaries.mockResolvedValue([summary("NOSUCHTICKER", { name: null })]);
    const [verdict] = await verdictsFor(["NOSUCHTICKER"]);
    expect(verdict.name).toBe("NOSUCHTICKER");
    expect(verdict.sector).toBeNull();
  });
});
