if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(public input: string) {}
  } as unknown as typeof Request;
}

jest.mock("../../app/lib/bse-market", () => ({
  getBseDirectory: jest.fn(async () => ({
    rows: [
      {
        code: "540611",
        ticker: "AUBANK",
        name: "AU Small Finance Bank Ltd",
        sector: "Financial Services",
        industry: "Financial Services",
        capTier: "Mid",
        group: "A",
        isin: "INE949L01017",
        rank: 150,
        marketCapCr: 66165.52,
        price: 890,
        previousClose: 880,
        change: 10,
        changePercent: 1.14,
        open: 881,
        dayHigh: 895,
        dayLow: 872,
        volume: 100000,
        turnoverCr: 89,
        trades: 12345,
      },
    ],
    sessionDate: "2026-08-11",
  })),
}));

jest.mock("../../app/lib/stock-detail", () => ({
  getStockDetail: jest.fn(async () => ({
    stock: {
      code: "540611",
      ticker: "AUBANK",
      name: "AU Small Finance Bank Ltd",
      sector: "Financial Services",
      industry: "Financial Services",
      capTier: "Mid",
      group: "A",
      isin: "INE949L01017",
      rank: 150,
      marketCapCr: 66165.52,
      price: 890,
      previousClose: 880,
      change: 10,
      changePercent: 1.14,
      open: 881,
      dayHigh: 895,
      dayLow: 872,
      volume: 100000,
      turnoverCr: 89,
      trades: 12345,
      returns: { "1w": 2, "1m": 3, "3m": 4, "6m": 5, "1y": 6, "3y": 7, "5y": 8, overall: 8 },
      measuredFrom: { "1w": "2026-08-04", "1m": "2026-07-11", "3m": "2026-05-11", "6m": "2026-02-11", "1y": "2025-08-11", "3y": "2023-08-11", "5y": "2021-08-11", overall: "2021-08-11" },
      trajectory: [],
    },
    peers: [
      {
        code: "500180",
        ticker: "HDFCBANK",
        name: "HDFC Bank Ltd",
        sector: "Financial Services",
        industry: "Financial Services",
        capTier: "Large",
        group: "A",
        isin: "INE040A01034",
        rank: 3,
        marketCapCr: 1500000,
        price: 2000,
        previousClose: 1990,
        change: 10,
        changePercent: 0.5,
        open: 1995,
        dayHigh: 2010,
        dayLow: 1980,
        volume: 1000000,
        turnoverCr: 200,
        trades: 22222,
        returns: { "1w": 1, "1m": 2, "3m": 3, "6m": 4, "1y": 9, "3y": 10, "5y": 11, overall: 11 },
        measuredFrom: { "1w": "2026-08-04", "1m": "2026-07-11", "3m": "2026-05-11", "6m": "2026-02-11", "1y": "2025-08-11", "3y": "2023-08-11", "5y": "2021-08-11", overall: "2021-08-11" },
        trajectory: [],
      },
    ],
    peerBasis: { category: "Financial Services", capTier: "Mid", period: "1y" },
    sessionDate: "2026-08-11",
    note: null,
  })),
}));

jest.mock("../../app/lib/stock-performance", () => ({
  getPerformanceSummaries: jest.fn(async (symbols: string[]) =>
    symbols.map((symbol) => ({
      symbol,
      name: symbol,
      assetType: "stock",
      capTier: "Mid",
      currency: "INR",
      price: 100,
      previousClose: 99,
      change: 1,
      oneDay: 1,
      oneWeek: 2,
      oneMonth: 3,
      threeMonth: 4,
      sixMonth: 5,
      oneYear: 6,
      threeYear: 7,
      fiveYear: 8,
      overall: symbol === "AUBANK" ? 256.7 : 120,
      overallSince: "2017-07-10",
      live: true,
      asOf: "2026-08-11T10:00:00.000Z",
      source: "test",
    })),
  ),
}));

describe("getBseStockAccuracy", () => {
  it("returns AU Bank with BSE identity, all performance windows, and competitor rank", async () => {
    const { getBseStockAccuracy } = require("../../app/lib/accuracy-matrix") as typeof import("../../app/lib/accuracy-matrix");
    const result = await getBseStockAccuracy("AUBANK");

    expect(result).toEqual(expect.objectContaining({ symbol: "AUBANK", scripCode: "540611", name: "AU Small Finance Bank Ltd" }));
    expect(result?.performance.map((item) => item.key)).toEqual(["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "Overall"]);
    expect(result?.performance.find((item) => item.key === "Overall")?.value).toBe(8);
    expect(result?.comparisonBasis).toEqual({ category: "Financial Services", capTier: "Mid", period: "1y", rank: 2, total: 2 });
    expect(result?.comparison[0]).toEqual(expect.objectContaining({ symbol: "AUBANK", isTarget: true, price: 890 }));
    expect(result?.matrixAccuracy).toBe(100);
    expect(result?.checks).toEqual([
      expect.objectContaining({ label: "BSE identity", ok: true, source: "BSE ListofScripData" }),
      expect.objectContaining({ label: "Official session tape", ok: true, source: "BSE Bhavcopy" }),
      expect.objectContaining({ label: "Session stats", ok: true, source: "BSE Bhavcopy + ListofScripData" }),
      expect.objectContaining({ label: "Performance windows", ok: true }),
      expect.objectContaining({ label: "Peer rank", ok: true }),
    ]);
  });
});
