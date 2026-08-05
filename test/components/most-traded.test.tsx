import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MostTraded, TradedRow, yearBandPosition, type TradedStock } from "../../app/components/most-traded";

function stock(overrides: Partial<TradedStock> = {}): TradedStock {
  return {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    sector: "Banking",
    lastPrice: 735,
    change: -7,
    changePercent: -0.94,
    previousClose: 742,
    open: 733.8,
    dayHigh: 741.95,
    dayLow: 732.6,
    yearHigh: 1020.5,
    yearLow: 726.65,
    volume: 60050538,
    turnover: 44209806580.98,
    mtfEligible: true,
    ...overrides,
  };
}

const board = {
  byValue: [stock()],
  byVolume: [stock({ symbol: "OLAELEC", name: "Ola Electric", sector: null, mtfEligible: false, changePercent: 7.6, change: 2.93, lastPrice: 41.5 })],
  mtf: [],
  mtfUniverseSize: 220,
  live: true,
};

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("yearBandPosition", () => {
  it("maps the price onto its place in the 52-week band", () => {
    expect(yearBandPosition(50, 0, 100)).toBe(50);
  });

  it("clamps a price reported outside its own band", () => {
    expect(yearBandPosition(150, 0, 100)).toBe(100);
    expect(yearBandPosition(-10, 0, 100)).toBe(0);
  });

  it("returns null when the band cannot be drawn honestly", () => {
    expect(yearBandPosition(null, 0, 100)).toBeNull();
    expect(yearBandPosition(50, null, 100)).toBeNull();
    expect(yearBandPosition(50, 0, null)).toBeNull();
    expect(yearBandPosition(50, 100, 100)).toBeNull();
  });
});

describe("TradedRow", () => {
  it("renders a single row standalone, carrying its rank", () => {
    render(
      <ul>
        <TradedRow stock={stock()} rank={7} />
      </ul>,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("HDFCBANK")).toBeInTheDocument();
    expect(screen.getByText("₹735.00")).toBeInTheDocument();
  });
});

describe("MostTraded", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<MostTraded />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("renders full detail for each stock and defaults to the turnover ranking", async () => {
    mockFeed(board);
    render(<MostTraded />);

    const row = (await screen.findByText("HDFCBANK")).closest("li")!;
    expect(within(row).getByText("HDFC Bank")).toBeInTheDocument();
    expect(within(row).getByText("Banking")).toBeInTheDocument();
    expect(within(row).getByText("MTF")).toBeInTheDocument();
    expect(within(row).getByText("₹735.00")).toBeInTheDocument();
    expect(within(row).getByText("-0.94%")).toBeInTheDocument();
    expect(within(row).getByText("₹-7.00")).toBeInTheDocument();
    expect(within(row).getByText("₹4,421 Cr")).toBeInTheDocument();
    expect(within(row).getByText("6.01 Cr")).toBeInTheDocument();
    expect(within(row).getByText("₹732.60 – ₹741.95")).toBeInTheDocument();
    expect(within(row).getByText("₹742.00")).toBeInTheDocument();
    expect(within(row).getByText("52w low ₹726.65")).toBeInTheDocument();
    expect(within(row).getByText("52w high ₹1,020.50")).toBeInTheDocument();
    expect(screen.getByText("1 most active")).toBeInTheDocument();
  });

  it("switches to the volume ranking on demand", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<MostTraded />);

    await screen.findByText("HDFCBANK");
    await user.click(screen.getByRole("tab", { name: /By volume/ }));

    expect(screen.getByText("OLAELEC")).toBeInTheDocument();
    expect(screen.queryByText("HDFCBANK")).not.toBeInTheDocument();
    // A stock with no known sector and no MTF eligibility renders neither pill.
    expect(screen.queryByText("Banking")).not.toBeInTheDocument();
    expect(screen.queryByText("MTF")).not.toBeInTheDocument();
  });

  // A stock missing its 52-week band must not render an empty or full bar implying a real level.
  it("omits the 52-week bar when the band is unknown", async () => {
    mockFeed({ ...board, byValue: [stock({ yearHigh: null, yearLow: null })] });
    render(<MostTraded />);

    const row = (await screen.findByText("HDFCBANK")).closest("li")!;
    expect(within(row).queryByText(/52w low/)).not.toBeInTheDocument();
  });

  it("explains the empty state when NSE has published nothing yet", async () => {
    mockFeed({ ...board, byValue: [], byVolume: [] });
    render(<MostTraded />);
    expect(await screen.findByText(/hasn't published a most-active list yet/)).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<MostTraded />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });

  // The section must not imply it has Groww's private order flow.
  it("says the ranking is exchange-wide, not one broker's list", async () => {
    mockFeed(board);
    render(<MostTraded />);
    expect(await screen.findByText(/Groww does not publish its own most-traded list/)).toBeInTheDocument();
  });
});
