import { render, screen, waitFor, within } from "@testing-library/react";
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

const aiPick = stock({
  symbol: "AAA",
  stockName: "AAA Ltd",
  rank: 1,
  confidence: 84,
  reason: "Positive order win coverage before the open.",
  positiveNewsSignals: ["AAA shares jump after order win"],
  matchedActualRank: 2,
  rankDifference: -1,
  changePercent: 1,
});

const marketLeader = stock({ symbol: "CCC", stockName: "CCC Ltd", rank: 1, changePercent: 11 });

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
  predictions: [aiPick],
  actualTop: [marketLeader, stock({ symbol: "AAA", stockName: "AAA Ltd", rank: 2 })],
  predictionsByCap: { Large: [aiPick], Mid: [], Small: [] },
  actualTopByCap: { Large: [marketLeader, stock({ symbol: "AAA", stockName: "AAA Ltd", rank: 2 })], Mid: [], Small: [] },
};

function serve(data: BseAiPredictionAccuracy = payload) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })) as unknown as typeof fetch;
}

beforeEach(() => {
  serve();
});

describe("AiPredictionAccuracySection", () => {
  it("renders only the toughest AI pick versus live market fight", async () => {
    render(<AiPredictionAccuracySection />);

    expect(screen.getByText("Toughest AI prediction versus the live BSE session")).toBeInTheDocument();
    expect(await screen.findByText("1 of 10 picks landed")).toBeInTheDocument();

    const fight = screen.getByRole("region", { name: "Toughest AI versus live market fight" });
    expect(within(fight).getByText("AAA")).toBeInTheDocument();
    expect(within(fight).getByText("84% confidence")).toBeInTheDocument();
    expect(within(fight).getByText("CCC")).toBeInTheDocument();
    expect(within(fight).getAllByText("Live price").length).toBeGreaterThan(0);
    expect(within(fight).getAllByText("Volume").length).toBeGreaterThan(0);
    expect(within(fight).getAllByText("Turnover").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "AI locked picks before open" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Actual top performers live today" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("logo-AAA")[0]).toHaveAttribute("data-src", "");
  });

  it("answers the toughest live fight in words", async () => {
    render(<AiPredictionAccuracySection />);

    const fight = await screen.findByRole("region", { name: "Toughest AI versus live market fight" });
    expect(within(fight).getByText("Live market leader leads the AI pick by 10.00 points")).toBeInTheDocument();
    expect(within(fight).getByText("AI prediction")).toBeInTheDocument();
    expect(within(fight).getByText("Live market")).toBeInTheDocument();
    expect(within(fight).getByText("+1.00%")).toBeInTheDocument();
    expect(within(fight).getByText("+11.00%")).toBeInTheDocument();
    expect(fight).toHaveTextContent("Large cap");
    expect(fight).toHaveTextContent("Live session");
  });

  it("says so plainly when the AI pick is the one ahead", async () => {
    const aiAhead = stock({ ...aiPick, changePercent: 14 });
    serve({ ...payload, predictions: [aiAhead], predictionsByCap: { ...payload.predictionsByCap, Large: [aiAhead] } });

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("AI pick leads the live leader by 3.00 points")).toBeInTheDocument();
  });

  it("calls a dead heat a dead heat rather than a win by nothing", async () => {
    const level = stock({ ...aiPick, changePercent: 11 });
    serve({ ...payload, predictions: [level], predictionsByCap: { ...payload.predictionsByCap, Large: [level] } });

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText("The toughest live fight is level")).toBeInTheDocument();
  });

  it("names the fallback ranking when no model picked the list", async () => {
    serve({ ...payload, source: "heuristic", model: null });

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText(/Picked by the fallback ranking\./)).toBeInTheDocument();
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
    serve(missing);

    render(<AiPredictionAccuracySection />);

    await waitFor(() => expect(screen.getAllByText("No locked prediction today")).toHaveLength(1));
    expect(screen.getByText(missing.message)).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("TATAPOWER")).not.toBeInTheDocument();
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
    serve(held);

    render(<AiPredictionAccuracySection />);

    expect(await screen.findByText(held.message)).toBeInTheDocument();
  });
});
