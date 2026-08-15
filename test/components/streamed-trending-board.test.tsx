import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { StreamedTrendingBoard, TrendingPayload } from "../../app/components/streamed-trending-board";
import { buildTrendingUrl } from "../../app/lib/market-urls";

jest.mock("../../app/lib/bse-market", () => ({
  getBseTrending: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked module, for arranging return values.
const bseMarket = require("../../app/lib/bse-market") as { getBseTrending: jest.Mock };

const board = {
  rows: [
    {
      code: "500325",
      ticker: "RELIANCE",
      name: "Reliance Industries",
      sector: "Energy",
      capTier: "Large",
      platform: "Main Board",
      price: 1432.5,
      changePercent: 1.29,
      volume: 4_200_000,
      trades: 120_000,
      turnoverCr: 601.2,
      turnoverShare: 3.4,
      brokerRank: 1,
      brokers: ["groww"],
    },
  ],
  rank: "brokers",
  total: 1,
  page: 1,
  pages: 1,
  pageSize: 10,
  totals: { turnoverCr: 84_000, volume: 91_000_000, trades: 4_100_000, traded: 3_400 },
  // Counted before the platform filter but after every other one, so the chips say what choosing
  // them would actually yield. The board draws every platform, so all five are present.
  platforms: [
    { platform: "Main Board", count: 1 },
    { platform: "SME", count: 0 },
    { platform: "X Group", count: 0 },
    { platform: "Trade-to-Trade", count: 0 },
    { platform: "Z Group", count: 0 },
  ],
  sessionDate: "2026-08-07",
};

beforeEach(() => {
  bseMarket.getBseTrending.mockResolvedValue(board);
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("TrendingPayload", () => {
  /**
   * The board opens on the broker ranking rather than on exchange turnover — what retail is buying
   * is the question a landing-page visitor is asking — so that is the tab the server prefetches.
   */
  it("asks the data layer for the tab the board opens on", async () => {
    await TrendingPayload();

    expect(bseMarket.getBseTrending).toHaveBeenCalledWith({
      rank: "brokers",
      page: 1,
      pageSize: 10,
    });
  });

  it("labels the payload with the URL the client asks for on its first render", async () => {
    const element = await TrendingPayload();

    expect(element.props.prefetched.url).toBe(buildTrendingUrl("brokers", "", "all", "all", "all", "0", 1));
    expect(element.props.prefetched.data).toBe(board);
  });

  it("renders the rows straight out of the server's payload, without fetching", async () => {
    render(await TrendingPayload());

    // The company name, not the ticker: the row renders the ticker as `{ticker} · {code}`, so it
    // is not a text node of its own.
    expect(await screen.findByText("Reliance Industries")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the streamed boundary", () => {
  it("puts the trending board behind its own boundary", () => {
    const element = StreamedTrendingBoard();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(TrendingPayload);

    const { container } = render(element.props.fallback);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
