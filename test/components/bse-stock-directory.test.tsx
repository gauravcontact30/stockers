import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BseStockDirectory, buildDirectoryUrl, type BseDirectoryResponse } from "../../app/components/bse-stock-directory";

type Row = BseDirectoryResponse["rows"][number];

function row(overrides: Partial<Row> = {}): Row {
  return {
    code: "500325",
    ticker: "RELIANCE",
    name: "Reliance Industries Ltd",
    group: "A",
    isin: "INE002A01018",
    capTier: "Large",
    rank: 1,
    marketCapCr: 1733518,
    sector: "Energy",
    industry: "Oil, Gas & Consumable Fuels",
    price: 1281,
    previousClose: 1293,
    change: -12,
    changePercent: -0.93,
    dayHigh: 1295,
    dayLow: 1275,
    volume: 250000,
    turnoverCr: 32.5,
    ...overrides,
  };
}

function page(overrides: Partial<BseDirectoryResponse> = {}): BseDirectoryResponse {
  return {
    rows: [
      row(),
      row({
        code: "532540",
        ticker: "TCS",
        name: "Tata Consultancy Services Ltd",
        rank: null,
        sector: null,
        capTier: null,
        marketCapCr: null,
        price: null,
        changePercent: null,
      }),
    ],
    total: 4946,
    page: 1,
    pageSize: 20,
    pages: 248,
    sessionDate: "2026-08-05",
    ...overrides,
  };
}

/** Records every directory URL the component asks for, answering each with the given payload. */
function mockDirectory(payload: (url: string) => BseDirectoryResponse = () => page()) {
  const urls: string[] = [];
  global.fetch = jest.fn((url: string) => {
    urls.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload(String(url))) });
  }) as unknown as typeof fetch;
  return urls;
}

describe("buildDirectoryUrl", () => {
  it("keeps the query string minimal, omitting an empty search and the default tier", () => {
    expect(buildDirectoryUrl("", "all", "mcap", "desc", 1)).toBe("/api/market/bse/stocks?sort=mcap&direction=desc&page=1");
  });

  it("carries the search term, tier and page when they are set", () => {
    expect(buildDirectoryUrl("tata steel", "Mid", "change", "asc", 3)).toBe(
      "/api/market/bse/stocks?sort=change&direction=asc&page=3&q=tata+steel&tier=Mid",
    );
  });
});

describe("BseStockDirectory", () => {
  it("lists companies with sector, tier, market cap and the session's move", async () => {
    mockDirectory();
    render(<BseStockDirectory />);

    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("4,946 companies")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries Ltd · 500325")).toBeInTheDocument();
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("₹17,33,518 Cr")).toBeInTheDocument();
    expect(screen.getByText("₹1,281.00")).toBeInTheDocument();
    expect(screen.getByText("-0.93%")).toBeInTheDocument();

    // A company the exchange has not classified, and that did not trade, still lists — with
    // dashes standing in for every gap rather than zeroes.
    const tcs = screen.getByText("TCS").closest("tr")!;
    // Sector, tier, market cap, price and the day's move — five gaps, five dashes.
    expect(within(tcs).getAllByText("—")).toHaveLength(5);
    expect(within(tcs).queryByText(/#/)).not.toBeInTheDocument();
  });

  it("debounces typing into a single search request", async () => {
    const user = userEvent.setup();
    const urls = mockDirectory();
    render(<BseStockDirectory />);
    await screen.findByText("RELIANCE");

    await user.type(screen.getByPlaceholderText(/Try RELIANCE/), "infy");

    await waitFor(() => expect(urls.some((url) => url.includes("q=infy"))).toBe(true));
    // Four keystrokes, but only the settled term is fetched — no per-character request.
    expect(urls.filter((url) => url.includes("q="))).toHaveLength(1);
  });

  it("filters by cap tier", async () => {
    const user = userEvent.setup();
    const urls = mockDirectory();
    render(<BseStockDirectory />);
    await screen.findByText("RELIANCE");

    await user.click(screen.getByRole("tab", { name: "Mid cap" }));

    await waitFor(() => expect(urls.some((url) => url.includes("tier=Mid"))).toBe(true));
  });

  it("sorts by a new column descending, and flips direction when the same column is picked again", async () => {
    const user = userEvent.setup();
    const urls = mockDirectory();
    render(<BseStockDirectory />);
    await screen.findByText("RELIANCE");

    await user.click(screen.getByRole("button", { name: /Day change/ }));
    await waitFor(() => expect(urls.some((url) => url.includes("sort=change&direction=desc"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Day change/ }));
    await waitFor(() => expect(urls.some((url) => url.includes("sort=change&direction=asc"))).toBe(true));

    // Names read A-Z by default rather than Z-A, and flip to Z-A on a second click.
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await waitFor(() => expect(urls.some((url) => url.includes("sort=name&direction=asc"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Name/ }));
    await waitFor(() => expect(urls.some((url) => url.includes("sort=name&direction=desc"))).toBe(true));
  });

  it("pages through the directory and stops at both ends", async () => {
    const user = userEvent.setup();
    const urls = mockDirectory((url) => {
      const current = Number(new URL(url, "http://test").searchParams.get("page"));
      return page({ page: current, pages: 2 });
    });
    render(<BseStockDirectory />);
    await screen.findByText("RELIANCE");

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    expect(urls.some((url) => url.includes("page=2"))).toBe(true);

    await user.click(screen.getByRole("button", { name: /Previous/ }));
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeInTheDocument());
  });

  it("hides the pager when everything fits on one page", async () => {
    mockDirectory(() => page({ pages: 1, total: 2 }));
    render(<BseStockDirectory />);
    await screen.findByText("RELIANCE");

    expect(screen.queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
  });

  it("explains an empty result in terms of what was searched for", async () => {
    const user = userEvent.setup();
    mockDirectory(() => page({ rows: [], total: 0, pages: 1 }));
    render(<BseStockDirectory />);

    await user.type(screen.getByPlaceholderText(/Try RELIANCE/), "zzzz");

    expect(await screen.findByText(/No listed company matches “zzzz”/)).toBeInTheDocument();
  });

  it("shows a skeleton first and surfaces a feed failure", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const { container } = render(<BseStockDirectory />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    });
  });
});
