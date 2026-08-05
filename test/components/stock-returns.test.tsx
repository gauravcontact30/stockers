import { render, screen, within } from "@testing-library/react";
import { LiveMarketValue, StockReturns, formatPercent, formatRupees, returnToneClass } from "../../app/components/stock-returns";
import { useStockPerformance } from "../../app/components/use-stock-performance";

jest.mock("../../app/components/use-stock-performance", () => ({
  useStockPerformance: jest.fn(),
}));

const mockUseStockPerformance = useStockPerformance as jest.Mock;

const fullPerformance = {
  symbol: "AAA",
  name: "Alpha Co",
  assetType: "stock" as const,
  capTier: "Large" as const,
  currency: "INR",
  price: 1290.9,
  previousClose: 1319,
  change: -28.1,
  oneDay: -2.13,
  oneWeek: 1.83,
  oneMonth: -1,
  threeMonth: -11.77,
  sixMonth: -11.39,
  oneYear: -8.54,
  threeYear: 2.88,
  fiveYear: 32.96,
  overall: 20356.3,
  overallSince: "1995-12-31",
  live: true,
  asOf: "2026-08-04T09:45:00.000Z",
  source: "Yahoo Finance",
};

const emptyPerformance = {
  ...fullPerformance,
  price: null,
  oneDay: null,
  oneWeek: null,
  oneMonth: null,
  threeMonth: null,
  sixMonth: null,
  oneYear: null,
  threeYear: null,
  fiveYear: null,
  overall: null,
  overallSince: null,
};

describe("formatPercent", () => {
  // Precision is traded away as magnitude grows so every cell keeps the same width.
  it.each([
    [2.5, "+2.50%"],
    [-1.2, "-1.20%"],
    [0, "+0.00%"],
    [150.5, "+150.5%"],
    [-249.55, "-249.6%"],
    [20356.3, "+20356%"],
    [-1000, "-1000%"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  it.each([[null], [undefined], [NaN], [Infinity]])("renders a dash for %s", (value) => {
    expect(formatPercent(value as number | null | undefined)).toBe("—");
  });
});

describe("formatRupees", () => {
  it("formats INR with the rupee sign and Indian digit grouping", () => {
    expect(formatRupees(1290.9)).toBe("₹1,290.90");
  });

  it("prefixes any other currency with its code", () => {
    expect(formatRupees(12.5, "USD")).toBe("USD 12.50");
  });

  it.each([[null], [undefined], [NaN]])("renders a dash for %s", (value) => {
    expect(formatRupees(value as number | null | undefined)).toBe("—");
  });
});

describe("returnToneClass", () => {
  it("colours gains green, losses red, and flat/missing values neutral", () => {
    expect(returnToneClass(1)).toContain("emerald");
    expect(returnToneClass(-1)).toContain("rose");
    expect(returnToneClass(0)).toContain("slate");
    expect(returnToneClass(null)).toContain("slate");
  });
});

describe("StockReturns", () => {
  it("renders all eight periods with the live figures", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    render(<StockReturns symbol="AAA" />);

    ["1D", "1W", "1M", "6M", "1Y", "3Y", "5Y", "Overall"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    expect(screen.getByText("-2.13%")).toBeInTheDocument();
    expect(screen.getByText("+1.83%")).toBeInTheDocument();
    expect(screen.getByText("-1.00%")).toBeInTheDocument();
    expect(screen.getByText("-11.39%")).toBeInTheDocument();
    expect(screen.getByText("-8.54%")).toBeInTheDocument();
    expect(screen.getByText("+2.88%")).toBeInTheDocument();
    expect(screen.getByText("+32.96%")).toBeInTheDocument();
    expect(screen.getByText("+20356%")).toBeInTheDocument();

    // 3M is deliberately absent — the strip shows only the eight horizons on the cards.
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
    expect(screen.queryByText("-11.77%")).not.toBeInTheDocument();
  });

  it("attributes the overall figure to the year it is measured from", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    render(<StockReturns symbol="AAA" />);
    expect(screen.getByText("Overall · since 1995")).toBeInTheDocument();
  });

  // With a heading, the attribution moves up beside it rather than repeating "Overall" below.
  it("moves the since-line into the heading when one is given", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    render(<StockReturns symbol="AAA" label="Returns" />);
    expect(screen.getByText("Returns")).toBeInTheDocument();
    expect(screen.getByText("since 1995")).toBeInTheDocument();
    expect(screen.queryByText("Overall · since 1995")).not.toBeInTheDocument();
  });

  it.each([[undefined], ["Returns"]])("omits the since-line when the listing date is unknown (label: %s)", (label) => {
    mockUseStockPerformance.mockReturnValue({ performance: emptyPerformance, loading: false });
    render(<StockReturns symbol="AAA" label={label} />);
    expect(screen.queryByText(/since/)).not.toBeInTheDocument();
  });

  // Eight across only fits the full-width table; cards fall back to two rows of four.
  it.each([
    [4, "grid-cols-4", false],
    [8, "sm:grid-cols-8", true],
  ])("lays out %s columns", (columns, expectedClass, wide) => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    const { container } = render(<StockReturns symbol="AAA" columns={columns as 4 | 8} />);
    const grid = container.querySelector(".grid")!;
    expect(grid.className).toContain(expectedClass);
    expect(grid.className.includes("sm:grid-cols-8")).toBe(wide);
  });

  it("shows a skeleton per period while loading rather than a misleading zero", () => {
    mockUseStockPerformance.mockReturnValue({ performance: null, loading: true });
    const { container } = render(<StockReturns symbol="AAA" />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(8);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("renders a dash for every period the feed has no data for", () => {
    mockUseStockPerformance.mockReturnValue({ performance: emptyPerformance, loading: false });
    render(<StockReturns symbol="AAA" />);
    expect(screen.getAllByText("—")).toHaveLength(8);
  });

  it("passes through the caller's container classes", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    const { container } = render(<StockReturns symbol="AAA" className="test-wrapper" />);
    expect(container.querySelector(".test-wrapper")).toBeInTheDocument();
  });
});

describe("LiveMarketValue", () => {
  it("shows the live price and today's move", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    const { container } = render(<LiveMarketValue symbol="AAA" fallbackPrice={1} fallbackChangePercent={99} />);
    expect(within(container).getByText("₹1,290.90")).toBeInTheDocument();
    expect(within(container).getByText("-2.13%")).toBeInTheDocument();
  });

  it("falls back to the caller's snapshot until the live quote lands", () => {
    mockUseStockPerformance.mockReturnValue({ performance: null, loading: true });
    render(<LiveMarketValue symbol="AAA" fallbackPrice={100.5} fallbackChangePercent={2.5} />);
    expect(screen.getByText("₹100.50")).toBeInTheDocument();
    expect(screen.getByText("+2.50%")).toBeInTheDocument();
  });

  it("renders dashes when neither the feed nor the caller has a price", () => {
    mockUseStockPerformance.mockReturnValue({ performance: null, loading: false });
    render(<LiveMarketValue symbol="AAA" />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("hides today's move when the host already shows it in its own column", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    render(<LiveMarketValue symbol="AAA" showChange={false} />);
    expect(screen.getByText("₹1,290.90")).toBeInTheDocument();
    expect(screen.queryByText("-2.13%")).not.toBeInTheDocument();
  });

  it("passes through the caller's container classes", () => {
    mockUseStockPerformance.mockReturnValue({ performance: fullPerformance, loading: false });
    const { container } = render(<LiveMarketValue symbol="AAA" className="test-alignment" />);
    expect(container.querySelector(".test-alignment")).toBeInTheDocument();
  });
});
