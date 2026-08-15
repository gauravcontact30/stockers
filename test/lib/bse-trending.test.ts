// `next/cache` reaches for a global Request the moment app/lib/cache is loaded, so the shim has to
// be in place before that import runs — which is why the modules below are required, not imported.
if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(public input: string) {}
  } as unknown as typeof Request;
}

// The two bulk upstream calls, stubbed at the transport rather than at getBseUniverse/getBseTape,
// so the joining, the equity-series filter and the Bhavcopy parsing all still run for real.
jest.mock("../../app/lib/bse-client", () => ({
  fetchBse: jest.fn(),
  fetchBseText: jest.fn(),
}));

// Groww's published list is fetched over the network and has a suite of its own. Stubbed here so
// these tests neither reach the internet nor depend on what Groww happens to be showing today.
jest.mock("../../app/lib/broker-popularity", () => ({
  getBrokerPopularity: jest.fn(async () => ({
    // Deliberately not in turnover order: IDEA is Groww's #4 but out-trades SMECO, its #2, by two
    // orders of magnitude. A board ranked by placing must still put SMECO first.
    "532822": [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 4 }],
    "543279": [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 2 }],
  })),
}));

// Sector classification is a per-scrip upstream call with a suite of its own; here it only has to
// hand the rows back so the ranking is what is under test.
jest.mock("../../app/lib/bse-sectors", () => ({
  attachSectors: jest.fn(async (rows: unknown[]) => rows.map((row) => ({ ...(row as object), sector: null, industry: null }))),
  classifyUniverse: jest.fn(),
  categoryOf: jest.fn(() => null),
  inHouseCategory: jest.fn(() => true),
  HOUSE_CATEGORY: {},
}));

const { fetchBse, fetchBseText } = require("../../app/lib/bse-client") as {
  fetchBse: jest.Mock;
  fetchBseText: jest.Mock;
};
const { clearMemoryCache } = require("../../app/lib/cache") as typeof import("../../app/lib/cache");
const { getBseTrending } = require("../../app/lib/bse-market") as typeof import("../../app/lib/bse-market");

type Scrip = {
  code: string;
  ticker: string;
  name: string;
  marketCapCr: number;
  price: number;
  previousClose: number;
  volume: number;
  /** In rupees, as the Bhavcopy files it. */
  turnover: number;
  trades: number;
  series?: string;
  /** The exchange group letter, which is what the BSE platform is read from. */
  group?: string;
};

const BOARD: Scrip[] = [
  // Heaviest by rupees, but institutional: few, very large tickets.
  { code: "540133", ticker: "ICICIPRULI", name: "ICICI Pru Life", marketCapCr: 90_000, price: 506, previousClose: 505, volume: 700_000, turnover: 3_560_000_000, trades: 1023 },
  // Second by rupees, third by trades.
  { code: "500180", ticker: "HDFCBANK", name: "HDFC Bank Ltd", marketCapCr: 1_500_000, price: 727.35, previousClose: 727, volume: 4_390_000, turnover: 3_190_000_000, trades: 28_254 },
  // Retail-sized tickets: most transactions of any row, but far less money.
  { code: "532822", ticker: "IDEA", name: "Vodafone Idea Ltd", marketCapCr: 14_000, price: 14.1, previousClose: 14.3, volume: 54_953_475, turnover: 775_000_000, trades: 567_272 },
  // A penny scrip on the surveillance segment: top by share count, bottom by everything that matters.
  { code: "531205", ticker: "SPRIGHT", name: "Spright Agro Ltd", marketCapCr: 900, price: 0.43, previousClose: 0.44, volume: 21_357_426, turnover: 93_900_000, trades: 2011, group: "Z" },
  // The SME platform, so the platform filter has something to separate.
  { code: "543279", ticker: "SMECO", name: "Small Enterprise Co Ltd", marketCapCr: 120, price: 88, previousClose: 80, volume: 40_000, turnover: 3_500_000, trades: 300, group: "M" },
];

