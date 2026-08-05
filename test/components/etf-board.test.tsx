import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EtfBoard, premiumLabel, type EtfRow } from "../../app/components/etf-board";

function etf(overrides: Partial<EtfRow> = {}): EtfRow {
  return {
    symbol: "GOLDBEES",
    tracks: "Gold",
    lastPrice: 119.34,
    change: 2.19,
    changePercent: 1.87,
    volume: 27179534,
    turnover: 3238985066.78,
    nav: 117.1225,
    premiumPercent: 1.8933,
    changePercent30d: -0.76,
    changePercent365d: 43.45,
    ...overrides,
  };
}

const boardData = {
  live: true,
  groups: [
    { key: "gold", name: "Gold", description: "Funds holding physical gold, priced off the LBMA spot fix.", etfs: [etf()], totalTurnover: 5.6e9 },
    {
      key: "silver",
      name: "Silver",
      description: "Funds holding physical silver.",
      etfs: [etf({ symbol: "SILVERBEES", tracks: "Domestic price of Silver", premiumPercent: 0.1, changePercent: 2.92 })],
      totalTurnover: 8.8e9,
    },
  ],
};

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("premiumLabel", () => {
  // A fund trading above NAV costs more than the assets behind it — worth flagging, but only
  // once the gap is big enough to matter.
  it("flags a meaningful premium and discount", () => {
    expect(premiumLabel(1.89)).toEqual({ text: "1.89% above NAV", tone: expect.stringContaining("amber") });
    expect(premiumLabel(-1.2)).toEqual({ text: "1.20% below NAV", tone: expect.stringContaining("emerald") });
  });

  it("stays quiet when the fund trades close to NAV", () => {
    expect(premiumLabel(0.1)).toBeNull();
    expect(premiumLabel(-0.49)).toBeNull();
  });

  it("returns null when NAV is unknown", () => {
    expect(premiumLabel(null)).toBeNull();
    expect(premiumLabel(Number.NaN)).toBeNull();
  });
});

describe("EtfBoard", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<EtfBoard />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("renders the first asset class with full per-fund detail", async () => {
    mockFeed(boardData);
    render(<EtfBoard />);

    const card = (await screen.findByText("GOLDBEES")).closest("li")!;
    expect(within(card).getByText("Gold")).toBeInTheDocument();
    expect(within(card).getByText("₹119.34")).toBeInTheDocument();
    expect(within(card).getByText("+1.87%")).toBeInTheDocument();
    expect(within(card).getByText("₹324 Cr")).toBeInTheDocument();
    expect(within(card).getByText("2.72 Cr")).toBeInTheDocument();
    expect(within(card).getByText("₹117.12")).toBeInTheDocument();
    expect(within(card).getByText("+43.45%")).toBeInTheDocument();
    expect(within(card).getByText("Trading 1.89% above NAV")).toBeInTheDocument();

    expect(screen.getByText("Funds holding physical gold, priced off the LBMA spot fix.")).toBeInTheDocument();
    expect(screen.getByText("₹560 Cr traded today")).toBeInTheDocument();
    expect(screen.getByText("2 asset classes")).toBeInTheDocument();
  });

  it("switches asset class on demand", async () => {
    const user = userEvent.setup();
    mockFeed(boardData);
    render(<EtfBoard />);

    await screen.findByText("GOLDBEES");
    await user.click(screen.getByRole("tab", { name: /Silver/ }));

    expect(screen.getByText("SILVERBEES")).toBeInTheDocument();
    expect(screen.queryByText("GOLDBEES")).not.toBeInTheDocument();
    // A fund trading at NAV shows no premium line.
    expect(screen.queryByText(/above NAV/)).not.toBeInTheDocument();
  });

  it("shows the empty state when NSE has published nothing yet", async () => {
    mockFeed({ groups: [], live: false });
    render(<EtfBoard />);
    expect(await screen.findByText(/hasn't published ETF trading data yet/)).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<EtfBoard />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });

  // "Most bought" is turnover, not net inflows — the section must not overstate what it knows.
  it("says plainly that most bought means most money traded", async () => {
    mockFeed(boardData);
    render(<EtfBoard />);
    expect(await screen.findByText(/Net buying versus selling is not published for ETFs/)).toBeInTheDocument();
  });
});
