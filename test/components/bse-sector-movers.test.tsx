import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BseMoverRow } from "../../app/components/bse-movers-board";
import {
  CATEGORIES_PER_PAGE,
  BseSectorMovers,
  CategoryMoverRow,
  buildSectorBoardUrl,
  buildSectorMoversUrl,
  type BseSectorBoardResponse,
} from "../../app/components/bse-sector-movers";

jest.setTimeout(30000);

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
    change: 12,
    changePercent: 0.93,
    dayHigh: 1295,
    dayLow: 1275,
    volume: 250000,
    turnoverCr: 32.5,
    ...overrides,
  };
}

// Alphabetical, the way the endpoint sorts them — and Capital Goods leads with nothing mapped into
// it yet, which is the state every category is in while the classification walk is still running.
const board: BseSectorBoardResponse = {
  sectors: [
    {
      sector: "Capital Goods",
      stocks: 0,
      gainers: 0,
      losers: 0,
      star: 0,
      red: 0,
      house: false,
    },
    {
      sector: "Financial Services",
      stocks: 612,
      gainers: 340,
      losers: 260,
      star: 85,
      red: 52,
      house: false,
    },
    {
      sector: "Forest Materials",
      stocks: 9,
      gainers: 0,
      losers: 9,
      star: 0,
      red: 1,
      house: false,
    },
    {
      sector: "Data Centers",
      stocks: 5,
      gainers: 4,
      losers: 1,
      star: 2,
      red: 0,
      house: true,
    },
    {
      sector: "Information Technology",
      stocks: 210,
      gainers: 90,
      losers: 115,
      star: 22,
      red: 23,
      house: false,
    },
  ],
  unclassified: 118,
  classification: { done: 4949, total: 4949, ready: true },
  sessionDate: "2026-08-05",
};

// The movers inside each category, per direction — the endpoint pages this, so the mock does too.
const CATEGORY_MOVERS: Record<string, BseMoverRow[]> = {
  "Financial Services|gainers": [
    row({ code: "11", ticker: "IDFCFIRSTB", name: "IDFC First Bank Ltd", sector: "Financial Services", changePercent: 12.4 }),
    row({ code: "12", ticker: "UJJIVAN", name: "Ujjivan Small Finance Bank Ltd", sector: "Financial Services", changePercent: 9.1 }),
    row({ code: "13", ticker: "PNB", name: "Punjab National Bank", sector: "Financial Services", changePercent: 6.3 }),
  ],
  "Financial Services|losers": [
    row({ code: "14", ticker: "YESBANK", name: "Yes Bank Ltd", sector: "Financial Services", changePercent: -8.1 }),
  ],
  "Information Technology|gainers": [
    row({ code: "15", ticker: "MASTEK", name: "Mastek Ltd", sector: "Information Technology", changePercent: 5.2 }),
  ],
  "Information Technology|losers": [],
  // The house category: its members are named outright rather than classified by the exchange.
  "Data Centers|gainers": [
    row({ code: "544783", ticker: "E2E", name: "E2E Networks Ltd", sector: "Information Technology", changePercent: 7.4 }),
    row({ code: "543945", ticker: "NETWEB", name: "Netweb Technologies India Ltd", sector: "Information Technology", changePercent: 3.1 }),
  ],
  "Data Centers|losers": [
    row({ code: "543265", ticker: "RAILTEL", name: "RailTel Corporation of India Ltd", sector: "Telecommunication", changePercent: -1.9 }),
  ],
};

const MOCK_PAGE_SIZE = 2;

/** Answers both endpoints: the category summary, and one page of one category's movers. */
function mockFeed(summary: BseSectorBoardResponse = board, ok = true) {
  global.fetch = jest.fn((url: string) => {
    const text = String(url);
    if (!text.startsWith("/api/market/bse/movers")) {
      const params = new URLSearchParams(text.split("?")[1] ?? "");
      const term = (params.get("q") ?? "").toLowerCase();
      const filtered =
        term === ""
          ? summary
          : {
              ...summary,
              sectors: summary.sectors.filter((sector) => {
                if (sector.sector.toLowerCase().includes(term)) return true;
                if (term === "idfcfirstb" || term === "idfc first bank") return sector.sector === "Financial Services";
                if (term === "telecommunication") return sector.sector === "Data Centers";
                return false;
              }),
            };
      return Promise.resolve({ ok, json: () => Promise.resolve(filtered) });
    }

    const params = new URLSearchParams(text.split("?")[1]);
    const key = `${params.get("category")}|${params.get("direction")}`;
    const wanted = Number(params.get("page") ?? 1);
    const all = CATEGORY_MOVERS[key] ?? [];

    return Promise.resolve({
      ok,
      json: () =>
        Promise.resolve({
          rows: all.slice((wanted - 1) * MOCK_PAGE_SIZE, wanted * MOCK_PAGE_SIZE),
          total: all.length,
          page: wanted,
          pageSize: MOCK_PAGE_SIZE,
          pages: Math.max(Math.ceil(all.length / MOCK_PAGE_SIZE), 1),
          sessionDate: "2026-08-05",
        }),
    });
  }) as unknown as typeof fetch;
}

