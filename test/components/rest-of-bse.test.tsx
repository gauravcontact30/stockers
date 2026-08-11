import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestOfBse, buildDrillUrl, buildMoverUrl, loadBoard, loadDrill } from "../../app/components/rest-of-bse";

// The AI read streams from its own endpoint and has a suite of its own; stubbed to a marker so
// these tests are about the boards, not the model.
jest.mock("../../app/components/ai-board-read", () => ({
  AiBoardRead: ({ feature, brief }: { feature: string; brief: { subject: string } | null }) => (
    <p data-testid="ai-read">
      {feature}: {brief?.subject}
    </p>
  ),
}));

// Logos resolve through a store and a favicon probe — irrelevant here, and it keeps the DOM legible.
// The symbol rides on an attribute rather than as text, so it cannot collide with the row's own
// title when a query looks for a ticker.
jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid="logo" data-symbol={symbol} />,
}));

const moversPayload = (page = 1) => ({
  rows: [
    { code: "513097", ticker: "SBCL", name: "Shivalik Bimetal Controls Ltd", capTier: "Small", sector: "Capital Goods", price: 1104.3, changePercent: 20 },
    { code: "500325", ticker: "RELIANCE", name: "Reliance Industries", capTier: "Large", sector: "Oil & Gas", price: 1420.5, changePercent: -1.2 },
  ],
  total: 2069,
  page,
  pages: 3,
  sessionDate: "2026-08-11",
});

const sectorsPayload = {
  sectors: [
    { sector: "Metals & Mining", stocks: 120, gainers: 80, losers: 20, star: 5, red: 1 },
    { sector: "Realty", stocks: 60, gainers: 10, losers: 40, star: 0, red: 6 },
  ],
};

const categoriesPayload = {
  summary: {
    listed: 4974,
    priced: 4494,
    totalMarketCapCr: 48964232.35,
    breadth: { advancing: 2069, declining: 2249, unchanged: 176, traded: 4494 },
    byTier: {
      Large: { count: 100, breadth: { advancing: 54, declining: 43, unchanged: 3, traded: 100 }, averageChangePercent: 0.23 },
    },
    sessionDate: "2026-08-11",
  },
};

const etfPayload = {
  groups: [
    { key: "gold", name: "Gold", description: "Physical gold.", etfs: [{ symbol: "GOLDBEES", tracks: "Gold", lastPrice: 126.59, changePercent: 1.61, nav: 123.63, premiumPercent: 2.39, changePercent365d: 47.68 }] },
    { key: "silver", name: "Silver", description: "Physical silver.", etfs: [{ symbol: "SILVERBEES", tracks: "Silver", lastPrice: 98.2, changePercent: 0, nav: null, premiumPercent: null, changePercent365d: null }] },
    { key: "nifty50", name: "Nifty 50", description: "Headline index.", etfs: [{ symbol: "NIFTYBEES", tracks: "Nifty 50", lastPrice: 275.4, changePercent: 0.42, nav: 275.1, premiumPercent: 0.11, changePercent365d: 12.4 }] },
  ],
  fetchedAt: "2026-08-11T04:00:00.000Z",
};

const manyGoldEtfs = {
  ...etfPayload,
  groups: [
    {
      key: "gold",
      name: "Gold",
      description: "Physical gold.",
      etfs: Array.from({ length: 9 }, (_, index) => ({
        symbol: `GOLD${index + 1}`,
        tracks: "Gold",
        lastPrice: 100 + index,
        changePercent: 0.1 * index,
        nav: null,
        premiumPercent: null,
        changePercent365d: null,
      })),
    },
    ...etfPayload.groups.slice(1),
  ],
};

