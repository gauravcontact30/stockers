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
  cutoffAt: "2026-08-16T09:15:00+05:30",
  marketCloseAt: "2026-08-16T15:30:00+05:30",
  generatedAt: "2026-08-16T03:00:00.000Z",
  source: "ai",
  model: "test/model",
  message: "AI picks were locked before the 9:15 AM IST market open and will not be recalculated today.",
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
    expect(screen.getByText("10% score")).toBeInTheDocument();
    expect(screen.getByText("1/10 locked AI picks matched real movers")).toBeInTheDocument();
    expect(screen.getAllByTestId("logo-AAA")[0]).toHaveAttribute("data-src", "");
  });

  it("does not substitute dummy stocks when no pre-open prediction exists", async () => {
    const missing = {
      ...payload,
      status: "not-generated" as const,
      predictions: [],
      generatedAt: null,
      source: null,
      model: null,
      message: "No locked AI prediction was generated before 9:15 AM IST for 2026-08-16.",
      predictionsByCap: { Large: [], Mid: [], Small: [] },
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(missing) })) as unknown as typeof fetch;

    render(<AiPredictionAccuracySection />);

    await waitFor(() => expect(screen.getAllByText("No locked prediction today")).toHaveLength(1));
    expect(screen.getByText("No real pre-open AI lock exists for this trading date")).toBeInTheDocument();
    expect(screen.getByText("No locked AI prediction was generated before 9:15 AM IST for 2026-08-16.")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("TATAPOWER")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Actual top performers live today" })).toBeInTheDocument();
    expect(screen.getByText("CCC")).toBeInTheDocument();
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