describe("page sizes", () => {
  it("shows ten categories a page, and five stocks a page inside one", () => {
    expect(CATEGORIES_PER_PAGE).toBe(10);
    // The inner boards are paged by the server, so the page size travels in the request.
    expect(buildSectorMoversUrl("Energy", "gainers", 1)).toContain("pageSize=5");
    expect(buildSectorBoardUrl("IDFCFIRSTB", 99)).toBe("/api/market/bse/sectors?q=IDFCFIRSTB&t=99");
  });
});

describe("buildSectorMoversUrl", () => {
  it("asks for one page of one category, in one direction", () => {
    expect(buildSectorMoversUrl("Oil, Gas & Consumable Fuels", "losers", 2)).toBe(
      "/api/market/bse/movers?category=Oil%2C+Gas+%26+Consumable+Fuels&direction=losers&page=2&pageSize=5",
    );
  });
});

describe("CategoryMoverRow", () => {
  it("names the stock and states its move", () => {
    render(
      <ul>
        <CategoryMoverRow row={row()} rank={7} />
      </ul>,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries Ltd")).toBeInTheDocument();
    expect(screen.getByText("₹1,281.00")).toBeInTheDocument();
    expect(screen.getByText("+0.93%")).toBeInTheDocument();
  });
});

/** The collapsible category headers, in the order they are rendered. */
const categoryHeaders = () => screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-expanded"));
const headerNames = () => categoryHeaders().map((header) => header.textContent);

describe("BseSectorMovers", () => {
  it("lists every category with top performers first and its matrix on the row itself", async () => {
    mockFeed();
    render(<BseSectorMovers />);

    expect(await screen.findByText("Financial Services")).toBeInTheDocument();
    expect(screen.getByText("Information Technology")).toBeInTheDocument();
    expect(screen.getByText("5 categories")).toBeInTheDocument();

    // Every category the exchange publishes is listed, including the ones nothing is mapped into.
    expect(screen.getByText("Capital Goods")).toBeInTheDocument();
    expect(screen.getByText("No company mapped yet")).toBeInTheDocument();

    // Alphabetical, with the house category sitting in its place among the exchange's own.
    expect(headerNames()).toEqual([
      expect.stringContaining("Financial Services"),
      expect.stringContaining("Information Technology"),
      expect.stringContaining("Data Centers"),
      expect.stringContaining("Capital Goods"),
      expect.stringContaining("Forest Materials"),
    ]);
    expect(screen.getByText("our grouping")).toBeInTheDocument();

    // Financial Services: 612 stocks · 340 gainers · 260 losers · 85 leading · 52 lagging.
    const financials = within(categoryHeaders()[0]);
    expect(financials.getByText("612")).toBeInTheDocument();
    expect(financials.getByText("340")).toBeInTheDocument();
    expect(financials.getByText("260")).toBeInTheDocument();
    expect(financials.getByText("85")).toBeInTheDocument();
    expect(financials.getByText("52")).toBeInTheDocument();
    expect(financials.getByText("leaders")).toBeInTheDocument();
    expect(financials.getByText("laggards")).toBeInTheDocument();
    expect(financials.getByLabelText("Rank 1")).toBeInTheDocument();
    expect(financials.getByText("#1")).toBeInTheDocument();
    expect(categoryHeaders()[0].querySelector("[data-rank-icon='trophy']")).toBeInTheDocument();

    expect(screen.getByText(/118 traded companies are not in a category yet/)).toBeInTheDocument();
    expect(screen.getByText(/★ leading counts the companies up 5% or more/)).toBeInTheDocument();
  });

  it("opens the first category that has companies in it, showing both sides", async () => {
    mockFeed();
    render(<BseSectorMovers />);

    // The strongest category opens first.
    expect(await screen.findByText("IDFC First Bank Ltd")).toBeInTheDocument();
    expect(screen.getByText("Yes Bank Ltd")).toBeInTheDocument();
    expect(screen.getByText("3 in all")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(buildSectorMoversUrl("Financial Services", "gainers", 1));
    expect(global.fetch).toHaveBeenCalledWith(buildSectorMoversUrl("Financial Services", "losers", 1));

    // The category nobody opened has cost nothing.
    expect(global.fetch).not.toHaveBeenCalledWith(buildSectorMoversUrl("Information Technology", "gainers", 1));
  });

  it("opens another category and closes the one that was open", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.click(screen.getByRole("button", { name: /Information Technology/ }));

    expect(await screen.findByText("Mastek Ltd")).toBeInTheDocument();
    expect(screen.queryByText("IDFC First Bank Ltd")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing in this category closed lower this session.")).toBeInTheDocument();
  });

  // A category where the whole sector fell says so on the gainers side rather than showing nothing.
  it("says when a category had no move in one direction", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.click(screen.getByRole("button", { name: /Forest Materials/ }));

    expect(await screen.findByText("Nothing in this category closed higher this session.")).toBeInTheDocument();
    expect(screen.getByText("Nothing in this category closed lower this session.")).toBeInTheDocument();
  });

  // Opening a category with nothing in it must not send the endpoint a request it cannot answer.
  it("explains an unmapped category instead of asking for its movers", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.click(screen.getByRole("button", { name: /Capital Goods/ }));

    expect(await screen.findByText(/No company has been classified into this category yet/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(buildSectorMoversUrl("Capital Goods", "gainers", 1));
  });

  it("closes a category when its own header is clicked again", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    const header = screen.getByRole("button", { name: /Financial Services/ });
    expect(header).toHaveAttribute("aria-expanded", "true");

    await user.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("IDFC First Bank Ltd")).not.toBeInTheDocument();
  });

  it("pages within a category, with the ranks running on", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    const pager = screen.getByRole("navigation", { name: "gainers pages" });
    await user.click(within(pager).getByRole("button", { name: "Next →" }));

    const third = await screen.findByText("Punjab National Bank");
    expect(screen.queryByText("IDFC First Bank Ltd")).not.toBeInTheDocument();
    expect(within(third.closest("li")!).getByText("3")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(buildSectorMoversUrl("Financial Services", "gainers", 2));
  });

  it("searches the category list down to what was typed", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.type(screen.getByPlaceholderText("Search categories, sectors or stocks"), "data");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/market/bse/sectors?q=data"));
    await waitFor(() => expect(headerNames()).toEqual([expect.stringContaining("Data Centers")]));
    expect(screen.queryByText("Financial Services")).not.toBeInTheDocument();
  });

  it("searches stock details on the backend and keeps the returned category visible", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.type(screen.getByPlaceholderText("Search categories, sectors or stocks"), "IDFCFIRSTB");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/market/bse/sectors?q=IDFCFIRSTB"));
    await waitFor(() => expect(headerNames()).toEqual([expect.stringContaining("Financial Services")]));
  });

  it("reorders the categories and hides the empty ones on request", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    await user.selectOptions(screen.getByLabelText("Sort"), "stocks");
    expect(headerNames()).toEqual([
      expect.stringContaining("Financial Services"),
      expect.stringContaining("Information Technology"),
      expect.stringContaining("Forest Materials"),
      expect.stringContaining("Data Centers"),
      expect.stringContaining("Capital Goods"),
    ]);

    // Each ranking puts a different category on top, which is the point of offering them.
    await user.selectOptions(screen.getByLabelText("Sort"), "gainers");
    expect(headerNames()[0]).toEqual(expect.stringContaining("Financial Services"));

    await user.selectOptions(screen.getByLabelText("Sort"), "losers");
    expect(headerNames()[0]).toEqual(expect.stringContaining("Financial Services"));

    await user.selectOptions(screen.getByLabelText("Sort"), "star");
    expect(headerNames()[0]).toEqual(expect.stringContaining("Financial Services"));
    // Ties break on the name, so the two empty categories stay in a readable order.
    expect(headerNames().slice(-2)).toEqual([
      expect.stringContaining("Capital Goods"),
      expect.stringContaining("Forest Materials"),
    ]);

    await user.selectOptions(screen.getByLabelText("Show"), "mapped");
    expect(headerNames()).toHaveLength(4);
    expect(screen.queryByText("Capital Goods")).not.toBeInTheDocument();
  });

  it("clears the category search and filters at once, and offers to only when something is set", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseSectorMovers />);
    await screen.findByText("IDFC First Bank Ltd");

    const clear = screen.getAllByRole("button", { name: "Clear filters" })[0];
    expect(clear).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Search categories, sectors or stocks"), "zzz");
    expect(clear).toBeEnabled();
    await waitFor(() => expect(screen.getByText("No category matches “zzz”.")).toBeInTheDocument());

    await user.click(clear);

    expect(screen.getByPlaceholderText("Search categories, sectors or stocks")).toHaveValue("");
    expect(screen.getByLabelText("Sort")).toHaveValue("star");
    expect(screen.getByLabelText("Show")).toHaveValue("all");
    await waitFor(() => expect(headerNames()).toHaveLength(5));
  });

  // The walk takes minutes, so a board that showed partial counts as final would be lying.
  it("says how far the classification has got, and can be asked again", async () => {
    const user = userEvent.setup();
    mockFeed({ ...board, classification: { done: 1240, total: 4949, ready: false } });
    render(<BseSectorMovers />);

    expect(await screen.findByText(/Classifying the exchange/)).toBeInTheDocument();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("4,949")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh categories" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/market\/bse\/sectors\?t=\d+/));
    });
  });

  it("says nothing is mapped yet rather than showing an empty page", async () => {
    mockFeed({ ...board, sectors: [], unclassified: 0, classification: { done: 0, total: 4949, ready: false } });
    render(<BseSectorMovers />);

    expect(await screen.findByText(/No category is mapped yet/)).toBeInTheDocument();
    expect(screen.queryByText(/traded companies are not in a category yet/)).not.toBeInTheDocument();
  });

  it("shows a skeleton first and reports a feed failure without blanking the section", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const { container } = render(<BseSectorMovers />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByText("Loading BSE…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Categories are BSE's own sector classification/)).toBeInTheDocument();
  });
});

