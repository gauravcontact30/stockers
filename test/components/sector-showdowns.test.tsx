import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectorShowdowns, stanceTally, type ShowdownResult, type ShowdownsResponse } from "../../app/components/sector-showdowns";
import type { StockVerdict } from "../../app/components/verdict-view";

function stock(overrides: Partial<StockVerdict> = {}): StockVerdict {
  return {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    capTier: "Large",
    price: 2407.9,
    oneDay: -0.5,
    oneWeek: 1.2,
    oneMonth: 17,
    sixMonth: -4.3,
    oneYear: -20.6,
    score: 39,
    stance: "Sell",
    rationale: "Down over every window beyond a month.",
    source: "ai",
    ...overrides,
  };
}

const itMajors: ShowdownResult = {
  id: "it-majors",
  sector: "Information Technology",
  title: "The IT majors",
  premise: "India's four largest IT services exporters.",
  stocks: [stock(), stock({ symbol: "HCLTECH", name: "HCL Technologies", score: 46, stance: "Hold" })],
  leader: "HCLTECH",
  laggard: "TCS",
  takeaway: "In Information Technology the whole group is under pressure: HCLTECH leads the peer set and TCS trails it.",
};

const dataCenters: ShowdownResult = {
  id: "data-centers",
  sector: "Data Centers",
  title: "Data centre build-out",
  premise: "The listed ways to own India's digital-infrastructure boom.",
  stocks: [
    stock({ symbol: "NETWEB", name: "Netweb Technologies India", sector: "Data Centers", capTier: "Small", score: 100, stance: "Buy" }),
    stock({ symbol: "RAILTEL", name: "RailTel Corporation", sector: "Data Centers", capTier: "Small", score: 33, stance: "Sell" }),
  ],
  leader: "NETWEB",
  laggard: "RAILTEL",
  takeaway: "In Data Centers the group is splitting: NETWEB leads the peer set and RAILTEL trails it.",
};

function mockFeed(payload: ShowdownsResponse = { showdowns: [itMajors, dataCenters] }, ok = true) {
  global.fetch = jest.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(payload) })) as unknown as typeof fetch;
}

describe("stanceTally", () => {
  it("counts how many peers carry each call", () => {
    expect(stanceTally([stock({ stance: "Buy" }), stock({ stance: "Buy" }), stock({ stance: "Hold" })])).toEqual({
      Buy: 2,
      Hold: 1,
      Sell: 0,
    });
  });
});

describe("SectorShowdowns", () => {
  it("opens on the first board, naming its sector, verdict mix and peers", async () => {
    mockFeed();
    render(<SectorShowdowns />);

    expect(await screen.findByText("The IT majors")).toBeInTheDocument();
    const summary = screen.getByText(/HCLTECH leads the peer set/).closest("div")!;
    expect(within(summary).getByText("Information Technology")).toBeInTheDocument();
    expect(screen.getByText(/HCLTECH leads the peer set/)).toBeInTheDocument();
    expect(screen.getByText("India's four largest IT services exporters.")).toBeInTheDocument();

    // Both peers, each with its cap tier and call.
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText("HCLTECH")).toBeInTheDocument();
    expect(screen.getAllByText("Large cap")).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith("/api/compare/sectors");
  });

  it("tallies only the calls that actually appear", async () => {
    mockFeed();
    render(<SectorShowdowns />);
    await screen.findByText("The IT majors");

    // This board is one Underperform and one Hold, so no Buy tally should be drawn.
    const summary = screen.getByText(/HCLTECH leads the peer set/).closest("div")!;
    expect(within(summary).getByText("UNDERPERFORM")).toBeInTheDocument();
    expect(within(summary).getByText("HOLD")).toBeInTheDocument();
    expect(within(summary).queryByText("BUY")).not.toBeInTheDocument();
  });

  it("switches boards, including the data-centre peers", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<SectorShowdowns />);
    await screen.findByText("The IT majors");

    await user.click(screen.getByRole("tab", { name: "Data centre build-out" }));

    const summary = screen.getByText(/NETWEB leads the peer set/).closest("div")!;
    expect(within(summary).getByText("Data Centers")).toBeInTheDocument();
    expect(screen.getByText("NETWEB")).toBeInTheDocument();
    expect(screen.getByText("RAILTEL")).toBeInTheDocument();
    expect(screen.getAllByText("Small cap")).toHaveLength(2);
    expect(screen.queryByText("HCLTECH")).not.toBeInTheDocument();
  });

  it("gives each peer its own card, strongest first, and marks the ends of the group", async () => {
    mockFeed();
    render(<SectorShowdowns />);
    await screen.findByText("The IT majors");

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    // HCLTECH scores higher, so it leads the order regardless of the payload's order.
    expect(within(cards[0]).getByText("HCLTECH")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Leads the group")).toBeInTheDocument();
    expect(within(cards[1]).getByText("TCS")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Trails the group")).toBeInTheDocument();

    // Every window is labelled on the card rather than left to a column header.
    expect(within(cards[0]).getByText("Price")).toBeInTheDocument();
    expect(within(cards[0]).getByText("1Y")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Down over every window beyond a month.")).toBeInTheDocument();
  });

  it("credits the model when it wrote the rationales", async () => {
    mockFeed();
    render(<SectorShowdowns />);
    await screen.findByText("The IT majors");

    expect(screen.getByText(/Rationale written by AI agent/)).toBeInTheDocument();
  });

  it("shows a skeleton first, then reports a failed feed", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const { container } = render(<SectorShowdowns />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByText("5 sector boards")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/Couldn't reach the market data feed/)).toBeInTheDocument());
    // With nothing scored, the footnote falls back to the computed-rationale wording.
    expect(screen.getByText(/no AI key configured/)).toBeInTheDocument();
  });

  it("handles a board that came back with no peers", async () => {
    mockFeed({ showdowns: [{ ...itMajors, stocks: [], leader: null, laggard: null, takeaway: "Nothing to separate them." }] });
    render(<SectorShowdowns />);

    expect(await screen.findByText("Nothing to separate them.")).toBeInTheDocument();
    expect(screen.queryByText("TCS")).not.toBeInTheDocument();
  });
});
