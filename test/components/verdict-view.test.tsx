import { render, screen, within } from "@testing-library/react";
import {
  CapBadge,
  VerdictCards,
  ScoreBar,
  SourceNote,
  StanceBadge,
  VerdictStrip,
  type StockVerdict,
} from "../../app/components/verdict-view";

function verdict(overrides: Partial<StockVerdict> = {}): StockVerdict {
  return {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    capTier: "Large",
    price: 2407.9,
    oneDay: -0.5,
    oneWeek: 1.2,
    oneMonth: 17.02,
    sixMonth: -4.3,
    oneYear: -20.59,
    score: 39,
    stance: "Sell",
    rationale: "Momentum has rolled over across every window beyond a month.",
    source: "heuristic",
    ...overrides,
  };
}

describe("StanceBadge", () => {
  it.each([
    ["Buy", "BUY"],
    ["Hold", "HOLD"],
    ["Sell", "SELL"],
  ] as const)("shouts the %s call", (stance, label) => {
    render(<StanceBadge stance={stance} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("has a compact form for tight rows", () => {
    render(<StanceBadge stance="Buy" size="sm" />);
    expect(screen.getByText("BUY")).toHaveClass("text-[10px]");
  });
});

describe("CapBadge", () => {
  it("names the cap tier", () => {
    render(<CapBadge tier="Mid" />);
    expect(screen.getByText("Mid cap")).toBeInTheDocument();
  });

  // An unclassified company should show nothing rather than an empty pill.
  it("renders nothing without a tier", () => {
    const { container } = render(<CapBadge tier={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScoreBar", () => {
  it.each([
    [80, "bg-emerald-500"],
    [50, "bg-amber-500"],
    [20, "bg-rose-500"],
  ])("colours a score of %i by the call it implies", (score, expected) => {
    const { container } = render(<ScoreBar score={score} />);
    const fill = container.querySelector("span[style]")!;
    expect(fill).toHaveClass(expected);
    expect(fill).toHaveStyle({ width: `${score}%` });
    expect(screen.getByText(String(score))).toBeInTheDocument();
  });
});

describe("VerdictStrip", () => {
  it("compresses each call to a card with its month move and score", () => {
    render(<VerdictStrip stocks={[verdict({ stance: "Buy", score: 71 })]} />);

    const card = screen.getByText("TCS").closest("li")!;
    expect(within(card).getByText("BUY")).toBeInTheDocument();
    expect(within(card).getByText("1M +17.02%")).toBeInTheDocument();
    expect(within(card).getByText("71")).toBeInTheDocument();
  });
});

describe("SourceNote", () => {
  it("says when a rationale came from the model", () => {
    render(<SourceNote source="ai" />);
    expect(screen.getByText(/Rationale written by AI agent/)).toBeInTheDocument();
  });

  it("says when it was composed from the numbers instead", () => {
    render(<SourceNote source="heuristic" />);
    expect(screen.getByText(/no AI key configured/)).toBeInTheDocument();
  });
});

describe("VerdictCards", () => {
  it("orders peers strongest first and marks only the two ends of the group", () => {
    render(
      <VerdictCards
        stocks={[
          verdict({ symbol: "MIDDLE", score: 55, stance: "Hold" }),
          verdict({ symbol: "BEST", score: 80, stance: "Buy" }),
          verdict({ symbol: "WORST", score: 20 }),
        ]}
        leader="BEST"
        laggard="WORST"
      />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(cards.map((card) => within(card).getByText(/^(BEST|MIDDLE|WORST)$/).textContent)).toEqual([
      "BEST",
      "MIDDLE",
      "WORST",
    ]);
    expect(within(cards[0]).getByText("Leads the group")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Trails the group")).toBeInTheDocument();
    // The middle of a group is neither end, so it carries no note.
    expect(within(cards[1]).queryByText(/the group/)).not.toBeInTheDocument();
  });

  it("lays out a card for an unclassified company without an empty sector chip", () => {
    render(<VerdictCards stocks={[verdict({ sector: null })]} />);

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("TCS")).toBeInTheDocument();
    expect(within(card).getByText("₹2,407.90")).toBeInTheDocument();
    expect(within(card).queryByText("Information Technology")).not.toBeInTheDocument();
    expect(within(card).queryByText(/the group/)).not.toBeInTheDocument();
  });
});