describe("BseSectorMovers pagination", () => {
  /**
   * The category count line, as one string.
   *
   * Its figures sit in their own spans so they can be emphasised, which means the default text
   * matcher — which only ever sees a single element's own text — cannot match the sentence. This
   * reads the whole paragraph instead, and picks the categories one rather than the gainers and
   * losers pagers inside an open accordion, which start with the same word.
   */
  const showingLine = () =>
    screen
      .getAllByText((_, element) => /^Showing .*categories/.test(element?.textContent ?? ""))
      .filter((element) => element.tagName === "P")[0];

  const many: BseSectorBoardResponse = {
    ...board,
    sectors: Array.from({ length: 23 }, (_, index) => ({
      sector: `Category ${String(index + 1).padStart(2, "0")}`,
      stocks: 10,
      gainers: 6,
      losers: 4,
      star: 1,
      red: 1,
      house: false,
    })),
  };

  it("shows ten categories a page and says which ten they are", async () => {
    mockFeed(many);
    render(<BseSectorMovers />);

    await waitFor(() => expect(showingLine()).toHaveTextContent("Showing 1–10 of 23 categories"));
    expect(screen.getByRole("button", { name: /Category 01/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Category 11/ })).not.toBeInTheDocument();
  });

  it("pages on to the next ten", async () => {
    const user = userEvent.setup();
    mockFeed(many);
    render(<BseSectorMovers />);
    await waitFor(() => expect(showingLine()).toHaveTextContent("Showing 1–10 of 23"));

    await user.click(screen.getByRole("button", { name: "Page 2" }));

    expect(showingLine()).toHaveTextContent("Showing 11–20 of 23");
    expect(screen.getByRole("button", { name: /Category 11/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Category 01/ })).not.toBeInTheDocument();
  });

  it("returns to page one when a search narrows the list under the reader", async () => {
    const user = userEvent.setup();
    mockFeed(many);
    render(<BseSectorMovers />);
    await waitFor(() => expect(showingLine()).toHaveTextContent("Showing 1–10 of 23"));

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(showingLine()).toHaveTextContent("Showing 21–23 of 23");

    // Without the reset key this would leave the reader on an empty page 3.
    await user.type(screen.getByPlaceholderText("Search categories, sectors or stocks"), "Category 0");
    await waitFor(() => expect(showingLine()).toHaveTextContent("Showing 1–9 of 9"));
  });

  it("offers a reset from the empty state and restores the full list", async () => {
    const user = userEvent.setup();
    mockFeed(many);
    render(<BseSectorMovers />);
    await waitFor(() => expect(showingLine()).toHaveTextContent("Showing 1–10 of 23"));

    await user.type(screen.getByPlaceholderText("Search categories, sectors or stocks"), "zzzz");
    await waitFor(() => expect(screen.getByText("No category matches “zzzz”.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Reset search" }));
    expect(showingLine()).toHaveTextContent("Showing 1–10 of 23");
  });

  it("names the filters rather than a search term when only a filter is set", async () => {
    const user = userEvent.setup();
    mockFeed({ ...board, sectors: [{ sector: "Empty", stocks: 0, gainers: 0, losers: 0, star: 0, red: 0, house: false }] });
    render(<BseSectorMovers />);
    await screen.findByRole("button", { name: /Empty/ });

    await user.selectOptions(screen.getByLabelText("Show"), "mapped");
    expect(screen.getByText("No category matches these filters.")).toBeInTheDocument();
  });
});
