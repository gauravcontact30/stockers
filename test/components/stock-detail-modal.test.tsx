import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ComparisonTable,
  DETAIL_PERIODS,
  StockDetailModal,
  plotPoints,
  type DetailStock,
  type StockDetail,
} from "../../app/components/stock-detail-modal";
import { StockDetailProvider, StockDetailTrigger, useStockDetail } from "../../app/components/stock-detail-provider";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid="logo">{symbol}</span>,
}));

function stock(overrides: Partial<DetailStock> = {}): DetailStock {
  return {
    code: "500180",
    ticker: "HDFCBANK",
    name: "HDFC Bank Ltd",
    sector: "Financial Services",
    industry: "Banks",
    capTier: "Large",
    group: "A",
    isin: "INE040A01034",
    rank: 3,
    marketCapCr: 1127967,
    price: 732,
    previousClose: 737,
    change: -5,
    changePercent: -0.68,
    open: 733.5,
    dayHigh: 736,
    dayLow: 728.5,
    volume: 1528000,
    turnoverCr: 112,
    trades: 55717,
    returns: { "1w": -2.13, "1m": -10.48, "3m": -6.3, "6m": -22.22, "1y": -62.9, "3y": -55.64, "5y": -50.99 },
    measuredFrom: { "1y": "2025-08-08" },
    trajectory: [
      { period: "5y", date: "2021-08-06", close: 1493.7 },
      { period: "1y", date: "2025-08-08", close: 1973.05 },
      { period: "now", date: null, close: 732 },
    ],
    ...overrides,
  };
}

const PEER = stock({ code: "511218", ticker: "SHRIRAMFIN", name: "Shriram Finance", price: 1115, marketCapCr: 262354 });

function detail(overrides: Partial<StockDetail> = {}): StockDetail {
  return {
    stock: stock(),
    peers: [PEER],
    peerBasis: { category: "Financial Services", capTier: "Large", period: "1y" },
    sessionDate: "2026-08-07",
    note: null,
    ...overrides,
  };
}

function mockDetail(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) }),
  ) as unknown as typeof fetch;
}

describe("plotPoints", () => {
  it("spreads points across the width and inverts y so a higher price sits higher", () => {
    // 100 is the max, so it maps to y=0 (the top); 0 is the min and maps to y=100.
    expect(plotPoints([0, 100])).toBe("0.00,100.00 100.00,0.00");
  });

  it("draws a flat series down the middle rather than dividing by a zero span", () => {
    expect(plotPoints([5, 5, 5])).toBe("0.00,50.00 50.00,50.00 100.00,50.00");
  });

  it("handles the degenerate inputs a short archive can produce", () => {
    expect(plotPoints([])).toBe("");
    expect(plotPoints([42])).toBe("0,50 100,50");
  });
});

describe("ComparisonTable", () => {
  it("puts one metric per row and one company per column, the subject first", () => {
    render(<ComparisonTable stock={stock()} peers={[PEER]} />);

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers[0]).toBe("Metric");
    expect(headers[1]).toContain("HDFCBANK");
    expect(headers[1]).toContain("this");
    expect(headers[2]).toContain("SHRIRAMFIN");

    // Every measured window gets its own row, so the reader compares across rather than down.
    for (const period of DETAIL_PERIODS) {
      expect(screen.getByRole("rowheader", { name: `${period} return` })).toBeInTheDocument();
    }
  });

  it("scales a crore figure back to rupees so the market cap reads correctly", () => {
    render(<ComparisonTable stock={stock()} peers={[]} />);
    const row = screen.getByRole("rowheader", { name: "Market cap" }).closest("tr")!;
    // 11,27,967 crore — not the "₹0.1 L" that passing the crore value straight through produced.
    expect(within(row).getByText("₹11,27,967 Cr")).toBeInTheDocument();
  });

  it("prints a dash for a window the archive cannot reach", () => {
    render(<ComparisonTable stock={stock({ returns: {} })} peers={[]} />);
    const row = screen.getByRole("rowheader", { name: "1y return" }).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("falls back to a dash for an unclassified cap tier and an absent market cap", () => {
    render(<ComparisonTable stock={stock({ capTier: null, marketCapCr: null })} peers={[]} />);
    expect(within(screen.getByRole("rowheader", { name: "Cap tier" }).closest("tr")!).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("rowheader", { name: "Market cap" }).closest("tr")!).getByText("—")).toBeInTheDocument();
  });
});

