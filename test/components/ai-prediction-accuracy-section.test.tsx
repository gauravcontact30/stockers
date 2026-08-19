import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AiPredictionAccuracySection } from "../../app/components/ai-prediction-accuracy-section";
import type { BseAiPredictionAccuracy, PredictionPerformance } from "../../app/lib/bse-ai-prediction-accuracy";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol, src }: { symbol: string; src?: string }) => <span data-src={src ?? ""} data-testid={`logo-${symbol}`} />,
}));

function stock(overrides: Partial<PredictionPerformance> & Pick<PredictionPerformance, "symbol" | "stockName" | "rank">): PredictionPerformance {
  const rank = overrides.rank;
  return {
    symbol: overrides.symbol,
    stockName: overrides.stockName,
    bseCode: overrides.bseCode ?? `50000${rank}`,
    sector: overrides.sector ?? "financials",
    capTier: Object.prototype.hasOwnProperty.call(overrides, "capTier") ? overrides.capTier ?? null : "Large",
    rank,
    price: overrides.price ?? 100 + rank,
    previousClose: overrides.previousClose ?? 100,
    change: overrides.change ?? rank,
    changePercent: overrides.changePercent ?? rank,
    dayHigh: overrides.dayHigh ?? 105,
    dayLow: overrides.dayLow ?? 99,
    volume: overrides.volume ?? 1200,
    turnoverCr: overrides.turnoverCr ?? 3,
    live: overrides.live ?? true,
    asOf: overrides.asOf ?? "2026-08-16T04:00:00.000Z",
    priceSource: overrides.priceSource ?? "Yahoo Finance live quote",
    confidence: overrides.confidence,
    reason: overrides.reason,
    positiveNewsSignals: overrides.positiveNewsSignals,
    sources: overrides.sources,
    matchedActualRank: overrides.matchedActualRank ?? null,
    rankDifference: overrides.rankDifference ?? null,
  };
}

const payload: BseAiPredictionAccuracy = {
  status: "locked",
  date: "2026-08-16",
  lockDate: "2026-08-16",
  lockAt: "2026-08-16T08:50:00+05:30",
  nextLockAt: "2026-08-17T08:50:00+05:30",
  holdover: false,
  cutoffAt: "2026-08-16T09:15:00+05:30",
  marketCloseAt: "2026-08-16T15:30:00+05:30",
  generatedAt: "2026-08-16T03:00:00.000Z",
  source: "ai",
  model: "test/model",
  message: "AI picks were locked at 8:50 AM IST, before the 9:15 AM market open, and will not be recalculated today.",
  accuracy: { matched: 1, total: 10, percent: 10 },
  accuracyByCap: {
    Large: { matched: 1, total: 10, percent: 10 },
    Mid: { matched: 0, total: 10, percent: 0 },
    Small: { matched: 0, total: 10, percent: 0 },
  },
  sessionDate: "2026-08-16",
  asOf: "2026-08-16T04:00:00.000Z",
  persistedSession: false,
  persistedAt: null,
  marketSession: "live",
  scorecard: {
    byCap: {
      Large: {
        hitCount: 1,
        hitRate: 50,
        rankAccuracy: 89,
        avgPickMovePercent: 1.5,
        avgMarketMovePercent: 6.5,
        edgePercent: -5,
        beatMarketCount: 0,
        avgConfidence: 77,
        confidenceCalibration: 73,
        lockIntegrity: 20,
        intelligenceScore: 54,
      },
      Mid: {
        hitCount: 0,
        hitRate: 0,
        rankAccuracy: 0,
        avgPickMovePercent: 0,
        avgMarketMovePercent: 0,
        edgePercent: 0,
        beatMarketCount: 0,
        avgConfidence: 0,
        confidenceCalibration: 0,
        lockIntegrity: 0,
        intelligenceScore: 0,
      },
      Small: {
        hitCount: 0,
        hitRate: 0,
        rankAccuracy: 0,
        avgPickMovePercent: 0,
        avgMarketMovePercent: 0,
        edgePercent: 0,
        beatMarketCount: 0,
        avgConfidence: 0,
        confidenceCalibration: 0,
        lockIntegrity: 0,
        intelligenceScore: 0,
      },
    },
    overall: {
      hitCount: 1,
      hitRate: 50,
      rankAccuracy: 89,
      avgPickMovePercent: 1.5,
      avgMarketMovePercent: 6.5,
      edgePercent: -5,
      beatMarketCount: 0,
      avgConfidence: 77,
      confidenceCalibration: 73,
      lockIntegrity: 7,
      intelligenceScore: 54,
    },
  },
  predictions: [
    stock({
      symbol: "AAA",
      stockName: "AAA Ltd",
      rank: 1,
      confidence: 84,
      reason: "Positive order win coverage before the open.",
      positiveNewsSignals: ["AAA shares jump after order win"],
      matchedActualRank: 2,
      rankDifference: -1,
    }),
    stock({ symbol: "BBB", stockName: "BBB Ltd", rank: 2, confidence: 70, live: false, asOf: null, priceSource: "BSE Bhavcopy" }),
  ],
  actualTop: [stock({ symbol: "CCC", stockName: "CCC Ltd", rank: 1, changePercent: 11 }), stock({ symbol: "AAA", stockName: "AAA Ltd", rank: 2 })],
  predictionsByCap: {
    Large: [
      stock({
        symbol: "AAA",
        stockName: "AAA Ltd",
        rank: 1,
        confidence: 84,
        reason: "Positive order win coverage before the open.",
        positiveNewsSignals: ["AAA shares jump after order win"],
        matchedActualRank: 2,
        rankDifference: -1,
      }),
      stock({ symbol: "BBB", stockName: "BBB Ltd", rank: 2, confidence: 70, live: false, asOf: null, priceSource: "BSE Bhavcopy" }),
    ],
    Mid: [],
    Small: [],
  },
  actualTopByCap: {
    Large: [stock({ symbol: "CCC", stockName: "CCC Ltd", rank: 1, changePercent: 11 }), stock({ symbol: "AAA", stockName: "AAA Ltd", rank: 2 })],
    Mid: [],
    Small: [],
  },
};

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })) as unknown as typeof fetch;
});

