import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BreadthBar,
  BseMarketBoard,
  MoverRow,
  advancePercent,
  type BseBoardResponse,
  type BseMoverRow,
} from "../../app/components/bse-market-board";

function row(overrides: Partial<BseMoverRow> = {}): BseMoverRow {
  return {
    code: "500325",
    ticker: "RELIANCE",
    name: "Reliance Industries Ltd",
    group: "A",
    capTier: "Large",
    rank: 1,
    marketCapCr: 1733518,
    sector: "Energy",
    industry: "Oil, Gas & Consumable Fuels",
    price: 1281,
    change: -12,
    changePercent: -0.93,
    dayHigh: 1295,
    dayLow: 1275,
    volume: 250000,
    turnoverCr: 32.5,
    ...overrides,
  };
}

const board: BseBoardResponse = {
  summary: {
    listed: 4947,
    priced: 4395,
    totalMarketCapCr: 48820166,
    breadth: { advancing: 2255, declining: 1947, unchanged: 193, traded: 4395 },
    byTier: {
      Large: { count: 100, breadth: { advancing: 60, declining: 37, unchanged: 3, traded: 100 }, averageChangePercent: 0.55 },
      Mid: { count: 150, breadth: { advancing: 79, declining: 69, unchanged: 2, traded: 150 }, averageChangePercent: 0.35 },
      Small: { count: 4409, breadth: { advancing: 1988, declining: 1789, unchanged: 188, traded: 3965 }, averageChangePercent: 0.34 },
    },
    sessionDate: "2026-08-05",
  },
  movers: {
    all: {
      gainers: [row({ code: "1", ticker: "CHLOGIST", name: "Chartered Logistics Ltd", capTier: "Small", sector: "Services", changePercent: 20 })],
      losers: [row({ code: "2", ticker: "SCARNOSE", name: "Scarnose International Ltd", capTier: "Small", sector: "Consumer Discretionary", changePercent: -19.99 })],
    },
    large: {
      gainers: [row({ code: "3", ticker: "HINDZINC", name: "Hindustan Zinc Ltd", sector: "Commodities", changePercent: 5.7 })],
      losers: [row({ code: "4", ticker: "TCS", name: "Tata Consultancy Services Ltd", sector: "Information Technology", changePercent: -1.23 })],
    },
    mid: {
      gainers: [row({ code: "5", ticker: "HINDCOPPER", capTier: "Mid", sector: "Commodities", changePercent: 8.36 })],
      losers: [],
    },
    small: { gainers: [], losers: [] },
  },
};

function mockFeed(payload: unknown = board, ok = true) {
  global.fetch = jest.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(payload) })) as unknown as typeof fetch;
}

describe("advancePercent", () => {
  it("is the advancing share of everything that traded", () => {
    expect(advancePercent({ advancing: 3, declining: 1, unchanged: 0, traded: 4 })).toBe(75);
  });

  // Before the first session of the day nothing has traded; a 0/0 bar must not be NaN.
  it("is zero when nothing traded", () => {
    expect(advancePercent({ advancing: 0, declining: 0, unchanged: 0, traded: 0 })).toBe(0);
  });
});

describe("BreadthBar", () => {
  it("states both sides of the market and sizes the bar to the advancing share", () => {
    const { container } = render(<BreadthBar breadth={{ advancing: 60, declining: 37, unchanged: 3, traded: 100 }} />);

    expect(screen.getByText("60 advancing")).toBeInTheDocument();
    expect(screen.getByText("37 declining")).toBeInTheDocument();
    expect(screen.getByText("3 unchanged · 100 scrips traded")).toBeInTheDocument();
    expect(container.querySelector("span[style]")).toHaveStyle({ width: "60%" });
  });
});

describe("MoverRow", () => {
  it("shows the rank, identity, sector, cap tier and the day's move", () => {
    render(
      <ul>
        <MoverRow row={row()} rank={4} />
      </ul>,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries Ltd")).toBeInTheDocument();
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Large")).toBeInTheDocument();
    expect(screen.getByText("₹1,281.00")).toBeInTheDocument();
    expect(screen.getByText("-0.93%")).toBeInTheDocument();
    expect(screen.getByText("2.50 L shares")).toBeInTheDocument();
  });

  it("omits the sector chip and tier badge when the exchange classifies neither", () => {
    render(
      <ul>
        <MoverRow row={row({ sector: null, capTier: null })} rank={1} />
      </ul>,
    );

    expect(screen.queryByText("Energy")).not.toBeInTheDocument();
    expect(screen.queryByText("Large")).not.toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
  });
});

describe("BseMarketBoard", () => {
  it("summarises the exchange and lists both sides of the whole-market move", async () => {
    mockFeed();
    render(<BseMarketBoard />);

    expect(await screen.findByText("4,947 listed companies")).toBeInTheDocument();
    expect(screen.getByText("4,395 traded this session")).toBeInTheDocument();
    expect(screen.getByText("₹488.2 lakh Cr")).toBeInTheDocument();
    expect(screen.getByText("100 · 150 · 4,409")).toBeInTheDocument();
    expect(screen.getByText("5 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("2,255 advancing")).toBeInTheDocument();
    expect(screen.getByText("1,947 declining")).toBeInTheDocument();

    expect(screen.getByText("CHLOGIST")).toBeInTheDocument();
    expect(screen.getByText("SCARNOSE")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/market/bse");
  });

  it("switches the movers, breadth and tier average when a cap tier is picked", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMarketBoard />);
    await screen.findByText("CHLOGIST");

    await user.click(screen.getByRole("tab", { name: /Large cap/ }));

    expect(screen.getByText("HINDZINC")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.queryByText("CHLOGIST")).not.toBeInTheDocument();
    // Breadth follows the tier, not the whole exchange.
    expect(screen.getByText("60 advancing")).toBeInTheDocument();
    expect(screen.getByText("+0.55%")).toBeInTheDocument();
  });

  it("says so when a tier has no move in one direction", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMarketBoard />);
    await screen.findByText("CHLOGIST");

    await user.click(screen.getByRole("tab", { name: /Mid cap/ }));

    expect(screen.getByText("HINDCOPPER")).toBeInTheDocument();
    expect(screen.getByText("No stock in this tier closed lower this session.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Small cap/ }));
    expect(screen.getByText("No stock in this tier closed higher this session.")).toBeInTheDocument();
  });

  it("counts each tier on its own pill", async () => {
    mockFeed();
    render(<BseMarketBoard />);
    await screen.findByText("CHLOGIST");

    const tabs = screen.getAllByRole("tab");
    expect(within(tabs[0]).getByText("(4947)")).toBeInTheDocument();
    expect(within(tabs[1]).getByText("(100)")).toBeInTheDocument();
    expect(within(tabs[3]).getByText("(4409)")).toBeInTheDocument();
  });

  it("shows a skeleton first and reports a feed failure without blanking the section", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const { container } = render(<BseMarketBoard />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByText("Loading BSE…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Cap tiers follow SEBI/)).toBeInTheDocument();
  });
});
