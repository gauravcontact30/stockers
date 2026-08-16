import {
  calculateAccuracy,
  getBseAiPredictionAccuracy,
  isBeforePredictionCutoff,
  predictionCutoffAt,
  tradingDayKey,
} from "../../app/lib/bse-ai-prediction-accuracy";
import { readJsonCache, writeJsonCache } from "../../app/lib/data-cache";
import { getBseMovers, getBseRows } from "../../app/lib/bse-market";
import { getMarketNews } from "../../app/lib/market-news";
import { getQuotesFor } from "../../app/lib/market-data";
import { chatJson } from "../../app/lib/openrouter";
import { findStock } from "../../app/lib/stock-search";

jest.mock("../../app/lib/data-cache", () => ({
  readJsonCache: jest.fn(),
  writeJsonCache: jest.fn(),
}));

jest.mock("../../app/lib/bse-market", () => ({
  getBseMovers: jest.fn(),
  getBseRows: jest.fn(),
}));

jest.mock("../../app/lib/market-news", () => ({
  getMarketNews: jest.fn(),
}));

jest.mock("../../app/lib/market-data", () => ({
  getQuotesFor: jest.fn(),
}));

jest.mock("../../app/lib/openrouter", () => ({
  aiModel: () => "test/model",
  chatJson: jest.fn(),
  extractJsonObject: (text: string) => JSON.parse(text),
}));

jest.mock("../../app/lib/stock-search", () => ({
  findStock: jest.fn(),
}));

const read = readJsonCache as jest.MockedFunction<typeof readJsonCache>;
const write = writeJsonCache as jest.MockedFunction<typeof writeJsonCache>;
const rows = getBseRows as jest.MockedFunction<typeof getBseRows>;
const movers = getBseMovers as jest.MockedFunction<typeof getBseMovers>;
const news = getMarketNews as jest.MockedFunction<typeof getMarketNews>;
const quotes = getQuotesFor as jest.MockedFunction<typeof getQuotesFor>;
const ai = chatJson as jest.MockedFunction<typeof chatJson>;
const find = findStock as jest.MockedFunction<typeof findStock>;

type TestCapTier = "Large" | "Mid" | "Small";

function row(symbol: string, changePercent: number, code = symbol, capTier: TestCapTier = "Large") {
  return {
    code,
    ticker: symbol,
    name: `${symbol} Ltd`,
    group: "A",
    isin: `INE${symbol}`,
    marketCapCr: 1000,
    capTier,
    rank: 1,
    url: "",
    price: 100 + changePercent,
    previousClose: 100,
    change: changePercent,
    changePercent,
    open: 100,
    dayHigh: 105,
    dayLow: 98,
    volume: 1000,
    turnoverCr: 2,
    trades: 100,
  };
}

const bseRows = [
  ...Array.from({ length: 12 }, (_, index) => row(`L${index + 1}`, 30 - index, `50${index}`, "Large")),
  ...Array.from({ length: 12 }, (_, index) => row(`M${index + 1}`, 20 - index, `51${index}`, "Mid")),
  ...Array.from({ length: 12 }, (_, index) => row(`S${index + 1}`, 10 - index, `52${index}`, "Small")),
];

function serveMarket() {
  rows.mockResolvedValue({ rows: bseRows, sessionDate: "2026-08-14" });
  movers.mockImplementation(async (query) => {
    const tier = query.tier === "mid" ? "Mid" : query.tier === "small" ? "Small" : "Large";
    const pageSize = query.pageSize ?? 10;
    const tierRows = bseRows.filter((entry) => entry.capTier === tier).slice(0, pageSize);
    return {
    rows: tierRows.map((entry) => ({ ...entry, sector: null, industry: null, returnPercent: entry.changePercent })),
    period: "1d",
    periodFrom: "2026-08-14",
    total: tierRows.length,
    page: 1,
    pageSize,
    pages: 1,
    sessionDate: "2026-08-14",
    };
  });
}

function lockedPicksFor(prefix: string, capTier: TestCapTier) {
  return Array.from({ length: 10 }, (_, index) => ({
    symbol: `${prefix}${index + 1}`,
    stockName: `${prefix}${index + 1} Ltd`,
    bseCode: `5${index}`,
    sector: "Capital Goods",
    capTier,
    confidence: 80,
    reason: "Positive pre-open signals.",
    positiveNewsSignals: ["order win"],
    sources: [],
  }));
}