// A rights entitlement, which the equity-series filter must drop before it can out-trade a company.
const RIGHTS: Scrip = { code: "999999", ticker: "SOMERE", name: "Some Co Rights", marketCapCr: 10, price: 5, previousClose: 4, volume: 99_999_999, turnover: 9_999_000_000, trades: 999_999, series: "R" };

// A scrip in the master that simply did not trade: no price, no turnover, no transactions.
const UNTRADED: Scrip = { code: "500001", ticker: "QUIET", name: "Quiet Ltd", marketCapCr: 5000, price: 0, previousClose: 0, volume: 0, turnover: 0, trades: 0 };

const HEADER =
  "TradDt,FinInstrmTp,FinInstrmId,TckrSymb,FinInstrmNm,ISIN,SctySrs,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd";

function line(scrip: Scrip): string {
  return [
    "2026-08-14", "STK", scrip.code, scrip.ticker, scrip.name, `INE${scrip.code}`, scrip.series ?? "A",
    scrip.price, scrip.price, scrip.price, scrip.price, scrip.price, scrip.previousClose,
    scrip.volume, scrip.turnover, scrip.trades,
  ].join(",");
}

/**
 * A Bhavcopy holding the fixture rows plus enough filler to clear MIN_SESSION_ROWS — a file with
 * fewer than 500 rows is treated as the session still being in progress and skipped entirely.
 */
function bhavcopy(scrips: Scrip[]): string {
  const filler = Array.from({ length: 520 }, (_, index) =>
    line({ code: `9${String(index).padStart(5, "0")}`, ticker: `FILL${index}`, name: `Filler ${index}`, marketCapCr: 1, price: 10, previousClose: 10, volume: 10, turnover: 100, trades: 1 }),
  );
  return [HEADER, ...scrips.map(line), ...filler].join("\n");
}

function scripMaster(scrips: Scrip[]) {
  return scrips.map((scrip) => ({
    SCRIP_CD: scrip.code,
    Scrip_Name: scrip.name,
    scrip_id: scrip.ticker,
    GROUP: scrip.group ?? "A",
    ISIN_NUMBER: `INE${scrip.code}`,
    Mktcap: scrip.marketCapCr,
    NSURL: "",
  }));
}

function seed(scrips: Scrip[]) {
  fetchBse.mockResolvedValue(scripMaster(scrips));
  fetchBseText.mockResolvedValue(bhavcopy(scrips));
}

beforeEach(() => {
  jest.clearAllMocks();
  clearMemoryCache();
});

