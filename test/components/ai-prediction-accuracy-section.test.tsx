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
    expect(await screen.findByText("10% accurate")).toBeInTheDocument();

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

  it("scores today's locked picks against today's live top ten in the three cards", async () => {
    render(<AiPredictionAccuracySection />);

    // Lock status: how much of the ten-slot list is locked and held.
    expect(await screen.findByLabelText("Lock integrity: 20%")).toBeInTheDocument();
    expect(screen.getByText("Locked for today")).toBeInTheDocument();
    expect(screen.getByText("2/10 locked Large cap stocks for 2026-08-16")).toBeInTheDocument();

    // Prediction engine: was the stated confidence honest about what it delivered?
    expect(screen.getByLabelText("Confidence calibration: 73%")).toBeInTheDocument();
    expect(screen.getByText("Claimed 77% confidence, delivered 50%")).toBeInTheDocument();
    expect(screen.getByText("AI picks +1.50% vs market +6.50%")).toBeInTheDocument();

    // Accuracy check: the blended score, from the two boards below it.
    expect(screen.getByLabelText("AI intelligence: 54%")).toBeInTheDocument();
    expect(screen.getByText("1/10 in today's live top 10")).toBeInTheDocument();
    expect(screen.getByText("Rank accuracy 89% · 0/10 picks beat the Large cap average")).toBeInTheDocument();
    expect(screen.getByText("Edge -5.00% vs the live Large cap top 10")).toBeInTheDocument();
  });

  it("splits the comparison into an AI panel and a live-market panel", async () => {
    render(<AiPredictionAccuracySection />);

    const ai = await screen.findByRole("region", { name: "AI locked picks" });
    const market = screen.getByRole("region", { name: "Live BSE market" });

    // The AI's own claim, on its own side.
    expect(within(ai).getByText("54%")).toBeInTheDocument();
    expect(within(ai).getByText("Stated confidence")).toBeInTheDocument();
    expect(within(ai).getByText("77%")).toBeInTheDocument();
    expect(within(ai).getByText("+1.50%")).toBeInTheDocument();
    expect(within(ai).getByText("1 of 10 in the live top 10")).toBeInTheDocument();
    expect(within(ai).getByText("AAA")).toBeInTheDocument();

    // What the exchange actually did, on the other.
    expect(within(market).getByText("Live session")).toBeInTheDocument();
    expect(within(market).getAllByText("+6.50%").length).toBeGreaterThan(0);
    expect(within(market).getByText("CCC")).toBeInTheDocument();
    expect(within(market).getByText("Live")).toBeInTheDocument();
    // The two sides do not repeat each other's figures.
    expect(within(market).queryByText("Stated confidence")).not.toBeInTheDocument();
  });

  it("keeps only comparison figures in the verdict strip, with a score per cap tier", async () => {
    render(<AiPredictionAccuracySection />);

    const verdict = await screen.findByRole("region", { name: "AI versus market verdict" });

    expect(within(verdict).getByText("Edge vs market")).toBeInTheDocument();
    expect(within(verdict).getByText("-5.00%")).toBeInTheDocument();
    expect(within(verdict).getByText("Picks in live top 10")).toBeInTheDocument();
    expect(within(verdict).getByText("Confidence calibration")).toBeInTheDocument();
    expect(within(verdict).getByText("73%")).toBeInTheDocument();
    expect(within(verdict).getByText("Large 54%")).toBeInTheDocument();
    expect(within(verdict).getByText("Mid 0%")).toBeInTheDocument();
    expect(within(verdict).getByText("All 54%")).toBeInTheDocument();
  });

  it("moves the scoreboard to the cap tier the reader selected", async () => {
    render(<AiPredictionAccuracySection />);

    await screen.findByRole("region", { name: "AI locked picks" });
    fireEvent.change(screen.getByLabelText("AI locked picks before open cap filter"), { target: { value: "Small" } });

    expect(screen.getByText("Small cap - AI side")).toBeInTheDocument();
    expect(screen.getByText("Small cap - market side")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "AI versus market verdict" })).toHaveTextContent("AI versus market, small cap");
  });

  it("moves both boards and the cards together when either cap filter changes", async () => {
    render(<AiPredictionAccuracySection />);

    const predictedFilter = await screen.findByLabelText("AI locked picks before open cap filter");
    const actualFilter = screen.getByLabelText("Actual top performers live today cap filter");

    fireEvent.change(predictedFilter, { target: { value: "Small" } });
    expect(predictedFilter).toHaveValue("Small");
    expect(actualFilter).toHaveValue("Small");
    expect(screen.getByText("Edge +0.00% vs the live Small cap top 10")).toBeInTheDocument();

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
    expect(screen.getByText("No real 8:50 AM IST AI lock exists for this trading date")).toBeInTheDocument();
    expect(screen.getByText("No locked AI prediction was generated at 8:50 AM IST for 2026-08-16.")).toBeInTheDocument();
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

    expect(await screen.findByText("Holding 2026-08-16 picks")).toBeInTheDocument();
    expect(screen.getByText(held.message)).toBeInTheDocument();
    expect(screen.getByText(/Next AI lock: 8:50 am IST/i)).toBeInTheDocument();
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