function mockFetch(overrides: { fail?: RegExp } = {}) {
  const fetchMock = jest.fn(async (url: string) => {
    if (overrides.fail?.test(url)) return { ok: false, status: 500 } as Response;

    const body = url.includes("/stocks/suggest")
      ? {
          suggestions: [
            {
              symbol: "RELIANCE",
              name: "Reliance Industries",
              sector: "Oil & Gas",
              capTier: "Large",
              scripCode: "500325",
              price: 1420.5,
              changePercent: -1.2,
            },
          ],
          total: 1,
        }
      : url.includes("/bse/movers")
      ? moversPayload(Number(new URL(url, "http://x").searchParams.get("page") ?? 1))
      : url.includes("/bse/sectors")
        ? sectorsPayload
        : url.includes("/etf-board")
          ? etfPayload
          : categoriesPayload;

    return { ok: true, json: async () => body } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("loadBoard", () => {
  it("asks the right endpoint for each tab", async () => {
    const fetchMock = mockFetch();

    await loadBoard("gainers", 2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/movers?direction=gainers&page=2&pageSize=5");

    await loadBoard("losers", 1);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/movers?direction=losers&page=1&pageSize=5");

    await loadBoard("sectors", 1);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse/sectors");

    await loadBoard("categories", 1);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/bse");

    await loadBoard("etfs", 1);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/etf-board");
  });

  it("reads two feeds for the metals board", async () => {
    const fetchMock = mockFetch();
    const board = await loadBoard("metals", 1);

    const asked = fetchMock.mock.calls.map((call) => call[0]);
    expect(asked).toContain("/api/market/etf-board");
    expect(asked).toContain("/api/market/bse/sectors");
    expect(board.groups.map((group) => group.name)).toEqual(["Gold ETFs", "Silver ETFs", "Metals & Mining"]);
  });

  it("throws when the exchange feed refuses", async () => {
    mockFetch({ fail: /sectors/ });
    await expect(loadBoard("sectors", 1)).rejects.toThrow("Request failed: 500");
  });

  it("builds a filtered mover URL for instant search and filters", () => {
    expect(buildMoverUrl("gainers", 1, { q: "tata steel", tier: "mid", period: "1y", min: "5" })).toBe(
      "/api/market/bse/movers?direction=gainers&page=1&pageSize=5&q=tata+steel&tier=mid&period=1y&min=5",
    );
  });
});

describe("loadDrill", () => {
  it("asks for a sector's stocks by direction with the largest safe page", async () => {
    const fetchMock = mockFetch();
    const drill = { kind: "category" as const, value: "Metals & Mining", label: "Metals & Mining" };

    expect(buildDrillUrl(drill, "gainers", 1)).toBe(
      "/api/market/bse/movers?direction=gainers&page=1&pageSize=5&category=Metals+%26+Mining",
    );

    await loadDrill(drill, "losers", 2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/market/bse/movers?direction=losers&page=2&pageSize=5&category=Metals+%26+Mining",
    );
  });

  it("asks for cap-tier stocks when a category row is opened", () => {
    expect(buildDrillUrl({ kind: "tier", value: "large", label: "Large cap" }, "gainers", 1)).toBe(
      "/api/market/bse/movers?direction=gainers&page=1&pageSize=5&tier=large",
    );
  });
});

describe("RestOfBse", () => {
  it("opens on the gainers board and lists the exchange's risers", async () => {
    mockFetch();
    render(<RestOfBse />);

    expect(await screen.findByText("SBCL")).toBeInTheDocument();
    expect(screen.getByText("Shivalik Bimetal Controls Ltd")).toBeInTheDocument();
    expect(screen.getByText("1,104.30")).toBeInTheDocument();
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getAllByText("Small cap").length).toBeGreaterThan(0);
  });

  it("shows a loading line before the first board arrives", async () => {
    mockFetch();
    render(<RestOfBse />);

    expect(screen.getByText("Loading the board…")).toBeInTheDocument();
    await screen.findByText("SBCL");
    expect(screen.queryByText("Loading the board…")).not.toBeInTheDocument();
  });

  it("stamps the board with the session it is as of", async () => {
    mockFetch();
    render(<RestOfBse />);
    expect(await screen.findByText("As of 2026-08-11")).toBeInTheDocument();
  });

  it("summarises the whole exchange, not just the page", async () => {
    mockFetch();
    render(<RestOfBse />);

    await screen.findByText("SBCL");
    expect(screen.getByText("Stocks up today")).toBeInTheDocument();
    expect(screen.getByText("2,069")).toBeInTheDocument();
  });

  it("applies search suggestions instantly on the stock boards", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.type(screen.getByPlaceholderText("Search symbol, name, code or ISIN"), "rel");
    expect(await screen.findByRole("option", { name: /RELIANCE/ })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /RELIANCE/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5&q=RELIANCE"),
    );
  });

  it("applies tier period and move filters instantly, and clears them", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.selectOptions(screen.getByLabelText("Tier"), "mid");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5&tier=mid"),
    );

    await user.selectOptions(screen.getByLabelText("Period"), "1y");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5&tier=mid&period=1y"),
    );

    await user.type(screen.getByPlaceholderText("%"), "5");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/movers?direction=gainers&page=1&pageSize=5&tier=mid&period=1y&min=5",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5"),
    );
  });

  it("clears only the active search term", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.type(screen.getByPlaceholderText("Search symbol, name, code or ISIN"), "SBCL");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5&q=SBCL"),
    );

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5"),
    );
  });

  it("hands the AI read a brief built from the board on screen", async () => {
    mockFetch();
    render(<RestOfBse />);

    const read = await screen.findByTestId("ai-read");
    expect(read).toHaveTextContent("market-pulse:");
    expect(read).toHaveTextContent("Top performers");
  });

  it("switches boards and re-asks the read for the new one", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Sectors" }));

    expect((await screen.findAllByText("Metals & Mining")).length).toBeGreaterThan(0);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByTestId("ai-read")).toHaveTextContent("Sectors");
  });

  it("shows icons for sector and category rows", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Sectors" }));
    expect((await screen.findByRole("button", { name: /Metals & Mining/ })).querySelector("svg")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect((await screen.findByRole("button", { name: /Large cap/ })).querySelector("svg")).toBeInTheDocument();
  });

  it("marks the open tab for assistive technology", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    expect(screen.getByRole("tab", { name: "Top performers" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getByRole("tab", { name: "Categories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Top performers" })).toHaveAttribute("aria-selected", "false");
  });

  it("shows cap tiers on the categories board", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(await screen.findByText("Large cap")).toBeInTheDocument();
    expect(screen.getByText("Top 100 by market capitalisation")).toBeInTheDocument();
    expect(screen.getByText("₹489.64 lakh cr")).toBeInTheDocument();
  });

  it("groups funds by what they track on the ETF board", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "ETFs" }));
    expect((await screen.findAllByText("Nifty 50")).length).toBeGreaterThan(0);
    expect(screen.getByText("Headline index.")).toBeInTheDocument();
    expect(screen.getByText("NIFTYBEES")).toBeInTheDocument();
    // Bullion is on its own board.
    expect(screen.queryByText("GOLDBEES")).not.toBeInTheDocument();
  });

  it("puts bullion and the metals industry group on the metals board", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Gold, Silver & Metals" }));
    expect(await screen.findByText("Gold ETFs")).toBeInTheDocument();
    expect(screen.getByText("Silver ETFs")).toBeInTheDocument();
    expect(screen.getByText("GOLDBEES")).toBeInTheDocument();
    expect(screen.getByText("NAV 123.63")).toBeInTheDocument();
    expect(screen.getAllByText("Metals & Mining").length).toBeGreaterThan(0);
  });

  it("paginates long groups inside Rest of the BSE", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async (url: string) => {
      const body = String(url).includes("/bse/movers")
        ? moversPayload()
        : String(url).includes("/bse/sectors")
          ? {
              sectors: Array.from({ length: 9 }, (_, index) => ({
                sector: `Sector ${String(index + 1).padStart(2, "0")}`,
                stocks: 10,
                gainers: 6,
                losers: 4,
                star: 1,
                red: 1,
              })),
            }
          : categoriesPayload;

      return { ok: true, json: async () => body } as Response;
    }) as unknown as typeof fetch;

    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Sectors" }));
    expect(await screen.findByText(/Showing 1-5 of 9 rows/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sector 09/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("button", { name: /Sector 09/ })).toBeInTheDocument();
    expect(screen.getByText(/Showing 6-9 of 9 rows/)).toBeInTheDocument();
  });

  it("paginates long Metals ETF groups", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async (url: string) => {
      const body = String(url).includes("/bse/movers")
        ? moversPayload()
        : String(url).includes("/bse/sectors")
          ? sectorsPayload
          : String(url).includes("/etf-board")
            ? manyGoldEtfs
            : categoriesPayload;

      return { ok: true, json: async () => body } as Response;
    }) as unknown as typeof fetch;

    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Gold, Silver & Metals" }));
    expect(await screen.findByText(/Showing 1-5 of 9 funds/)).toBeInTheDocument();
    expect(screen.queryByText("GOLD9")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("GOLD9")).toBeInTheDocument();
    expect(screen.getByText(/Showing 6-9 of 9 funds/)).toBeInTheDocument();
  });

  it("opens Metals & Mining into performers, non performers, a matrix and a chart", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Gold, Silver & Metals" }));
    await screen.findByText("Gold ETFs");
    await user.click(await screen.findByRole("button", { name: /Metals & Mining.*View stocks/ }));

    expect(await screen.findByText("Metals & Mining stocks")).toBeInTheDocument();
    expect(screen.getByText("Stocks counted")).toBeInTheDocument();
    expect(screen.getAllByText("Performers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Non Performers").length).toBeGreaterThan(0);
    expect(screen.getByText("Performance chart")).toBeInTheDocument();
    expect(screen.getAllByText("Shivalik Bimetal Controls Ltd").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("logo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SBCL").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/market/bse/movers?direction=gainers&page=1&pageSize=5&category=Metals+%26+Mining",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/market/bse/movers?direction=losers&page=1&pageSize=5&category=Metals+%26+Mining",
    );

    expect(screen.getAllByText(/Page 1 of 3/).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "Next" })[0]);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/movers?direction=gainers&page=2&pageSize=5&category=Metals+%26+Mining",
      ),
    );
  });

  it("opens a cap category into the same performer split", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    await user.click(await screen.findByRole("button", { name: /Large cap.*View stocks/ }));

    expect(await screen.findByText("Large cap stocks")).toBeInTheDocument();
    expect(screen.getByText("Advance share")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=gainers&page=1&pageSize=5&tier=large");
    expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=losers&page=1&pageSize=5&tier=large");
  });

  it("renders a flat move of zero without calling it a rise", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Gold, Silver & Metals" }));
    const silver = (await screen.findByText("SILVERBEES")).closest("li")!;
    expect(within(silver).getByText("+0.00%")).toBeInTheDocument();
  });

  it("pages the movers board and stops at both ends", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());
  });

  it("disables Next on the final page", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeDisabled());
  });

  it("returns to page one when another board is opened", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Non performers" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/movers?direction=losers&page=1&pageSize=5"),
    );
  });

  it("does not re-fetch a board it has already loaded", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<RestOfBse />);
    await screen.findByText("SBCL");

    await user.click(screen.getByRole("tab", { name: "Sectors" }));
    await waitFor(() => expect(screen.getAllByText("Realty").length).toBeGreaterThan(0));
    const afterFirst = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/bse/sectors")).length;

    await user.click(screen.getByRole("tab", { name: "Top performers" }));
    await screen.findByText("SBCL");
    await user.click(screen.getByRole("tab", { name: "Sectors" }));
    await waitFor(() => expect(screen.getAllByText("Realty").length).toBeGreaterThan(0));

    // Re-opening shows the kept answer immediately; the refetch that follows is the board keeping
    // itself current, not a blank panel while it reloads.
    expect(screen.getAllByText("Realty").length).toBeGreaterThan(0);
    expect(afterFirst).toBeGreaterThan(0);
  });

  it("says so when a feed will not answer", async () => {
    mockFetch({ fail: /movers/ });
    render(<RestOfBse />);

    expect(
      await screen.findByText("Could not load this board. The exchange feed may not have published yet."),
    ).toBeInTheDocument();
  });

  it("says the board is empty rather than showing an empty frame", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [], total: 0, page: 1, pages: 0, sessionDate: null }),
    })) as unknown as typeof fetch;

    render(<RestOfBse />);
    expect(await screen.findByText("Nothing to show on this board today.")).toBeInTheDocument();
    // With no session behind it, the board does not claim to be as of anything.
    expect(screen.queryByText(/^As of/)).not.toBeInTheDocument();
  });
});