describe("BSE trending board", () => {
  it("ranks by rupee turnover by default, largest first", async () => {
    seed(BOARD);

    const board = await getBseTrending();

    expect(board.rank).toBe("turnover");
    expect(board.sessionDate).toBe("2026-08-14");
    expect(board.rows.map((row) => row.ticker)).toEqual(["ICICIPRULI", "HDFCBANK", "IDEA", "SPRIGHT", "SMECO"]);
  });

  it("ranks by transaction count, which is a different board from turnover", async () => {
    seed(BOARD);

    const board = await getBseTrending({ rank: "trades" });

    // IDEA is third by money and first by attention — the whole reason the ranking is a choice.
    expect(board.rows.map((row) => row.ticker)).toEqual(["IDEA", "HDFCBANK", "SPRIGHT", "ICICIPRULI", "SMECO"]);
  });

  it("ranks by share volume, which a penny scrip can top on very little money", async () => {
    seed(BOARD);

    const board = await getBseTrending({ rank: "volume" });

    expect(board.rows.map((row) => row.ticker)).toEqual(["IDEA", "SPRIGHT", "HDFCBANK", "ICICIPRULI", "SMECO"]);
  });

  it("reports each row's share of the session and the average size of one trade", async () => {
    seed(BOARD);

    const [top] = (await getBseTrending()).rows;

    // 356 Cr of the 762.2 Cr the fixture traded between them.
    expect(top.turnoverShare).toBeCloseTo(46.72, 1);
    // 356 Cr over 1,023 trades is an institutional-sized ticket.
    expect(Math.round(top.averageTradeValue ?? 0)).toBe(3_479_961);

    const retail = (await getBseTrending({ rank: "trades" })).rows[0];
    expect(Math.round(retail.averageTradeValue ?? 0)).toBe(1366);
  });

  it("counts the whole exchange in the totals, not just the rows returned", async () => {
    seed(BOARD);

    const board = await getBseTrending({ pageSize: 2 });

    expect(board.rows).toHaveLength(2);
    // All five fixture scrips traded, so the totals still count five even though two were returned.
    // The Bhavcopy filler is deliberately absent from the scrip master, so it never joins.
    expect(board.totals.traded).toBe(5);
    expect(board.totals.turnoverCr).toBeCloseTo(762.24, 1);
  });

  it("leaves out scrips that did not trade and instruments that are not shares", async () => {
    seed([...BOARD, RIGHTS, UNTRADED]);

    const tickers = (await getBseTrending({ rank: "trades", pageSize: 50 })).rows.map((row) => row.ticker);

    // The rights entitlement out-trades every company in the fixture and must still not appear.
    expect(tickers).not.toContain("SOMERE");
    expect(tickers).not.toContain("QUIET");
  });

  it("clamps the requested size to the board's ceiling", async () => {
    seed(BOARD);

    expect((await getBseTrending({ pageSize: 999 })).rows.length).toBeLessThanOrEqual(50);
    expect((await getBseTrending({ pageSize: -3 })).rows).toHaveLength(1);
  });

  it("searches by name, ticker, scrip code and ISIN alike", async () => {
    seed(BOARD);

    const byName = await getBseTrending({ q: "vodafone" });
    const byTicker = await getBseTrending({ q: "idea" });
    const byCode = await getBseTrending({ q: "532822" });
    const byIsin = await getBseTrending({ q: "ine532822" });

    for (const board of [byName, byTicker, byCode, byIsin]) {
      expect(board.rows.map((row) => row.ticker)).toEqual(["IDEA"]);
      expect(board.total).toBe(1);
    }
  });

  it("reads each company's BSE platform from its exchange group letter", async () => {
    seed(BOARD);

    const board = await getBseTrending();
    const platformOf = (ticker: string) => board.rows.find((row) => row.ticker === ticker)?.group;

    expect(platformOf("HDFCBANK")).toBe("A");
    expect(platformOf("SMECO")).toBe("M");
    expect(platformOf("SPRIGHT")).toBe("Z");
  });

  it("filters to one BSE platform", async () => {
    seed(BOARD);

    const sme = await getBseTrending({ platform: "SME" });

    expect(sme.rows.map((row) => row.ticker)).toEqual(["SMECO"]);
    expect(sme.total).toBe(1);
  });

  it("counts platform facets over the search but not over the platform filter itself", async () => {
    seed(BOARD);

    // Already narrowed to SME, and the chips still report every platform the search leaves — so
    // switching away from SME is possible rather than a dead end.
    const board = await getBseTrending({ platform: "SME" });

    expect(board.platforms).toEqual(
      expect.arrayContaining([
        { platform: "Main Board", count: 3 },
        { platform: "SME", count: 1 },
        { platform: "Z Group", count: 1 },
      ]),
    );

    // A search that matches one main-board company leaves only that platform on the chips.
    const searched = await getBseTrending({ q: "hdfc" });
    expect(searched.platforms).toEqual([{ platform: "Main Board", count: 1 }]);
  });

  it("filters by cap tier and by the size of the move, in either direction", async () => {
    seed(BOARD);

    // The fixture's four ranked companies are the whole universe, so the top 100 by market cap is
    // all of them — every row is large cap, and none is mid.
    expect((await getBseTrending({ tier: "mid" })).total).toBe(0);
    expect((await getBseTrending({ tier: "large" })).total).toBe(5);

    // SMECO is +10% and SPRIGHT is -2.27%: a 2% filter keeps both, a 5% filter only SMECO.
    expect((await getBseTrending({ minPercent: 2 })).rows.map((row) => row.ticker)).toEqual(["SPRIGHT", "SMECO"]);
    expect((await getBseTrending({ minPercent: 5 })).rows.map((row) => row.ticker)).toEqual(["SMECO"]);
  });

  it("attaches a broker's published placing to the company it belongs to, and only that one", async () => {
    seed(BOARD);

    const rows = (await getBseTrending()).rows;

    expect(rows.find((row) => row.ticker === "IDEA")?.brokers).toEqual([
      { broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 4 },
    ]);
    expect(rows.find((row) => row.ticker === "HDFCBANK")?.brokers).toEqual([]);
  });

  it("ranks by broker placing, most bought first, regardless of what traded most", async () => {
    seed(BOARD);

    const board = await getBseTrending({ rank: "brokers" });

    // Groww's #2 leads its #4, even though that #4 traded ~200x the money.
    expect(board.rows.map((row) => row.ticker)).toEqual(["SMECO", "IDEA"]);
    expect(board.rows.map((row) => row.brokerRank)).toEqual([2, 4]);
    // Confined to companies some broker actually lists, rather than padded with unplaced rows.
    expect(board.total).toBe(2);
  });

  it("leaves brokerRank null on a company no broker lists", async () => {
    seed(BOARD);

    const rows = (await getBseTrending()).rows;

    expect(rows.find((row) => row.ticker === "HDFCBANK")?.brokerRank).toBeNull();
    expect(rows.find((row) => row.ticker === "SMECO")?.brokerRank).toBe(2);
  });

  it("still measures share of the session against the whole exchange when ranked by brokers", async () => {
    seed(BOARD);

    const board = await getBseTrending({ rank: "brokers" });

    // Two rows on the board, but the denominator is all five that traded.
    expect(board.totals.traded).toBe(5);
    expect(board.rows.find((row) => row.ticker === "IDEA")?.turnoverShare).toBeCloseTo(10.17, 1);
  });

  it("filters to the companies on one broker's published list", async () => {
    seed(BOARD);

    const board = await getBseTrending({ broker: "groww" });

    // Still ordered by the active ranking — turnover here — not by Groww's placing.
    expect(board.rows.map((row) => row.ticker)).toEqual(["IDEA", "SMECO"]);
    expect(board.total).toBe(2);
    // The share is still measured against the whole exchange, not against the filtered rows.
    expect(board.totals.traded).toBe(5);
  });

  it("pages through the ranking and clamps a page past the end", async () => {
    seed(BOARD);

    const first = await getBseTrending({ pageSize: 2, page: 1 });
    const second = await getBseTrending({ pageSize: 2, page: 2 });
    const past = await getBseTrending({ pageSize: 2, page: 99 });

    expect(first.rows.map((row) => row.ticker)).toEqual(["ICICIPRULI", "HDFCBANK"]);
    expect(second.rows.map((row) => row.ticker)).toEqual(["IDEA", "SPRIGHT"]);
    expect(first.pages).toBe(3);
    expect(first.total).toBe(5);
    // Page 99 of a three-page board is page three, not an empty slice.
    expect(past.page).toBe(3);
    expect(past.rows.map((row) => row.ticker)).toEqual(["SMECO"]);
  });

  it("returns an empty board rather than throwing when the session file is missing", async () => {
    fetchBse.mockResolvedValue(scripMaster(BOARD));
    fetchBseText.mockResolvedValue(null);

    const board = await getBseTrending();

    expect(board.rows).toEqual([]);
    expect(board.sessionDate).toBeNull();
    expect(board.totals.traded).toBe(0);
  });
});
