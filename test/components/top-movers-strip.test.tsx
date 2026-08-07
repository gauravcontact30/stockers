import { render, screen, within } from "@testing-library/react";
import { TopMoversStrip } from "../../app/components/top-movers-strip";
import type { Mover } from "../../app/components/market-movers";

function mover(overrides: Partial<Mover> = {}): Mover {
  return {
    symbol: "HINDZINC",
    name: "Hindustan Zinc Ltd",
    sector: "Metals & Mining",
    capTier: "Large",
    price: 595.3,
    changePercent: 5.7,
    ...overrides,
  };
}

describe("TopMoversStrip", () => {
  it("ranks both sides with their sector, cap tier and move", () => {
    render(
      <TopMoversStrip
        gainers={[mover(), mover({ symbol: "NETWEB", name: "Netweb", capTier: "Small", changePercent: 3.2 })]}
        losers={[mover({ symbol: "TCS", name: "Tata Consultancy", sector: "Information Technology", changePercent: -1.23 })]}
      />,
    );

    expect(screen.getByText("Top 3 gainers")).toBeInTheDocument();
    expect(screen.getByText("Top 3 losers")).toBeInTheDocument();

    // Every detail is labelled and on its own line rather than paired across the card's width.
    const winner = screen.getByText("HINDZINC").closest("li")!;
    expect(within(winner).getByText("1")).toBeInTheDocument();
    expect(within(winner).getByText("Hindustan Zinc Ltd")).toBeInTheDocument();
    expect(within(winner).getAllByRole("term").map((label) => label.textContent)).toEqual([
      "Sector",
      "Market cap",
      "Price",
      "Day change",
    ]);
    expect(within(winner).getByText("Metals & Mining")).toBeInTheDocument();
    expect(within(winner).getByText("Large Cap")).toBeInTheDocument();
    expect(within(winner).getByText("₹595.30")).toBeInTheDocument();
    expect(within(winner).getByText("+5.70%")).toBeInTheDocument();

    // A decliner is shown as a negative, never as an unsigned magnitude.
    expect(within(screen.getByText("TCS").closest("li")!).getByText("-1.23%")).toBeInTheDocument();
  });

  it("says which side of the tape was empty", () => {
    render(<TopMoversStrip gainers={[mover()]} losers={[]} />);
    expect(screen.getByText("Nothing declined in the tracked universe today.")).toBeInTheDocument();

    render(<TopMoversStrip gainers={[]} losers={[mover({ changePercent: -2 })]} />);
    expect(screen.getByText("Nothing advanced in the tracked universe today.")).toBeInTheDocument();
  });

  // Before the first breadth reading there is nothing to rank; an empty strip of headings would
  // just be noise above the panel.
  it("renders nothing when neither side has a mover", () => {
    const { container } = render(<TopMoversStrip gainers={[]} losers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
