/**
 * The stock-returns board's ranking, and the thing a search does differently.
 *
 * The board itself is a ranking: the 50% bar and the gainers/losers split are what keep it to
 * names that actually moved. A search is a different question — "how has this company done" — and
 * those same rules answered it with an empty panel, on both tabs, for any company under the bar or
 * outside the ~400-name tracked catalogue. These cover the split.
 */
import { getTopPerformers } from "../../app/lib/top-performers";

jest.mock("../../app/lib/historical-returns", () => ({
  getReturnsForPeriod: jest.fn(),
  getReturnsOnDemand: jest.fn(),
}));

jest.mock("../../app/lib/market-data", () => ({
  getQuotesFor: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked modules, for arranging return values.
const returns = require("../../app/lib/historical-returns") as {
  getReturnsForPeriod: jest.Mock;
  getReturnsOnDemand: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- as above.
const marketData = require("../../app/lib/market-data") as { getQuotesFor: jest.Mock };

/** The daily cache, covering the tracked catalogue only — which is the whole point of these tests. */
function mockCache(values: Record<string, number | null>) {
  returns.getReturnsForPeriod.mockResolvedValue({
    date: "2026-08-17",
    generatedAt: "2026-08-17T04:00:00.000Z",
    returns: values,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCache({ TCS: 12.5, TITAN: 214.7, SUZLON: -63.2, TRENT: 88.25 });
  returns.getReturnsOnDemand.mockResolvedValue({});
  marketData.getQuotesFor.mockResolvedValue([]);
});

describe("getTopPerformers, unfiltered", () => {
  it("ranks the tracked catalogue past the 50% bar, biggest move first", async () => {
    const board = await getTopPerformers({ direction: "gainers", period: "1y" });

    expect(board.stocks.map((stock) => stock.symbol)).toEqual(["TITAN", "TRENT"]);
    expect(board.threshold).toBe(50);
    // TCS is up 12.5%, which is under the bar — the board is about names that moved.
    expect(board.total).toBe(2);
  });

  it("points the other way on the losers board", async () => {
    const board = await getTopPerformers({ direction: "losers", period: "1y" });

    expect(board.stocks.map((stock) => stock.symbol)).toEqual(["SUZLON"]);
  });
});

describe("getTopPerformers, searched", () => {
  it("answers with a company under the bar, on either tab", async () => {
    // TCS is up 12.5%: over neither bar, so it used to be absent from both boards.
    const gainers = await getTopPerformers({ direction: "gainers", period: "1y", query: "tcs" });
    const losers = await getTopPerformers({ direction: "losers", period: "1y", query: "tcs" });

    for (const board of [gainers, losers]) {
      expect(board.stocks).toHaveLength(1);
      expect(board.stocks[0]).toMatchObject({
        symbol: "TCS",
        name: "Tata Consultancy Services",
        sector: "Information Technology",
        capTier: "Large",
        periodReturn: 12.5,
      });
      // No bar was applied, and the payload says so rather than reporting one that did nothing.
      expect(board.threshold).toBeNull();
    }
  });

  it("reaches a company the daily cache does not cover, fetching its history on the spot", async () => {
    // Cupid is one of the ~4,550 listed scrips outside the tracked catalogue: no cached return, so
    // the board had nothing to show for a company its own search box suggests.
    returns.getReturnsOnDemand.mockResolvedValue({ CUPID: 12.3 });

    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "cupid" });

    expect(board.stocks[0]).toMatchObject({ symbol: "CUPID", name: "Cupid Ltd-$", capTier: "Small", periodReturn: 12.3 });
    // Fetched against the symbol Yahoo knows the scrip by, for the window the reader picked.
    expect(returns.getReturnsOnDemand).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ symbol: "CUPID", yahooSymbol: "CUPID.NS" })]),
      "1y",
    );
  });

  it("prices a searched company from outside the catalogue like any other row", async () => {
    returns.getReturnsOnDemand.mockResolvedValue({ CUPID: 12.3 });
    marketData.getQuotesFor.mockResolvedValue([{ symbol: "CUPID", price: 118.4, changePercent: 0.8 }]);

    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "cupid" });

    expect(board.stocks[0]).toMatchObject({ price: 118.4, changePercent: 0.8 });
  });

  it("spends no history request on a name the cache already answers for", async () => {
    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "suzlon" });

    expect(board.stocks[0]).toMatchObject({ symbol: "SUZLON", periodReturn: -63.2 });
    expect(returns.getReturnsOnDemand).not.toHaveBeenCalled();
  });

  it("caps how many uncached names one search may go to the network for", async () => {
    // A short query matches hundreds of scrips across the exchange. Every one of them is a round
    // trip if left uncapped, for a board that shows five rows.
    await getTopPerformers({ direction: "gainers", period: "1y", query: "a" });

    const [subjects] = returns.getReturnsOnDemand.mock.calls[0];
    expect(subjects.length).toBeLessThanOrEqual(12);
  });

  it("survives a history feed that refuses, losing only the uncached names", async () => {
    returns.getReturnsOnDemand.mockRejectedValue(new Error("Yahoo unreachable"));

    // "tata" matches TCS, which the cache answers for, alongside uncached scrips across the
    // exchange. An unreachable feed costs those their rows; it does not fail the search.
    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "tata" });

    expect(board.stocks.map((stock) => stock.symbol)).toEqual(["TCS"]);
  });

  it("drops a match the exchange has no usable history for at all", async () => {
    returns.getReturnsOnDemand.mockResolvedValue({ CUPID: null });

    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "cupid" });

    expect(board.stocks).toEqual([]);
  });

  it("matches on company name as well as ticker", async () => {
    const board = await getTopPerformers({ direction: "gainers", period: "1y", query: "tata consultancy" });

    expect(board.stocks[0]).toMatchObject({ symbol: "TCS" });
  });
});
