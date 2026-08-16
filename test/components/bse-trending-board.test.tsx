import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BseTrendingBoard, TrendingRow, buildTrendingUrl } from "../../app/components/bse-trending-board";
import type { BseTrendingBoard as BseTrendingPayload, BseTrendingRow } from "../../app/lib/bse-market";

jest.setTimeout(30000);

// The exchange-wide type-ahead has a suite of its own; here it is stubbed to the input so these
// tests are about the board rather than the combobox.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: (props: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
  ),
}));

function row(overrides: Partial<BseTrendingRow> = {}): BseTrendingRow {
  return {
    code: "500180",
    ticker: "HDFCBANK",
    name: "HDFC Bank Ltd",
    group: "A",
    isin: "INE040A01034",
    capTier: "Large",
    rank: 2,
    marketCapCr: 1_500_000,
    url: "",
    sector: "Financial Services",
    industry: "Banks",
    price: 727.35,
    previousClose: 727,
    change: 0.35,
    changePercent: 0.05,
    open: 726,
    dayHigh: 730,
    dayLow: 724,
    volume: 4_390_000,
    turnoverCr: 319.4,
    trades: 28_254,
    turnoverShare: 3.52,
    averageTradeValue: 113_029,
    brokers: [],
    brokerRank: null,
    ...overrides,
  };
}

// A freshly listed, unclassified scrip on a group letter that maps to no known platform: every
// optional field arrives null at once, and none of them may take the row down.
const SPARSE = row({
  code: "544865",
  ticker: "LEAPIND",
  name: "Leap India Ltd",
  group: "??",
  sector: null,
  capTier: null,
  changePercent: null,
  turnoverCr: null,
  turnoverShare: null,
  averageTradeValue: null,
  trades: null,
  volume: null,
  price: null,
  dayHigh: null,
  dayLow: null,
});

const SME = row({
  code: "543279",
  ticker: "SMECO",
  name: "Small Enterprise Co Ltd",
  group: "M",
  capTier: "Small",
  sector: "Capital Goods",
  price: 88,
  changePercent: 10,
  turnoverCr: 0.35,
  trades: 300,
  turnoverShare: 0.01,
  averageTradeValue: 11_666,
});

const BOARDS: Record<string, BseTrendingRow[]> = {
  // Most bought first. SPARSE sits in the middle deliberately: a row with no placing has to draw a
  // dash rather than a "#null", and this is the board where that can happen.
  brokers: [
    row({ brokers: [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 1 }], brokerRank: 1 }),
    SPARSE,
    { ...SME, brokers: [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 4 }], brokerRank: 4 },
  ],
  turnover: [row(), SPARSE, SME],
  trades: [
    row({
      code: "532822",
      ticker: "IDEA",
      name: "Vodafone Idea Ltd",
      group: "B",
      sector: "Telecommunication",
      capTier: "Small",
      price: 14.1,
      changePercent: -1.4,
      volume: 54_953_475,
      turnoverCr: 77.5,
      trades: 567_272,
      turnoverShare: 0.85,
      averageTradeValue: 1355,
    }),
  ],
  volume: [SPARSE],
};

function payload(rank: string, overrides: Partial<BseTrendingPayload> = {}): BseTrendingPayload {
  const rows = BOARDS[rank];
  return {
    rows,
    rank: rank as BseTrendingPayload["rank"],
    totals: { turnoverCr: 9075, volume: 1_000_000, trades: 2_000_000, traded: 4419 },
    platforms: [
      { platform: "Main Board", count: 2 },
      { platform: "SME", count: 1 },
    ],
    total: rows.length,
    page: 1,
    pageSize: 10,
    pages: 1,
    sessionDate: "2026-08-14",
    ...overrides,
  };
}

