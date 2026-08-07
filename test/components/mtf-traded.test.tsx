import { render, screen, within } from "@testing-library/react";
import { MtfTraded, mtfBrief } from "../../app/components/mtf-traded";
import type { TradedStock } from "../../app/components/most-traded";

function stock(overrides: Partial<TradedStock> = {}): TradedStock {
  return {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Energy & Petrochemicals",
    lastPrice: 1290.9,
    change: -10.9,
    changePercent: -0.84,
    previousClose: 1301.8,
    open: 1299,
    dayHigh: 1299,
    dayLow: 1285,
    yearHigh: 1608.8,
    yearLow: 1114.85,
    volume: 12000000,
    turnover: 15500000000,
    mtfEligible: true,
    ...overrides,
  };
}

const board = { byVolume: [], byValue: [], mtf: [stock()], mtfUniverseSize: 220, live: true };

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("MtfTraded", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<MtfTraded />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });

  it("renders each eligible stock with price, move, turnover and sector", async () => {
    mockFeed(board);
    render(<MtfTraded />);

    const row = (await screen.findByText("RELIANCE")).closest("li")!;
    expect(within(row).getByText("Reliance Industries")).toBeInTheDocument();
    expect(within(row).getByText("Energy & Petrochemicals")).toBeInTheDocument();
    expect(within(row).getByText("₹1,290.90")).toBeInTheDocument();
    expect(within(row).getByText("-0.84%")).toBeInTheDocument();
    expect(within(row).getByText("₹1,550 Cr")).toBeInTheDocument();
    expect(within(row).getByText("1.20 Cr sh")).toBeInTheDocument();

    expect(screen.getByText("220 eligible stocks")).toBeInTheDocument();
  });

  it("omits the sector pill when the sector is unknown", async () => {
    mockFeed({ ...board, mtf: [stock({ sector: null })] });
    render(<MtfTraded />);

    const row = (await screen.findByText("RELIANCE")).closest("li")!;
    expect(within(row).queryByText("Energy & Petrochemicals")).not.toBeInTheDocument();
  });

  it("explains what MTF is and what it costs", async () => {
    mockFeed(board);
    render(<MtfTraded />);
    expect(await screen.findByText(/How MTF works, and what it costs/)).toBeInTheDocument();
    expect(screen.getByText(/Interest accrues daily/)).toBeInTheDocument();
    expect(screen.getByText(/Losses are leveraged too/)).toBeInTheDocument();
  });

  // The distinction matters: this is most-traded among eligible stocks, not a measure of margin
  // positions, which no broker or exchange publishes.
  it("states plainly that it is not a measure of actual MTF positions", async () => {
    mockFeed(board);
    render(<MtfTraded />);
    expect(
      await screen.findByText(/private broker data that is not published anywhere/),
    ).toBeInTheDocument();
  });

  it("shows an empty state when nothing eligible is active", async () => {
    mockFeed({ ...board, mtf: [] });
    render(<MtfTraded />);
    expect(await screen.findByText(/No MTF-eligible stocks in today's most-active list yet/)).toBeInTheDocument();
    // The eligible universe is a standing list — it doesn't shrink just because nothing eligible
    // was heavily traded today.
    expect(screen.getByText("220 eligible stocks")).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<MtfTraded />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });
});

describe("mtfBrief", () => {
  const rows = [stock({ symbol: "RELIANCE", changePercent: 1.4 }), stock({ symbol: "SBIN", changePercent: -0.5 })];

  it("frames the board around what leverage does to a trend", () => {
    const brief = mtfBrief(rows, 214)!;

    expect(brief.question).toMatch(/leverage magnifies/);
    expect(brief.facts).toContainEqual({ label: "Eligible universe", value: "214 stocks" });
    expect(brief.facts).toContainEqual({ label: "Trading higher", value: "1 of 2" });
    expect(brief.highlights).toHaveLength(2);
  });

  it("labels a stock NSE has not classified", () => {
    expect(mtfBrief([stock({ sector: null })], 1)!.highlights[0]).toMatch(/\(unclassified\)/);
  });

  it("treats a stock with no move as not rising", () => {
    expect(mtfBrief([stock({ changePercent: null })], 1)!.facts).toContainEqual({
      label: "Trading higher",
      value: "0 of 1",
    });
  });

  it("has nothing to read when no eligible stock is active", () => {
    expect(mtfBrief([], 214)).toBeNull();
  });
});