function lockedCacheFor(date: string) {
  return {
    date,
    generatedAt: `${date}T03:00:00.000Z`,
    cutoffAt: `${date}T09:15:00+05:30`,
    source: "ai" as const,
    model: "test/model",
    picksByCap: {
      Large: lockedPicksFor("L", "Large"),
      Mid: lockedPicksFor("M", "Mid"),
      Small: lockedPicksFor("S", "Small"),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(null);
  write.mockResolvedValue("runtime");
  news.mockResolvedValue({
    scope: "Indian markets",
    items: [
      {
        id: "news-aaa",
        title: "AAA shares jump after order win",
        summary: "",
        source: "Publisher",
        url: "https://example.com/aaa",
        publishedAt: "2026-08-16T02:00:00.000Z",
        sentiment: "Positive",
        symbol: "AAA",
        company: "AAA Ltd",
      },
    ],
    fetchedAt: "2026-08-16T02:00:00.000Z",
    source: "google-news",
    classifier: "heuristic",
  });
  find.mockImplementation((symbol) => ({
    symbol: symbol.toUpperCase(),
    name: `${symbol.toUpperCase()} Ltd`,
    sector: "Capital Goods",
    capTier: "Large",
    scripCode: "500000",
    curated: true,
  }));
  ai.mockResolvedValue(null);
  quotes.mockResolvedValue([]);
  serveMarket();
});

describe("IST cutoff", () => {
  it("uses the India trading day and the 9:15 AM IST cutoff", () => {
    expect(tradingDayKey(new Date("2026-08-15T19:00:00.000Z"))).toBe("2026-08-16");
    expect(predictionCutoffAt("2026-08-16")).toBe("2026-08-16T09:15:00+05:30");
    expect(isBeforePredictionCutoff(new Date("2026-08-16T03:44:00.000Z"))).toBe(true);
    expect(isBeforePredictionCutoff(new Date("2026-08-16T03:45:00.000Z"))).toBe(false);
  });
});

describe("calculateAccuracy", () => {
  it("matches by ticker or BSE code and reports rank difference", () => {
    const result = calculateAccuracy(
      [
        { symbol: "AAA", bseCode: "500001", rank: 1 },
        { symbol: "BBB", bseCode: "500002", rank: 2 },
        { symbol: "CCC", bseCode: "500003", rank: 3 },
      ],
      [
        { symbol: "ZZZ", bseCode: "500003", rank: 1 },
        { symbol: "AAA", bseCode: "500001", rank: 2 },
      ],
    );

    expect(result.summary).toEqual({ matched: 2, total: 10, percent: 20 });
    expect(result.rows).toEqual([
      { matchedActualRank: 2, rankDifference: -1 },
      { matchedActualRank: null, rankDifference: null },
      { matchedActualRank: 1, rankDifference: 2 },
    ]);
  });
});

describe("getBseAiPredictionAccuracy", () => {
  it("does not create a new prediction after the cutoff if none was locked", async () => {
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T04:00:00.000Z"));

    expect(report.status).toBe("not-generated");
    expect(report.predictions).toEqual([]);
    expect(report.actualTopByCap.Large).toHaveLength(10);
    expect(report.actualTopByCap.Mid).toHaveLength(10);
    expect(report.actualTopByCap.Small).toHaveLength(10);
    expect(report.actualTop).toHaveLength(10);
    expect(report.actualTop[0].priceSource).toBe("BSE Bhavcopy");
    expect(write).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
  });

  it("generates and stores a locked prediction before the cutoff", async () => {
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T03:30:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.source).toBe("heuristic");
    expect(report.predictionsByCap.Large).toHaveLength(10);
    expect(report.predictionsByCap.Mid).toHaveLength(10);
    expect(report.predictionsByCap.Small).toHaveLength(10);
    expect(report.predictions[0].symbol).toBe("AAA");
    expect(report.predictions[0].live).toBe(false);
    expect(write).toHaveBeenCalledWith(
      "bse-ai-locked-picks.json",
      expect.objectContaining({
        date: "2026-08-16",
        cutoffAt: "2026-08-16T09:15:00+05:30",
        picksByCap: expect.objectContaining({
          Large: expect.any(Array),
          Mid: expect.any(Array),
          Small: expect.any(Array),
        }),
      }),
    );
  });

  it("uses an existing daily lock instead of recalculating it", async () => {
    const picksFor = (prefix: string, capTier: TestCapTier) =>
      Array.from({ length: 10 }, (_, index) => ({
        symbol: `${prefix}${index + 1}`,
        stockName: `${prefix}${index + 1} Ltd`,
        bseCode: `5${index}`,
        sector: "Capital Goods",
        capTier,
        confidence: 80,
        reason: "Positive pre-open signals.",
        positiveNewsSignals: ["order win"],
        sources: [],
      }));
    read.mockResolvedValue({
      date: "2026-08-16",
      generatedAt: "2026-08-16T03:00:00.000Z",
      cutoffAt: "2026-08-16T09:15:00+05:30",
      source: "ai",
      model: "test/model",
      picksByCap: { Large: picksFor("L", "Large"), Mid: picksFor("M", "Mid"), Small: picksFor("S", "Small") },
    });

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T04:00:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.source).toBe("ai");
    expect(report.accuracy.matched).toBe(30);
    expect(write).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
  });

  it("persists the completed market status after 3:30 PM IST", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-16") : null));

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T10:01:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.persistedSession).toBe(true);
    expect(report.persistedAt).toBe("2026-08-16T10:01:00.000Z");
    expect(report.message).toContain("persisted 3:30 PM IST accuracy snapshot");
    expect(write).toHaveBeenCalledWith(
      "bse-ai-prediction-accuracy-session.json",
      expect.objectContaining({
        date: "2026-08-16",
        persistedSession: true,
        persistedAt: "2026-08-16T10:01:00.000Z",
        actualTopByCap: expect.objectContaining({
          Large: expect.any(Array),
          Mid: expect.any(Array),
          Small: expect.any(Array),
        }),
      }),
    );
  });

  it("serves the last market-close snapshot until the next session has a new lock", async () => {
    const snapshot = {
      status: "locked" as const,
      date: "2026-08-16",
      cutoffAt: "2026-08-16T09:15:00+05:30",
      marketCloseAt: "2026-08-16T15:30:00+05:30",
      generatedAt: "2026-08-16T03:00:00.000Z",
      source: "ai" as const,
      model: "test/model",
      message: "Stored close snapshot.",
      predictionsByCap: { Large: [], Mid: [], Small: [] },
      actualTopByCap: { Large: [], Mid: [], Small: [] },
      accuracyByCap: {
        Large: { matched: 1, total: 10, percent: 10 },
        Mid: { matched: 2, total: 10, percent: 20 },
        Small: { matched: 0, total: 10, percent: 0 },
      },
      predictions: [],
      actualTop: [],
      accuracy: { matched: 3, total: 30, percent: 10 },
      sessionDate: "2026-08-16",
      asOf: "2026-08-16T10:01:00.000Z",
      persistedSession: true,
      persistedAt: "2026-08-16T10:01:00.000Z",
    };
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-prediction-accuracy-session.json" ? snapshot : null));

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T04:00:00.000Z"));

    expect(report.date).toBe("2026-08-16");
    expect(report.persistedSession).toBe(true);
    expect(report.accuracy).toEqual({ matched: 3, total: 30, percent: 10 });
    expect(report.message).toContain("until the next pre-open AI lock is generated");
    expect(movers).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("overlays live quote data on displayed predictions and actual performers", async () => {
    quotes.mockResolvedValue([
      {
        symbol: "L1",
        price: 120,
        previousClose: 100,
        change: 20,
        changePercent: 20,
        dayHigh: 121,
        dayLow: 99,
        volume: 5000,
        live: true,
        asOf: "2026-08-16T04:01:00.000Z",
      },
      {
        symbol: "L3",
        price: 116,
        previousClose: 100,
        change: 16,
        changePercent: 16,
        dayHigh: 117,
        dayLow: 98,
        volume: 3000,
        live: true,
        asOf: "2026-08-16T04:01:00.000Z",
      },
    ]);
    const picksFor = (prefix: string, capTier: TestCapTier) =>
      Array.from({ length: 10 }, (_, index) => ({
        symbol: `${prefix}${index + 1}`,
        stockName: `${prefix}${index + 1} Ltd`,
        bseCode: `5${index}`,
        sector: "Capital Goods",
        capTier,
        confidence: 80,
        reason: "Positive pre-open signals.",
        positiveNewsSignals: ["order win"],
        sources: [],
      }));
    read.mockResolvedValue({
      date: "2026-08-16",
      generatedAt: "2026-08-16T03:00:00.000Z",
      cutoffAt: "2026-08-16T09:15:00+05:30",
      source: "ai",
      model: "test/model",
      picksByCap: { Large: picksFor("L", "Large"), Mid: picksFor("M", "Mid"), Small: picksFor("S", "Small") },
    });

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T04:00:00.000Z"));

    expect(report.predictions[0]).toEqual(expect.objectContaining({ symbol: "L1", live: true, price: 120, changePercent: 20 }));
    expect(report.actualTop[0]).toEqual(expect.objectContaining({ symbol: "L1", live: true, priceSource: "Yahoo Finance live quote" }));
  });
});