describe("AiPredictionAccuracySection", () => {
  it("renders locked AI picks beside the actual live top performers", async () => {
    render(<AiPredictionAccuracySection />);

    expect(screen.getByText("Locked AI picks versus real BSE top performers")).toBeInTheDocument();
    expect(await screen.findByText("1 of 10 picks landed")).toBeInTheDocument();

    const predicted = screen.getByRole("region", { name: "AI locked picks before open" });
    const actual = screen.getByRole("region", { name: "Actual top performers live today" });

    expect(within(predicted).getByText("AAA")).toBeInTheDocument();
    expect(within(predicted).getByText("84%")).toBeInTheDocument();
    expect(within(predicted).getByText("Actual rank #2")).toBeInTheDocument();
    expect(within(predicted).getByText("Live price")).toBeInTheDocument();
    expect(within(predicted).getAllByText("Low / high").length).toBeGreaterThan(0);
    expect(within(predicted).getAllByText("Volume").length).toBeGreaterThan(0);
    expect(within(predicted).getAllByText("Turnover").length).toBeGreaterThan(0);
    expect(within(actual).getByText("CCC")).toBeInTheDocument();
    expect(within(actual).getAllByText("Live price").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("logo-AAA")[0]).toHaveAttribute("data-src", "");
  });

  it("answers the one question the board exists for, in words", async () => {
    render(<AiPredictionAccuracySection />);

    const verdict = await screen.findByRole("region", { name: "AI versus market verdict" });

    // The AI's ten moved +1.50%, the market's ten +6.50%, so the market is 5 points ahead. The
    // reader is told that rather than being handed an "edge" to subtract for themselves.
    expect(within(verdict).getByText("The market is ahead by 5.00 points")).toBeInTheDocument();
    expect(within(verdict).getByText("The AI's 10 picks")).toBeInTheDocument();
    expect(within(verdict).getByText("+1.50%")).toBeInTheDocument();
    expect(within(verdict).getByText("The market's top 10")).toBeInTheDocument();
    expect(within(verdict).getByText("+6.50%")).toBeInTheDocument();
    expect(within(verdict).getByText(/Large cap · Live session/)).toBeInTheDocument();
  });

  it("says so plainly when the AI is the one ahead", async () => {
    const ahead = {
      ...payload,
      scorecard: {
        ...payload.scorecard,
        byCap: {
          ...payload.scorecard.byCap,
          Large: { ...payload.scorecard.byCap.Large, avgPickMovePercent: 6.5, avgMarketMovePercent: 1.5, edgePercent: 5 },
        },
      },
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(ahead) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("The AI is ahead by 5.00 points")).toBeInTheDocument();
  });

  it("calls a dead heat a dead heat rather than a win by nothing", async () => {
    const level = {
      ...payload,
      scorecard: {
        ...payload.scorecard,
        byCap: {
          ...payload.scorecard.byCap,
          Large: { ...payload.scorecard.byCap.Large, avgPickMovePercent: 2, avgMarketMovePercent: 2, edgePercent: 0 },
        },
      },
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(level) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("Too close to call")).toBeInTheDocument();
  });

  it("reduces the board to four plain answers and a per-tier count", async () => {
    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("Picks that landed")).toBeInTheDocument();
    expect(screen.getByText("1 of 10")).toBeInTheDocument();
    expect(screen.getByText("In today's real large cap top 10.")).toBeInTheDocument();

    // The AI's best of its two, and the market's best, named rather than scored.
    expect(screen.getByText("The AI's best pick")).toBeInTheDocument();
    expect(screen.getByText("The market's best")).toBeInTheDocument();
    expect(screen.getByText("Next list of 10")).toBeInTheDocument();
    expect(screen.getByText("All 10 stocks are replaced at that lock.")).toBeInTheDocument();

    // The per-tier strip, in the same units as the card above it: how many of the ten landed.
    expect(screen.getByText("Large 1/10")).toBeInTheDocument();
    expect(screen.getByText("Mid 0/10")).toBeInTheDocument();
    expect(screen.getByText("Small 0/10")).toBeInTheDocument();
    expect(screen.getByText(/Picked by test\/model\./)).toBeInTheDocument();
  });

  it("names the fallback ranking when no model picked the list", async () => {
    const fallback = { ...payload, source: "heuristic" as const, model: null };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(fallback) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText(/Picked by the fallback ranking\./)).toBeInTheDocument();
  });

  it("moves the scoreboard to the cap tier the reader selected", async () => {
    render(<AiPredictionAccuracySection />);

    await screen.findByRole("region", { name: "AI versus market verdict" });
    fireEvent.change(screen.getByLabelText("AI locked picks before open cap filter"), { target: { value: "Small" } });

    expect(screen.getByRole("region", { name: "AI versus market verdict" })).toHaveTextContent("Small cap");
    expect(screen.getByText("In today's real small cap top 10.")).toBeInTheDocument();
  });

  it("moves both boards and the cards together when either cap filter changes", async () => {
    render(<AiPredictionAccuracySection />);

    const predictedFilter = await screen.findByLabelText("AI locked picks before open cap filter");
    const actualFilter = screen.getByLabelText("Actual top performers live today cap filter");

    fireEvent.change(predictedFilter, { target: { value: "Small" } });
    expect(predictedFilter).toHaveValue("Small");
    expect(actualFilter).toHaveValue("Small");
    expect(screen.getByText("In today's real small cap top 10.")).toBeInTheDocument();

    fireEvent.change(actualFilter, { target: { value: "Mid" } });
    expect(predictedFilter).toHaveValue("Mid");
    expect(actualFilter).toHaveValue("Mid");
    expect(screen.getByText("No Mid cap row is present in the current real top performers feed.")).toBeInTheDocument();
  });

  it("describes the live board by where the BSE day actually stands", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ...payload, marketSession: "holiday" }) }),
    ) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("No BSE session today. Showing the last completed session's top 10 for this cap tier.")).toBeInTheDocument();
  });

  it("does not substitute dummy stocks when no pre-open prediction exists", async () => {
    const missing = {
      ...payload,
      status: "not-generated" as const,
      predictions: [],
      generatedAt: null,
      source: null,
      model: null,
      message: "No locked AI prediction was generated at 8:50 AM IST for 2026-08-16.",
      lockDate: null,
      lockAt: null,
      predictionsByCap: { Large: [], Mid: [], Small: [] },
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(missing) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    await waitFor(() => expect(screen.getAllByText("No locked prediction today")).toHaveLength(1));
    expect(screen.getByText("No locked AI prediction was generated at 8:50 AM IST for 2026-08-16.")).toBeInTheDocument();
    // Nothing is invented for the empty half: the card says there is no pick rather than showing one.
    expect(screen.getByText("No picks are locked for this tier.")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("TATAPOWER")).not.toBeInTheDocument();
    const actual = screen.getByRole("region", { name: "Actual top performers live today" });
    // The market board still has its real rows; only the AI half is empty.
    expect(within(actual).getByText("CCC")).toBeInTheDocument();
  });

  it("says the previous day's picks are being held until the next 8:50 AM lock", async () => {
    const held = {
      ...payload,
      date: "2026-08-17",
      lockDate: "2026-08-16",
      lockAt: "2026-08-16T08:50:00+05:30",
      nextLockAt: "2026-08-17T08:50:00+05:30",
      holdover: true,
      message: "Holding the 2026-08-16 locked picks. The AI replaces all 10 per cap tier at the next 8:50 AM IST lock, before the 9:15 AM open.",
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(held) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText(held.message)).toBeInTheDocument();
    expect(screen.getByText("Next list of 10")).toBeInTheDocument();
    expect(screen.getByText(/8:50 am, 17 Aug/i)).toBeInTheDocument();
  });

  it("filters, clears and paginates real top-ten rows from the API", async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      stock({
        symbol: `STK${index + 1}`,
        stockName: `Stock ${index + 1} Ltd`,
        rank: index + 1,
        confidence: 80 - index,
        sector: index === 1 ? "it" : "financials",
      }),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...payload,
            predictions: rows,
            actualTop: rows,
            predictionsByCap: { Large: rows, Mid: [], Small: [] },
            actualTopByCap: { Large: rows, Mid: [], Small: [] },
          }),
      }),
    ) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    const predicted = await screen.findByRole("region", { name: "AI locked picks before open" });
    expect(within(predicted).getByText("Showing 1-5 of 10 real rows")).toBeInTheDocument();
    expect(within(predicted).queryByText("STK6")).not.toBeInTheDocument();

    fireEvent.click(within(predicted).getByText("Next"));
    expect(within(predicted).getByText("STK6")).toBeInTheDocument();
    expect(within(predicted).getByText("Page 2/2")).toBeInTheDocument();

    fireEvent.change(within(predicted).getByLabelText("AI locked picks before open search filter"), { target: { value: "Stock 2" } });
    expect(within(predicted).getByText("STK2")).toBeInTheDocument();
    expect(within(predicted).getByText("Showing 1-1 of 1 real rows")).toBeInTheDocument();

    fireEvent.click(within(predicted).getByText("Clear filter"));
    expect(within(predicted).getByText("STK1")).toBeInTheDocument();
    expect(within(predicted).getByText("Showing 1-5 of 10 real rows")).toBeInTheDocument();
  });

  it("renders cap-grouped locked picks even when row-level cap metadata is missing", async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      stock({
        symbol: `LIVE${index + 1}`,
        stockName: `Live ${index + 1} Ltd`,
        rank: index + 1,
        confidence: 82 - index,
        capTier: null,
      }),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...payload,
            predictions: rows,
            predictionsByCap: { Large: rows, Mid: [], Small: [] },
          }),
      }),
    ) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    const predicted = await screen.findByRole("region", { name: "AI locked picks before open" });
    expect(within(predicted).getByText("LIVE1")).toBeInTheDocument();
    expect(within(predicted).getByText("Showing 1-5 of 10 real rows")).toBeInTheDocument();
  });
});
