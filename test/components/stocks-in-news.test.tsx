import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StocksInNews, categoryTone, type StockNewsItem } from "../../app/components/stocks-in-news";

function item(overrides: Partial<StockNewsItem> = {}): StockNewsItem {
  return {
    id: "1",
    symbol: "BEL",
    company: "Bharat Electronics Limited",
    sector: "Capital Goods",
    category: "Shareholders meeting",
    headline: "Bharat Electronics Limited has informed the Exchange regarding Notice of 72nd AGM.",
    documentUrl: "https://nsearchives.nseindia.com/corporate/BEL.pdf",
    publishedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    logo: "https://logo.test/bel.png",
    ...overrides,
  };
}

const board = {
  live: true,
  total: 3,
  sectors: [
    { sector: "Capital Goods", total: 2, items: [item(), item({ id: "2", symbol: "ABB", category: "Financial Results" })] },
    {
      sector: "Telecom",
      total: 1,
      items: [item({ id: "3", symbol: "STLTECH", sector: "Telecom", category: "Credit Rating", documentUrl: null, publishedAt: null })],
    },
  ],
};

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("categoryTone", () => {
  it("gives results, corporate actions, meetings and ratings distinct colours", () => {
    expect(categoryTone("Financial Results")).toContain("emerald");
    expect(categoryTone("Dividend declared")).toContain("amber");
    expect(categoryTone("Bonus issue")).toContain("amber");
    expect(categoryTone("Face Value Split")).toContain("amber");
    expect(categoryTone("Shareholders meeting")).toContain("sky");
    expect(categoryTone("Analysts/Institutional Investor Meet")).toContain("sky");
    expect(categoryTone("Credit Rating")).toContain("violet");
  });

  it("falls back to a neutral tone for anything else", () => {
    expect(categoryTone("General Update")).toContain("slate");
  });
});

describe("StocksInNews", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<StocksInNews />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  // Every announcement is a company's own filing, so the card must link to the original document.
  it("renders each announcement with its logo, category, age and a link to the filing", async () => {
    mockFeed(board);
    render(<StocksInNews />);

    const link = (await screen.findByText("BEL")).closest("a")!;
    expect(link).toHaveAttribute("href", "https://nsearchives.nseindia.com/corporate/BEL.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(link).getByText("Shareholders meeting")).toBeInTheDocument();
    expect(within(link).getByText("20m ago")).toBeInTheDocument();
    expect(within(link).getByText("Bharat Electronics Limited")).toBeInTheDocument();
    expect(within(link).getByAltText("BEL logo")).toBeInTheDocument();
    expect(within(link).getByText("Read the filing ↗")).toBeInTheDocument();

    expect(screen.getByText("3 announcements")).toBeInTheDocument();
  });

  it("renders a plain card, with no link, when NSE supplies no document", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<StocksInNews />);

    await screen.findByText("BEL");
    await user.click(screen.getByRole("tab", { name: /Telecom/ }));

    const row = screen.getByText("STLTECH").closest("li")!;
    expect(row.querySelector("a")).toBeNull();
    expect(within(row).queryByText("Read the filing ↗")).not.toBeInTheDocument();
    // With no timestamp the age chip is dropped rather than rendered empty.
    expect(within(row).queryByText(/ago/)).not.toBeInTheDocument();
  });

  // Most listed companies have no resolvable favicon, so initials are the expected result.
  it("falls back to initials when the logo fails to load", async () => {
    mockFeed(board);
    render(<StocksInNews />);

    const logo = await screen.findByAltText("BEL logo");
    fireEvent.error(logo);
    expect(screen.getByText("BE")).toBeInTheDocument();
  });

  it("shows the empty state when there are no announcements", async () => {
    mockFeed({ sectors: [], total: 0, live: false });
    render(<StocksInNews />);
    expect(await screen.findByText(/No company announcements on the feed right now/)).toBeInTheDocument();
    expect(screen.getByText("0 announcements")).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<StocksInNews />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });
});