describe("StockDetailModal", () => {
  it("renders nothing at all until a symbol is chosen", () => {
    const { container } = render(<StockDetailModal symbol={null} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is reading the exchange while the request is in flight", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    expect(screen.getByText("Reading the exchange…")).toBeInTheDocument();
  });

  it("asks the endpoint for the symbol it was given, url-encoded", async () => {
    mockDetail(detail());
    render(<StockDetailModal symbol="M&M" onClose={jest.fn()} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/market/stock-detail?q=M%26M"));
  });

  it("shows the quote, both charts, the session facts and the comparison", async () => {
    mockDetail(detail());
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);

    expect(await screen.findByText("HDFC Bank Ltd")).toBeInTheDocument();
    // The price shows in the header and again in the comparison's Price row.
    expect(screen.getAllByText("₹732.00").length).toBeGreaterThan(0);
    // The sector names the chip and is repeated in the sentence explaining the peer ranking.
    expect(screen.getAllByText("Financial Services").length).toBeGreaterThan(0);
    expect(screen.getByText("BSE session 2026-08-07")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: /Closing price/ })).toBeInTheDocument();
    expect(screen.getByText("Return by window")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("says which population the three were ranked out of", async () => {
    mockDetail(detail());
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    expect(await screen.findByText(/among large-cap companies/)).toBeInTheDocument();
  });

  it("admits when the ranking had to widen beyond the company's own tier", async () => {
    mockDetail(detail({ peerBasis: { category: "Information Technology", capTier: null, period: "1y" } }));
    render(<StockDetailModal symbol="TCS" onClose={jest.fn()} />);
    expect(await screen.findByText(/across every cap tier/)).toBeInTheDocument();
  });

  it("explains an empty comparison instead of showing a bare table", async () => {
    mockDetail(detail({ peers: [], note: "No other company in Energy has a one-year reading yet." }));
    render(<StockDetailModal symbol="RELIANCE" onClose={jest.fn()} />);

    expect(await screen.findByText("No other company in Energy has a one-year reading yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says so rather than drawing a line when the archive has too few points", async () => {
    mockDetail(detail({ stock: stock({ trajectory: [{ period: "now", date: null, close: 732 }] }) }));
    render(<StockDetailModal symbol="NEWLIST" onClose={jest.fn()} />);

    expect(await screen.findByText(/does not reach far enough back/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Closing price/ })).not.toBeInTheDocument();
  });

  it("drops a fact the feed did not carry rather than printing a dash", async () => {
    mockDetail(detail({ stock: stock({ isin: "", trades: null }) }));
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);

    await screen.findByText("HDFC Bank Ltd");
    expect(screen.queryByText("ISIN")).not.toBeInTheDocument();
    expect(screen.queryByText("Trades")).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("draws a rising path in green and states its start and end", async () => {
    mockDetail(
      detail({
        stock: stock({
          trajectory: [
            { period: "5y", date: "2021-08-06", close: 100 },
            { period: "now", date: null, close: 250 },
          ],
        }),
      }),
    );
    render(<StockDetailModal symbol="UPCO" onClose={jest.fn()} />);

    const chart = await screen.findByRole("img", { name: /Closing price from ₹100.00 to ₹250.00/ });
    expect(chart.querySelector("polyline")).toHaveAttribute("stroke", "#059669");
  });

  it("draws a falling path in red", async () => {
    mockDetail(detail());
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);

    const chart = await screen.findByRole("img", { name: /Closing price/ });
    expect(chart.querySelector("polyline")).toHaveAttribute("stroke", "#e11d48");
  });

  it("labels the path's start as 'earliest' when that session has no date", async () => {
    mockDetail(
      detail({
        stock: stock({
          trajectory: [
            { period: "5y", date: null, close: 100 },
            { period: "now", date: null, close: 250 },
          ],
        }),
      }),
    );
    render(<StockDetailModal symbol="UPCO" onClose={jest.fn()} />);
    expect(await screen.findByText(/Price path · earliest/)).toBeInTheDocument();
  });

  it("shows gains and losses on opposite sides of the centre line, and a dash for a missing window", async () => {
    mockDetail(detail({ stock: stock({ returns: { "1w": 12, "1m": -8, "3m": null } }) }));
    render(<StockDetailModal symbol="MIXED" onClose={jest.fn()} />);

    await screen.findByText("Return by window");
    const chart = screen.getByText("Return by window").closest("figure")!;
    expect(within(chart).getByText("+12.00%")).toBeInTheDocument();
    expect(within(chart).getByText("-8.00%")).toBeInTheDocument();
    // Five of the seven windows have no reading in this fixture.
    expect(within(chart).getAllByText("—")).toHaveLength(5);
  });

  it("names the reference session generically when the one-year baseline is unknown", async () => {
    mockDetail(detail({ stock: stock({ measuredFrom: {} }) }));
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    expect(await screen.findByText(/the reference session/)).toBeInTheDocument();
  });

  it("omits the tier and session chips when neither is known", async () => {
    mockDetail(detail({ stock: stock({ sector: null, capTier: null }), sessionDate: null, peerBasis: null }));
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);

    await screen.findByText("HDFC Bank Ltd");
    expect(screen.queryByText("Large cap")).not.toBeInTheDocument();
    expect(screen.queryByText(/BSE session/)).not.toBeInTheDocument();
  });

  it("drops every session fact the feed left empty", async () => {
    mockDetail(
      detail({
        stock: stock({
          open: null,
          dayHigh: null,
          dayLow: null,
          previousClose: null,
          volume: null,
          turnoverCr: null,
          marketCapCr: null,
          rank: null,
          group: "",
        }),
      }),
    );
    render(<StockDetailModal symbol="THIN" onClose={jest.fn()} />);

    await screen.findByText("HDFC Bank Ltd");
    for (const label of ["Open", "Day high", "Day low", "Prev close", "Volume", "Turnover", "Mcap rank", "Group"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // The identifiers that survive are still shown, so the panel is not left blank.
    expect(screen.getByText("Scrip code")).toBeInTheDocument();
  });

  it("surfaces the server's reason for a refusal", async () => {
    mockDetail({ error: 'Nothing listed matches "ZZZZ".' }, false, 404);
    render(<StockDetailModal symbol="ZZZZ" onClose={jest.fn()} />);
    expect(await screen.findByText('Nothing listed matches "ZZZZ".')).toBeInTheDocument();
  });

  it("falls back to its own wording when a refusal carries no reason", async () => {
    mockDetail({}, false, 500);
    render(<StockDetailModal symbol="ZZZZ" onClose={jest.fn()} />);
    expect(await screen.findByText("That company could not be loaded.")).toBeInTheDocument();
  });

  it("reports a network failure", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    expect(await screen.findByText("The exchange feed could not be reached just now.")).toBeInTheDocument();
  });

  it("does not set state from a request that fails after the sheet has gone", async () => {
    // React warns about updating an unmounted component; the `live` flag is what prevents it.
    let rejectIt!: (reason: unknown) => void;
    global.fetch = jest.fn(() => new Promise((_resolve, reject) => { rejectIt = reject; })) as unknown as typeof fetch;

    const { unmount } = render(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    unmount();

    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    rejectIt(new Error("offline"));
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores a slow response for a stock the reader has already navigated away from", async () => {
    // The guard that matters: without it, the first request resolving late would overwrite the
    // second stock's panel with the first stock's data.
    let resolveFirst!: (value: unknown) => void;
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(detail()) });

    const { rerender, unmount } = render(<StockDetailModal symbol="SLOWCO" onClose={jest.fn()} />);
    rerender(<StockDetailModal symbol="HDFCBANK" onClose={jest.fn()} />);
    await screen.findByText("HDFC Bank Ltd");

    resolveFirst({ ok: true, status: 200, json: () => Promise.resolve(detail({ stock: stock({ name: "Slow Co Ltd" }) })) });
    await waitFor(() => expect(screen.getByText("HDFC Bank Ltd")).toBeInTheDocument());
    expect(screen.queryByText("Slow Co Ltd")).not.toBeInTheDocument();
    unmount();
  });
});

describe("StockDetailProvider", () => {
  function Board() {
    const { symbol } = useStockDetail();
    return (
      <>
        <StockDetailTrigger symbol="HDFCBANK">
          <span>HDFCBANK</span>
        </StockDetailTrigger>
        <p>open: {symbol ?? "none"}</p>
      </>
    );
  }

  it("opens the sheet on the company that was clicked", async () => {
    mockDetail(detail());
    const person = userEvent.setup();

    render(
      <StockDetailProvider>
        <Board />
      </StockDetailProvider>,
    );

    expect(screen.getByText("open: none")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "Open details for HDFCBANK" }));

    expect(screen.getByText("open: HDFCBANK")).toBeInTheDocument();
    expect(await screen.findByText("HDFC Bank Ltd")).toBeInTheDocument();
  });

  it("closes again", async () => {
    mockDetail(detail());
    const person = userEvent.setup();

    render(
      <StockDetailProvider>
        <Board />
      </StockDetailProvider>,
    );

    await person.click(screen.getByRole("button", { name: "Open details for HDFCBANK" }));
    await screen.findByText("HDFC Bank Ltd");

    await person.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByText("open: none")).toBeInTheDocument());
  });

  // A board rendered on its own in a test has no provider above it; the trigger must still render
  // and be clickable rather than throwing.
  it("is inert outside a provider instead of throwing", async () => {
    const person = userEvent.setup();
    render(<Board />);

    await person.click(screen.getByRole("button", { name: "Open details for HDFCBANK" }));
    expect(screen.getByText("open: none")).toBeInTheDocument();
  });

  it("offers a no-op close outside a provider too", async () => {
    function Closer() {
      const { close } = useStockDetail();
      return <button type="button" onClick={close}>close it</button>;
    }
    const person = userEvent.setup();
    render(<Closer />);

    await person.click(screen.getByRole("button", { name: "close it" }));
    expect(screen.getByRole("button", { name: "close it" })).toBeInTheDocument();
  });
});