function mockFeed(build: (url: URL) => BseTrendingPayload = (url) => payload(url.searchParams.get("rank") ?? "turnover")) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    return { ok: true, json: async () => build(url) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("buildTrendingUrl", () => {
  it("leaves every default off the query string", () => {
    expect(buildTrendingUrl("brokers", "", "all", "all", "all", "0", 1)).toBe(
      "/api/market/bse/trending?rank=brokers&page=1&pageSize=10",
    );
  });

  it("carries the search, platform, tier and move filters when they are set", () => {
    expect(buildTrendingUrl("trades", "hdfc", "SME", "groww", "large", "5", 3)).toBe(
      "/api/market/bse/trending?rank=trades&page=3&pageSize=10&q=hdfc&platform=SME&broker=groww&tier=large&min=5",
    );
  });
});

describe("TrendingRow", () => {
  it("shows the ranked figure for whichever ranking it is drawn under", () => {
    const { rerender } = render(
      <ul>
        <TrendingRow row={row()} rank="turnover" position={1} />
      </ul>,
    );
    expect(screen.getByText("₹319 Cr")).toBeInTheDocument();

    rerender(
      <ul>
        <TrendingRow row={row()} rank="volume" position={1} />
      </ul>,
    );
    expect(screen.getByText("43.90 L")).toBeInTheDocument();

    rerender(
      <ul>
        <TrendingRow row={row()} rank="trades" position={1} />
      </ul>,
    );
    expect(screen.getByText("28,254")).toBeInTheDocument();
  });
});

describe("BSE trending board", () => {
  it("leads each row with the company's real name, sector and cap tier", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("HDFC Bank Ltd")).closest("li") as HTMLElement;
    expect(within(card).getByText("HDFCBANK · 500180")).toBeInTheDocument();
    expect(within(card).getByText("Financial Services")).toBeInTheDocument();
    expect(within(card).getByText("Large cap")).toBeInTheDocument();

    expect(screen.getByText("3 traded")).toBeInTheDocument();
  });

  it("opens on exchange turnover, which is where the session's money went", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=turnover&page=1&pageSize=10");
    expect(screen.getByText("Ranked by the rupees that changed hands.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "By turnover (₹)" })).toHaveAttribute("aria-pressed", "true");

    // A row the exchange published no turnover for draws a dash rather than a zero.
    const unplaced = (await screen.findByText("Leap India Ltd")).closest("li") as HTMLElement;
    expect(within(unplaced).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("names no platform but the exchange — no broker ranking, and no broker filter", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    for (const name of ["Groww", "Zerodha", "Angel One", "Upstox", "ICICI Direct", "All BSE"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/most bought/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Broker lists/i)).not.toBeInTheDocument();
  });

  it("offers the other two exchange rankings", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "By trade count" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=trades&page=1&pageSize=10"),
    );
    expect(screen.getByText("Ranked by how many separate transactions were struck.")).toBeInTheDocument();
  });

  it("puts the rank under the logo rather than beside it", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    // Third row on page one, drawn muted in the logo's own column.
    const badge = within(card).getByText("3");
    expect(badge.className).toContain("text-slate-400");
    expect(badge.previousElementSibling).not.toBeNull();
  });

  it("keeps exchange segment names out of SME listings", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    expect(within(card).queryByText("BSE SME")).not.toBeInTheDocument();
    expect(within(card).getByText("Capital Goods")).toBeInTheDocument();
    expect(within(card).getByText("Small cap")).toBeInTheDocument();
  });

  it("re-ranks by trade count and makes that figure the row's headline", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "By trade count" }));

    expect(await screen.findByText("Vodafone Idea Ltd")).toBeInTheDocument();
    expect(screen.getByText("Ranked by how many separate transactions were struck.")).toBeInTheDocument();
    expect(screen.getByText("5.67 L")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=trades&page=1&pageSize=10");
  });

  it("re-ranks by share volume", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "By volume (shares)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=volume&page=1&pageSize=10"),
    );
    expect(screen.getByText("Ranked by the number of shares that moved.")).toBeInTheDocument();
  });

  it("renders a sparse row as dashes and draws no platform, sector or tier pill", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Leap India Ltd")).closest("li") as HTMLElement;
    expect(within(card).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(card).queryByText(/^BSE /)).not.toBeInTheDocument();
    expect(within(card).queryByText(/cap$/)).not.toBeInTheDocument();
  });

  it("searches the exchange and offers to clear the filters once one is set", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search any BSE company/), "hdfc");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=turnover&page=1&pageSize=10&q=hdfc"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=turnover&page=1&pageSize=10"),
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("filters by stock shortcut, by cap tier and by the size of the move", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: /HDFC Bank\s+HDFCBANK/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=10&q=HDFCBANK",
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Market cap tier"), "small");
    await userEvent.selectOptions(screen.getByLabelText("Minimum move"), "5");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=10&q=HDFCBANK&tier=small&min=5",
      ),
    );

    // Back to every platform, with the other two filters left alone.
    await userEvent.click(screen.getByRole("button", { name: "All Platform" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=10&tier=small&min=5",
      ),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("platform="))).toBe(false);
  });

  it("does not badge a row with a broker's list, even when the feed still carries one", async () => {
    mockFeed(() =>
      payload("turnover", {
        rows: [row({ brokers: [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 3 }] })],
      }),
    );
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("HDFC Bank Ltd")).closest("li") as HTMLElement;
    // The endpoint still serves the facet for the hero's slide; this board simply never draws it.
    expect(within(card).queryByText("Most bought on Groww #3")).not.toBeInTheDocument();
  });

  it("shows stock shortcuts instead of exchange segment chips", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.getByRole("group", { name: "Popular stock shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Platform" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /HDFC Bank\s+HDFCBANK/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /BSE Z Group/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /BSE SME/ })).not.toBeInTheDocument();
  });

  it("pages through the board and starts page two at the eleventh rank", async () => {
    const fetchMock = mockFeed((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return payload("brokers", { total: 13, page, pages: 2, rows: page === 1 ? BOARDS.brokers : [SME] });
    });
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "Next →" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/trending?rank=turnover&page=2&pageSize=10"),
    );
    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    expect(within(card).getByText("11")).toBeInTheDocument();
  });

  it("tells an unpublished session apart from empty filters", async () => {
    mockFeed((url) => payload(url.searchParams.get("rank") ?? "turnover", { rows: [], total: 0, platforms: [] }));
    render(<BseTrendingBoard />);

    // Every ranking here is read from the same exchange file, so an empty board means one thing.
    expect(await screen.findByText(/hasn't published a complete session file yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "By trade count" }));
    expect(await screen.findByText(/hasn't published a complete session file yet/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Minimum move"), "10");
    expect(await screen.findByText("No traded BSE stock matches those filters this session.")).toBeInTheDocument();
  });

  it("surfaces a feed failure instead of an empty board", async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;

    render(<BseTrendingBoard />);

    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    expect(screen.getByText("Loading BSE…")).toBeInTheDocument();
  });

  it("uses a server-rendered payload without going to the network", async () => {
    const fetchMock = mockFeed();
    const url = "/api/market/bse/trending?rank=turnover&page=1&pageSize=10";

    render(<BseTrendingBoard prefetched={{ url, data: payload("brokers") }} />);

    expect(screen.getByText("HDFC Bank Ltd")).toBeInTheDocument();
    expect(
      screen.getByText("2 of 3 on this page rising · they are 3.5% of the session's traded value across 4,419 scrips."),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
