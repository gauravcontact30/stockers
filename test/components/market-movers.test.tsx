import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketMovers, formatPrice, sectorTone, type CapMovers } from "../../app/components/market-movers";
import type { CapTier } from "../../app/lib/indian-stocks";

function mover(symbol: string, changePercent: number, sector: string, capTier: CapTier, price: number | null = 100) {
  return { symbol, name: `${symbol} Ltd`, sector, capTier, price, changePercent };
}

const movers: Record<CapTier, CapMovers> = {
  Large: {
    tracked: 72,
    gainers: [mover("DLF", 2.65, "Realty", "Large", 812.4), mover("LT", 1.68, "Infrastructure", "Large")],
    losers: [mover("APOLLOHOSP", -2.27, "Healthcare Services", "Large"), mover("SUNPHARMA", -1.24, "Pharmaceuticals", "Large")],
  },
  Mid: {
    tracked: 119,
    gainers: [mover("NIACL", 8.28, "Insurance", "Mid")],
    losers: [mover("METROBRAND", -5.56, "Retail", "Mid")],
  },
  Small: {
    tracked: 80,
    gainers: [],
    losers: [mover("OIL", -2.49, "Energy", "Small", null)],
  },
};

describe("formatPrice", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(formatPrice(1290.9)).toBe("₹1,290.90");
  });

  it.each([[null], [undefined], [NaN]])("renders a dash for %s", (value) => {
    expect(formatPrice(value as number | null)).toBe("—");
  });
});

describe("sectorTone", () => {
  // Colour must be a pure function of the sector name so the same industry reads identically
  // in every list and across re-renders.
  it("is stable for the same sector and assigns a real tone class", () => {
    expect(sectorTone("Banking")).toBe(sectorTone("Banking"));
    expect(sectorTone("Banking")).toMatch(/^bg-/);
  });

  it("spreads different sectors across more than one tone", () => {
    const sectors = ["Banking", "FMCG", "Realty", "Pharmaceuticals", "Insurance", "Telecom", "Chemicals", "Retail"];
    expect(new Set(sectors.map(sectorTone)).size).toBeGreaterThan(1);
  });

  it("handles an empty sector name without crashing", () => {
    expect(sectorTone("")).toMatch(/^bg-/);
  });
});

describe("MarketMovers", () => {
  it("opens on Large cap and lists its gainers and losers with sector and price", () => {
    render(<MarketMovers movers={movers} />);

    expect(screen.getByText("Top 5 gainers")).toBeInTheDocument();
    expect(screen.getByText("Top 5 losers")).toBeInTheDocument();
    expect(screen.getByText("Ranked within Large Cap · 72 stocks tracked")).toBeInTheDocument();

    const dlf = screen.getByText("DLF").closest("li")!;
    expect(within(dlf).getByText("Realty")).toBeInTheDocument();
    expect(within(dlf).getByText("₹812.40")).toBeInTheDocument();
    expect(within(dlf).getByText("▲ 2.65%")).toBeInTheDocument();
    expect(within(dlf).getByText("1")).toBeInTheDocument();

    const apollo = screen.getByText("APOLLOHOSP").closest("li")!;
    // Losers show the magnitude with a down arrow rather than a bare minus sign.
    expect(within(apollo).getByText("▼ 2.27%")).toBeInTheDocument();
    expect(within(apollo).getByText("Healthcare Services")).toBeInTheDocument();

    expect(screen.queryByText("NIACL")).not.toBeInTheDocument();
  });

  it("switches tiers and shows that tier's movers", async () => {
    const user = userEvent.setup();
    render(<MarketMovers movers={movers} />);

    await user.click(screen.getByRole("tab", { name: "Mid Cap" }));

    expect(screen.getByText("NIACL")).toBeInTheDocument();
    expect(screen.getByText("METROBRAND")).toBeInTheDocument();
    expect(screen.getByText("Ranked within Mid Cap · 119 stocks tracked")).toBeInTheDocument();
    expect(screen.queryByText("DLF")).not.toBeInTheDocument();
  });

  it("marks the active tier tab as selected", async () => {
    const user = userEvent.setup();
    render(<MarketMovers movers={movers} />);

    expect(screen.getByRole("tab", { name: "Large Cap" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Small Cap" })).toHaveAttribute("aria-selected", "false");

    await user.click(screen.getByRole("tab", { name: "Small Cap" }));
    expect(screen.getByRole("tab", { name: "Small Cap" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Large Cap" })).toHaveAttribute("aria-selected", "false");
  });

  // On a day when nothing in a tier is up, the gainers list must say so rather than padding
  // itself with flat or falling stocks.
  it("shows an empty state for a side with no movers, and a dash for a missing price", async () => {
    const user = userEvent.setup();
    render(<MarketMovers movers={movers} />);

    await user.click(screen.getByRole("tab", { name: "Small Cap" }));

    expect(screen.getByText("No advancing stocks in this tier right now.")).toBeInTheDocument();
    expect(within(screen.getByText("OIL").closest("li")!).getByText("—")).toBeInTheDocument();
  });

  it("falls back to empty lists when a tier is missing from the payload", () => {
    render(<MarketMovers movers={{ ...movers, Large: undefined as unknown as CapMovers }} />);
    expect(screen.getByText("No advancing stocks in this tier right now.")).toBeInTheDocument();
    expect(screen.getByText("No declining stocks in this tier right now.")).toBeInTheDocument();
    expect(screen.getByText("Ranked within Large Cap · 0 stocks tracked")).toBeInTheDocument();
  });

  it("applies the caller's classes", () => {
    const { container } = render(<MarketMovers movers={movers} className="test-movers" />);
    expect(container.querySelector(".test-movers")).toBeInTheDocument();
  });
});
