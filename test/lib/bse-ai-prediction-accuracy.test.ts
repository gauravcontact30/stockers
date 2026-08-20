import type { PredictionPerformance } from "../../app/lib/bse-ai-prediction-accuracy";
import {
  calculateAccuracy,
  getBseAiPredictionAccuracy,
  marketSessionState,
  scoreCap,
  isBeforePredictionCutoff,
  isBeforePredictionLock,
  isTradingDay,
  nextPredictionLockAt,
  predictionCutoffAt,
  predictionLockAt,
  runDailyPredictionLock,
  tradingDayKey,
} from "../../app/lib/bse-ai-prediction-accuracy";
import { readJsonCache, writeJsonCache } from "../../app/lib/data-cache";
import { getBseMovers, getBseRows } from "../../app/lib/bse-market";
import { classifySentiment, fetchNewsQuery, getMarketNews, matchCompany } from "../../app/lib/market-news";
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
  fetchNewsQuery: jest.fn(),
  classifySentiment: jest.fn(() => "Neutral"),
  matchCompany: jest.fn(() => ({ symbol: null, company: null })),
}));

// The pre-open news pool is wrapped in the app's revalidating cache, which would otherwise hold
// one test's headlines for the ten minutes that follow — i.e. for every test after it in this
// file. Passed straight through, each call loads afresh, which is what these tests are asserting.
jest.mock("../../app/lib/cache", () => ({
  CACHE_TAGS: { bse: "bse", nse: "nse", ai: "ai", news: "news", quotes: "quotes" },
  revalidating: <T,>(options: { load: () => Promise<T> }) =>
    Object.assign(() => options.load(), { fresh: () => options.load(), peek: () => null }),
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
const newsQuery = fetchNewsQuery as jest.MockedFunction<typeof fetchNewsQuery>;
const classify = classifySentiment as jest.MockedFunction<typeof classifySentiment>;
const match = matchCompany as jest.MockedFunction<typeof matchCompany>;
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
  // `clearAllMocks` forgets calls but keeps implementations, so the per-test ones are re-set here.
  newsQuery.mockResolvedValue([]);
  classify.mockReturnValue("Neutral");
  match.mockReturnValue({ symbol: null, company: null });
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

  it("locks at 8:50 AM IST, 25 minutes before the open", () => {
    expect(predictionLockAt("2026-08-17")).toBe("2026-08-17T08:50:00+05:30");
    // 03:19 UTC is 8:49 IST; 03:20 UTC is 8:50 IST.
    expect(isBeforePredictionLock(new Date("2026-08-17T03:19:00.000Z"))).toBe(true);
    expect(isBeforePredictionLock(new Date("2026-08-17T03:20:00.000Z"))).toBe(false);
  });

  it("treats weekends and configured holidays as non-trading days", () => {
    expect(isTradingDay("2026-08-17")).toBe(true);
    expect(isTradingDay("2026-08-15")).toBe(false);
    expect(isTradingDay("2026-08-16")).toBe(false);

    process.env.BSE_MARKET_HOLIDAYS = "2026-08-17, 2026-08-18";
    expect(isTradingDay("2026-08-17")).toBe(false);
    expect(isTradingDay("2026-08-19")).toBe(true);
    delete process.env.BSE_MARKET_HOLIDAYS;
  });

  it("points at the next 8:50 AM IST lock, skipping the weekend", () => {
    // Monday, before the lock: today's own 8:50.
    expect(nextPredictionLockAt(new Date("2026-08-17T02:00:00.000Z"))).toBe("2026-08-17T08:50:00+05:30");
    // Monday, after the lock: tomorrow's.
    expect(nextPredictionLockAt(new Date("2026-08-17T05:00:00.000Z"))).toBe("2026-08-18T08:50:00+05:30");
    // Saturday: the following Monday.
    expect(nextPredictionLockAt(new Date("2026-08-15T05:00:00.000Z"))).toBe("2026-08-17T08:50:00+05:30");
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

describe("marketSessionState", () => {
  it("reports where the BSE day stands", () => {
    expect(marketSessionState(new Date("2026-08-16T05:00:00.000Z"))).toBe("holiday");
    expect(marketSessionState(new Date("2026-08-17T03:00:00.000Z"))).toBe("pre-open");
    expect(marketSessionState(new Date("2026-08-17T05:00:00.000Z"))).toBe("live");
    expect(marketSessionState(new Date("2026-08-17T10:05:00.000Z"))).toBe("closed");
  });
});

describe("scoreCap", () => {
  function perf(overrides: Partial<PredictionPerformance> & Pick<PredictionPerformance, "symbol" | "rank">): PredictionPerformance {
    return {
      stockName: `${overrides.symbol} Ltd`,
      bseCode: null,
      sector: "Capital Goods",
      capTier: "Large",
      price: 100,
      previousClose: 100,
      change: 0,
      changePercent: 0,
      dayHigh: 101,
      dayLow: 99,
      volume: 100,
      turnoverCr: 1,
      live: true,
      asOf: null,
      priceSource: "BSE Bhavcopy",
      matchedActualRank: null,
      rankDifference: null,
      ...overrides,
    };
  }

  it("scores hits, rank precision, edge and confidence honesty from today's two lists", () => {
    const predicted = [
      perf({ symbol: "AAA", rank: 1, changePercent: 9, confidence: 80, matchedActualRank: 1, rankDifference: 0 }),
      perf({ symbol: "BBB", rank: 2, changePercent: 5, confidence: 80, matchedActualRank: 3, rankDifference: -1 }),
      perf({ symbol: "CCC", rank: 3, changePercent: 1, confidence: 80 }),
      perf({ symbol: "DDD", rank: 4, changePercent: 1, confidence: 80 }),
    ];
    const actual = [
      perf({ symbol: "AAA", rank: 1, changePercent: 9 }),
      perf({ symbol: "ZZZ", rank: 2, changePercent: 6 }),
      perf({ symbol: "BBB", rank: 3, changePercent: 5 }),
      perf({ symbol: "YYY", rank: 4, changePercent: 4 }),
    ];

    const score = scoreCap(predicted, actual, 4);

    expect(score.hitCount).toBe(2);
    expect(score.hitRate).toBe(50);
    // One exact rank (100) and one out by a single place (67), averaged.
    expect(score.rankAccuracy).toBe(83);
    expect(score.avgPickMovePercent).toBe(4);
    expect(score.avgMarketMovePercent).toBe(6);
    expect(score.edgePercent).toBe(-2);
    expect(score.beatMarketCount).toBe(1);
    expect(score.avgConfidence).toBe(80);
    // Claimed 80%, delivered 50%: 30 points of over-confidence.
    expect(score.confidenceCalibration).toBe(70);
    expect(score.lockIntegrity).toBe(100);
    // 50 hit rate, 83 rank accuracy, 70 calibration and a 30 edge score, blended 50/20/15/15.
    expect(score.intelligenceScore).toBe(57);
  });

  it("scores nothing but the market average when no picks are locked", () => {
    const score = scoreCap([], [perf({ symbol: "ZZZ", rank: 1, changePercent: 8 })]);

    expect(score.avgMarketMovePercent).toBe(8);
    expect(score.hitCount).toBe(0);
    expect(score.intelligenceScore).toBe(0);
    expect(score.lockIntegrity).toBe(0);
  });

  it("gives no rank or confidence credit when nothing matched", () => {
    const score = scoreCap(
      [perf({ symbol: "AAA", rank: 1, changePercent: 2 })],
      [perf({ symbol: "ZZZ", rank: 1, changePercent: 8 })],
      1,
    );

    expect(score.rankAccuracy).toBe(0);
    expect(score.confidenceCalibration).toBe(0);
    expect(score.hitRate).toBe(0);
  });
});

describe("runDailyPredictionLock", () => {
  it("locks ten picks per cap tier when the 8:50 AM IST run fires", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-14") : null));

    const run = await runDailyPredictionLock(new Date("2026-08-17T03:20:00.000Z"));

    expect(run).toEqual(
      expect.objectContaining({
        ok: true,
        action: "generated",
        date: "2026-08-17",
        lockAt: "2026-08-17T08:50:00+05:30",
        tradingDay: true,
        picks: { Large: 10, Mid: 10, Small: 10 },
      }),
    );
    expect(write).toHaveBeenCalledWith("bse-ai-locked-picks.json", expect.objectContaining({ date: "2026-08-17" }));
  });

  it("leaves a day that is already locked alone, so a retry cannot change the ten stocks", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-17") : null));

    const run = await runDailyPredictionLock(new Date("2026-08-17T03:25:00.000Z"));

    expect(run.action).toBe("already-locked");
    expect(run.ok).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("re-locks the day when an admin forces it", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-17") : null));

    const run = await runDailyPredictionLock(new Date("2026-08-17T03:25:00.000Z"), { force: true });

    expect(run.action).toBe("generated");
    expect(write).toHaveBeenCalledWith("bse-ai-locked-picks.json", expect.objectContaining({ date: "2026-08-17" }));
  });

  it("still locks the day when the scheduler fires a few minutes early", async () => {
    // 03:17 UTC is 8:47 IST — inside the scheduler's grace window, still before the open.
    const run = await runDailyPredictionLock(new Date("2026-08-17T03:17:00.000Z"));

    expect(run.action).toBe("generated");
    expect(run.date).toBe("2026-08-17");
  });

  /**
   * The regression behind "today's picks never replaced yesterday's".
   *
   * The pre-open shortlist used to be filled against one global budget from every tier's rows
   * sorted together by change, so a session whose biggest movers sat in one tier starved the other
   * two. `generateLockedPrediction` needs ten picks in *every* tier and discarded all three when
   * any one came up short, so the day silently kept the previous list and the landing page showed
   * the held snapshot message instead of new stocks.
   */
  it("locks every tier when the day's biggest movers all sit in one of them", async () => {
    // Large caps sweep the top of the board; on the old global budget Mid and Small got nothing.
    const lopsided = [
      ...Array.from({ length: 150 }, (_, index) => row(`BL${index + 1}`, 40 - index * 0.1, `70${index}`, "Large")),
      ...Array.from({ length: 150 }, (_, index) => row(`BM${index + 1}`, 5 - index * 0.01, `71${index}`, "Mid")),
      ...Array.from({ length: 150 }, (_, index) => row(`BS${index + 1}`, 1 - index * 0.001, `72${index}`, "Small")),
    ];
    rows.mockResolvedValue({ rows: lopsided, sessionDate: "2026-08-17" });
    read.mockImplementation(async (fileName) =>
      fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-17") : null,
    );

    // 08:50 IST, inside the pre-open window that builds the news-led shortlist.
    const run = await runDailyPredictionLock(new Date("2026-08-18T03:20:00.000Z"));

    expect(run).toEqual(
      expect.objectContaining({ ok: true, action: "generated", date: "2026-08-18", picks: { Large: 10, Mid: 10, Small: 10 } }),
    );
    expect(write).toHaveBeenCalledWith("bse-ai-locked-picks.json", expect.objectContaining({ date: "2026-08-18" }));
  });

  it("names the tier that came up short when a lock genuinely cannot be filled", async () => {
    // A universe with only four small caps in it: no shortlist can reach ten for that tier.
    const thin = [
      ...Array.from({ length: 40 }, (_, index) => row(`TL${index + 1}`, 20 - index * 0.1, `80${index}`, "Large")),
      ...Array.from({ length: 40 }, (_, index) => row(`TM${index + 1}`, 10 - index * 0.1, `81${index}`, "Mid")),
      ...Array.from({ length: 4 }, (_, index) => row(`TS${index + 1}`, 1 - index * 0.1, `82${index}`, "Small")),
    ];
    rows.mockResolvedValue({ rows: thin, sessionDate: "2026-08-17" });
    read.mockImplementation(async (fileName) =>
      fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-17") : null,
    );

    const run = await runDailyPredictionLock(new Date("2026-08-18T03:20:00.000Z"));

    expect(run.ok).toBe(false);
    expect(run.action).toBe("failed");
    // The tier and the count, so the next morning's failure is diagnosable from the run alone.
    expect(run.message).toContain("Small");
    expect(run.message).toContain("only 4 candidates");
  });

  it("skips a run that fires early, on a closed day, or after the session", async () => {
    const early = await runDailyPredictionLock(new Date("2026-08-17T02:00:00.000Z"));
    const holiday = await runDailyPredictionLock(new Date("2026-08-16T03:20:00.000Z"));
    const late = await runDailyPredictionLock(new Date("2026-08-17T10:05:00.000Z"));

    expect(early.action).toBe("skipped-early");
    expect(holiday.action).toBe("skipped-holiday");
    expect(late.action).toBe("skipped-closed");
    expect([early, holiday, late].every((run) => run.ok)).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  // A weekday the exchange is shut. Weekends the cron expression already declines to fire on; this
  // is the case that needs the calendar, and the case that was silently predicting ten stocks for
  // Diwali while `BSE_MARKET_HOLIDAYS` sat empty.
  it("skips a weekday the committed holiday calendar closes, and names it", async () => {
    // 2 October 2026 is a Friday, and Gandhi Jayanti. 03:20 UTC is the 08:50 IST lock.
    const run = await runDailyPredictionLock(new Date("2026-10-02T03:20:00.000Z"));

    expect(run.action).toBe("skipped-holiday");
    expect(run.ok).toBe(true);
    expect(run.tradingDay).toBe(false);
    expect(run.message).toContain("Mahatma Gandhi Jayanti");
    expect(run.holidayCalendarThrough).toBe("2027-04-14");
    // Nothing is generated and nothing is written: the previous session's list is held.
    expect(write).not.toHaveBeenCalled();
  });
});

describe("getBseAiPredictionAccuracy", () => {
  it("creates and stores a fixed prediction during the live session if none was locked pre-open", async () => {
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T04:00:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.source).toBe("heuristic");
    expect(report.message).toContain("initialized after the 9:15 AM IST open");
    // Late is disclosed, not answered with a different kind of list: the morning's positive
    // coverage and the model are still what the picks come from.
    expect(news).toHaveBeenCalled();
    expect(ai).toHaveBeenCalled();
    expect(report.predictionsByCap.Large).toHaveLength(10);
    expect(report.predictionsByCap.Mid).toHaveLength(10);
    expect(report.predictionsByCap.Small).toHaveLength(10);
    expect(report.predictions).toHaveLength(10);
    expect(report.actualTopByCap.Large).toHaveLength(10);
    expect(report.actualTopByCap.Mid).toHaveLength(10);
    expect(report.actualTopByCap.Small).toHaveLength(10);
    expect(report.actualTop).toHaveLength(10);
    expect(report.actualTop[0].priceSource).toBe("BSE Bhavcopy");
    expect(write).toHaveBeenCalledWith(
      "bse-ai-locked-picks.json",
      expect.objectContaining({
        date: "2026-08-17",
        generatedAfterCutoff: true,
        picksByCap: expect.objectContaining({
          Large: expect.any(Array),
          Mid: expect.any(Array),
          Small: expect.any(Array),
        }),
      }),
    );
  });

  it("does not create a new prediction after market close if none was locked", async () => {
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T10:05:00.000Z"));

    expect(report.status).toBe("not-generated");
    expect(report.predictions).toEqual([]);
    expect(report.actualTopByCap.Large).toHaveLength(10);
    expect(report.actualTopByCap.Mid).toHaveLength(10);
    expect(report.actualTopByCap.Small).toHaveLength(10);
    expect(write).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
  });

  it("generates and stores a locked prediction between the 8:50 lock and the 9:15 open", async () => {
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T03:30:00.000Z"));

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
        date: "2026-08-17",
        cutoffAt: "2026-08-17T09:15:00+05:30",
        picksByCap: expect.objectContaining({
          Large: expect.any(Array),
          Mid: expect.any(Array),
          Small: expect.any(Array),
        }),
      }),
    );
  });

  it("shortlists from the dedicated pre-open searches, not only the news board's market feed", async () => {
    // The market feed on its own is a news panel's feed: four searches, one of them looking for
    // shares falling. On a live morning it yielded two usable company signals, which is what left
    // every pick with an empty `positiveNewsSignals` array on the landing page.
    news.mockResolvedValue({
      scope: "Indian markets",
      items: [],
      fetchedAt: "2026-08-17T02:00:00.000Z",
      source: "google-news",
      classifier: "heuristic",
    });
    newsQuery.mockResolvedValue([
      {
        id: "news-bbb",
        title: "BBB bags Rs 900 crore order from Indian Railways",
        summary: "",
        source: "Publisher",
        url: "https://example.com/bbb",
        publishedAt: "2026-08-17T02:30:00.000Z",
        sentiment: "Neutral",
        symbol: null,
        company: null,
      },
    ]);
    classify.mockReturnValue("Positive");
    match.mockReturnValue({ symbol: "BBB", company: "BBB Ltd" });

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T03:30:00.000Z"));

    expect(newsQuery).toHaveBeenCalledTimes(5);
    expect(report.predictions[0].symbol).toBe("BBB");
    expect(report.predictions[0].positiveNewsSignals).toEqual(["BBB bags Rs 900 crore order from Indian Railways"]);
    expect(report.predictions[0].sources?.[0]).toEqual(
      expect.objectContaining({ url: "https://example.com/bbb", publisher: "Publisher" }),
    );
  });

  it("hands the model the headlines behind each candidate", async () => {
    let handed: unknown = null;
    ai.mockImplementation(async (options) => {
      handed ??= JSON.parse((options as { user: string }).user);
      return null;
    });

    await getBseAiPredictionAccuracy(new Date("2026-08-17T03:30:00.000Z"));

    expect(handed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticker: "AAA",
          positiveNews: [expect.objectContaining({ title: "AAA shares jump after order win" })],
        }),
      ]),
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

  it("serves the last market-close snapshot after the next session closes without a new lock", async () => {
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

    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T10:05:00.000Z"));

    expect(report.date).toBe("2026-08-16");
    expect(report.persistedSession).toBe(true);
    expect(report.accuracy).toEqual({ matched: 3, total: 30, percent: 10 });
    expect(report.message).toContain("until the next pre-open AI lock is generated");
    expect(movers).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  /**
   * The reported bug, end to end: yesterday's lock and yesterday's close snapshot both on disk,
   * page loaded after this morning's 8:50 lock on a lopsided board.
   *
   * The snapshot is only meant to be served while today's list is missing or held. Because the
   * shortlist starved two tiers, generation failed, the previous list was held, and the holdover
   * branch handed back the previous session's snapshot instead: the reader saw yesterday's stocks
   * under "Showing the persisted ... snapshot until the next pre-open AI lock is generated".
   */
  it("replaces yesterday's snapshot with today's picks once the lock has passed", async () => {
    const lopsided = [
      ...Array.from({ length: 150 }, (_, index) => row(`BL${index + 1}`, 40 - index * 0.1, `70${index}`, "Large")),
      ...Array.from({ length: 150 }, (_, index) => row(`BM${index + 1}`, 5 - index * 0.01, `71${index}`, "Mid")),
      ...Array.from({ length: 150 }, (_, index) => row(`BS${index + 1}`, 1 - index * 0.001, `72${index}`, "Small")),
    ];
    rows.mockResolvedValue({ rows: lopsided, sessionDate: "2026-08-17" });
    read.mockImplementation(async (fileName) => {
      if (fileName === "bse-ai-locked-picks.json") return lockedCacheFor("2026-08-17");
      // Yesterday's persisted close snapshot, exactly as it sits on disk.
      return { ...lockedCacheFor("2026-08-17"), status: "locked", persistedSession: true, persistedAt: "2026-08-17T10:01:00.000Z" };
    });

    // 08:57 IST: past the 8:50 lock, before the 9:15 open.
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-18T03:27:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.date).toBe("2026-08-18");
    expect(report.lockDate).toBe("2026-08-18");
    expect(report.holdover).toBe(false);
    // Neither the stale snapshot nor its message survives into today.
    expect(report.persistedSession).toBe(false);
    expect(report.message).not.toContain("until the next pre-open AI lock is generated");
    expect(write).toHaveBeenCalledWith("bse-ai-locked-picks.json", expect.objectContaining({ date: "2026-08-18" }));
  });

  it("holds yesterday's locked picks before the 8:50 AM IST lock instead of predicting early", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-14") : null));

    // Monday 7:00 AM IST: the 8:50 run has not happened, so Friday's list is still the live one.
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T01:30:00.000Z"));

    expect(report.status).toBe("locked");
    expect(report.holdover).toBe(true);
    expect(report.date).toBe("2026-08-17");
    expect(report.lockDate).toBe("2026-08-14");
    expect(report.nextLockAt).toBe("2026-08-17T08:50:00+05:30");
    expect(report.message).toContain("Holding the 2026-08-14 locked picks");
    expect(report.predictionsByCap.Large).toHaveLength(10);
    expect(write).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
  });

  it("replaces the held picks once the 8:50 AM IST lock comes round", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-14") : null));

    // Monday 8:50 AM IST exactly.
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-17T03:20:00.000Z"));

    expect(report.holdover).toBe(false);
    expect(report.lockDate).toBe("2026-08-17");
    expect(report.predictions[0].symbol).toBe("AAA");
    expect(write).toHaveBeenCalledWith("bse-ai-locked-picks.json", expect.objectContaining({ date: "2026-08-17" }));
  });

  it("holds the previous list through a non-trading day rather than locking a new one", async () => {
    read.mockImplementation(async (fileName) => (fileName === "bse-ai-locked-picks.json" ? lockedCacheFor("2026-08-14") : null));

    // Sunday, mid-morning: no session to predict for.
    const report = await getBseAiPredictionAccuracy(new Date("2026-08-16T04:00:00.000Z"));

    expect(report.holdover).toBe(true);
    expect(report.lockDate).toBe("2026-08-14");
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
