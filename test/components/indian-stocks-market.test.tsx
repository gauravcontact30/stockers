import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndianStocksMarket } from "../../app/components/indian-stocks-market";

type AnyStock = Record<string, unknown>;

function baseStocks(): AnyStock[] {
  return [
    {
      symbol: "RELIANCE",
      name: "Reliance Industries",
      sector: "Energy & Petrochemicals",
      capTier: "Large",
      logo: "https://logo.example/reliance.png",
      price: 2500.5,
      previousClose: 2480.5,
      change: 20,
      changePercent: 0.8,
      dayHigh: 2510,
      dayLow: 2470,
      volume: 12_000_000,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
    {
      symbol: "TCS",
      name: "Tata Consultancy Services",
      sector: "Information Technology",
      capTier: "Large",
      logo: "https://logo.example/tcs.png",
      price: 3800,
      previousClose: 3815,
      change: -15,
      changePercent: -0.5,
      dayHigh: 3820,
      dayLow: 3790,
      volume: 600_000,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
    {
      symbol: "WIPRO",
      name: "Wipro Limited",
      sector: "Information Technology",
      capTier: "Mid",
      logo: "https://logo.example/wipro.png",
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      dayHigh: null,
      dayLow: null,
      volume: null,
      live: false,
      asOf: null,
    },
    {
      symbol: "ZOMATO",
      name: "Zomato Limited",
      sector: "Retail",
      capTier: "Small",
      logo: "https://logo.example/zomato.png",
      price: 210,
      previousClose: 205.5,
      change: 4.5,
      changePercent: 2.1,
      dayHigh: 212,
      dayLow: 204,
      volume: 100,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
  ];
}

function baseSectors() {
  return [
    { key: "energy", name: "Energy & Petrochemicals", description: "Energy sector description." },
    { key: "it", name: "Information Technology", description: "IT sector description." },
    { key: "retail", name: "Retail", description: "Retail sector description." },
  ];
}

function basePredictions(source: "ai" | "heuristic" = "heuristic") {
  return {
    source,
    generatedAt: "2026-08-04T09:00:00.000Z",
    predictions: {
      RELIANCE: { symbol: "RELIANCE", outlook: "Bullish", confidence: 82, note: "Strong momentum" },
      TCS: { symbol: "TCS", outlook: "Bearish", confidence: 61, note: "Weak guidance" },
      WIPRO: { symbol: "WIPRO", outlook: "Neutral", confidence: 50, note: "Mixed signals" },
    },
  };
}

type MockOptions = {
  quotes?: { stocks: AnyStock[]; sectors: unknown[]; liveCount: number; totalCount: number; generatedAt: string | null };
  quotesOk?: boolean;
  quotesReject?: boolean;
  predictions?: ReturnType<typeof basePredictions>;
  predictionsOk?: boolean;
  predictionsReject?: boolean;
  onQuotesCall?: () => void;
};

function installFetchMock(options: MockOptions = {}) {
  const {
    quotes = { stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: "2026-08-04T08:59:00.000Z" },
    quotesOk = true,
    quotesReject = false,
    predictions = basePredictions(),
    predictionsOk = true,
    predictionsReject = false,
    onQuotesCall,
  } = options;

  const fn = jest.fn((url: string) => {
    if (url === "/api/market/quotes") {
      onQuotesCall?.();
      if (quotesReject) return Promise.reject(new Error("network down"));
      return Promise.resolve({ ok: quotesOk, json: () => Promise.resolve(quotes) });
    }
    if (url === "/api/predictions/daily") {
      if (predictionsReject) return Promise.reject(new Error("network down"));
      return Promise.resolve({ ok: predictionsOk, json: () => Promise.resolve(predictions) });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });

  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

async function renderAndFlush(options?: MockOptions, props?: { onSelect?: (symbol: string) => void }) {
  // Unmount any component left over from a previous renderAndFlush call within the same test
  // (e.g. re-rendering with different mock data) so DOM queries below aren't ambiguous.
  cleanup();
  const fetchMock = installFetchMock(options);
  render(<IndianStocksMarket onSelect={props?.onSelect} />);
  // Wait for the initial loading skeleton (8 placeholder rows) to be replaced, which only
  // happens once loadQuotes's finally block has run — i.e. the component has fully settled.
  await waitFor(() => {
    expect(document.querySelectorAll("tbody tr")).not.toHaveLength(8);
  });
  return fetchMock;
}

describe("IndianStocksMarket", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a loading skeleton until the quotes fetch resolves, then renders rows", async () => {
    let resolveQuotes!: (value: unknown) => void;
    global.fetch = jest.fn((url: string) => {
      if (url === "/api/market/quotes") {
        return new Promise((resolve) => {
          resolveQuotes = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basePredictions()) });
    }) as unknown as typeof fetch;

    render(<IndianStocksMarket />);

    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(8);

    resolveQuotes({
      ok: true,
      json: () =>
        Promise.resolve({ stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: null }),
    });

    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
  });

  it("renders live count, formatted prices/volume, and outlook chips for a full dataset", async () => {
    await renderAndFlush();

    expect(screen.getByText("Live · 3/4")).toBeInTheDocument();
    expect(screen.getByText("₹2,500.50")).toBeInTheDocument();
    expect(screen.getByText("+₹20.00")).toBeInTheDocument();
    expect(screen.getByText("▲ 0.80%")).toBeInTheDocument();
    expect(screen.getByText("-₹15.00")).toBeInTheDocument();
    expect(screen.getByText("▼ 0.50%")).toBeInTheDocument();
    expect(screen.getByText("1.20 Cr")).toBeInTheDocument();
    expect(screen.getByText("6.00 L")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    // WIPRO has every numeric field null
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
    expect(screen.getByText("Bullish · 82%")).toBeInTheDocument();
    expect(screen.getByText("Bearish · 61%")).toBeInTheDocument();
    expect(screen.getByText("Neutral · 50%")).toBeInTheDocument();
    expect(screen.getByText("Heuristic demo (no AI key configured)")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4 stocks")).toBeInTheDocument();
  });

  it("shows 'Generated by AI agent' when predictions source is ai", async () => {
    await renderAndFlush({ predictions: basePredictions("ai") });
    expect(screen.getByText("Generated by AI agent")).toBeInTheDocument();
  });

  it("shows 'Feed unavailable' when liveCount is 0", async () => {
    await renderAndFlush({
      quotes: { stocks: baseStocks(), sectors: baseSectors(), liveCount: 0, totalCount: 4, generatedAt: null },
    });
    expect(screen.getByText("Feed unavailable")).toBeInTheDocument();
  });

  it("falls back to an initial letter avatar when a logo image fails to load", async () => {
    await renderAndFlush();
    const img = screen.getByAltText("Reliance Industries logo");
    fireEvent.error(img);
    expect(screen.getByText("R", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the amber error banner when the quotes fetch rejects", async () => {
    await renderAndFlush({ quotesReject: true });
    expect(
      screen.getByText("Couldn't reach the market data feed. Showing the last known values.")
    ).toBeInTheDocument();
  });

  it("shows the amber error banner when the quotes response is not ok", async () => {
    await renderAndFlush({ quotesOk: false });
    expect(
      screen.getByText("Couldn't reach the market data feed. Showing the last known values.")
    ).toBeInTheDocument();
  });

  it("does not show an error banner on a normal successful load", async () => {
    await renderAndFlush();
    expect(
      screen.queryByText("Couldn't reach the market data feed. Showing the last known values.")
    ).not.toBeInTheDocument();
  });

  it("silently ignores a predictions fetch that rejects, and does not show the AI strip", async () => {
    await renderAndFlush({ predictionsReject: true });
    expect(screen.queryByText("AI daily outlook")).not.toBeInTheDocument();
  });

  it("silently ignores a predictions response that is not ok", async () => {
    await renderAndFlush({ predictionsOk: false });
    expect(screen.queryByText("AI daily outlook")).not.toBeInTheDocument();
  });

  it("formats the 'Updated' timestamp for moments-ago, minutes-ago and hours-ago", async () => {
    const momentsAgo = new Date(Date.now() - 10_000).toISOString();
    await renderAndFlush({
      quotes: { stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: momentsAgo },
    });
    expect(screen.getByText("Updated moments ago")).toBeInTheDocument();

    const minutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    await renderAndFlush({
      quotes: { stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: minutesAgo },
    });
    expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();

    const hoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    await renderAndFlush({
      quotes: { stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: hoursAgo },
    });
    expect(screen.getByText("Updated 3h ago")).toBeInTheDocument();
  });

  it("filters rows via the search box, matching on symbol or name and excluding non-matches", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    const search = screen.getByPlaceholderText("Search company or symbol");

    await user.type(search, "TCS");
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Consultancy");
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzzznotfound");
    expect(screen.getByText("No stocks match your filters.")).toBeInTheDocument();
  });

  it("filters by cap tier", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.click(screen.getByRole("button", { name: "Large cap" }));
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.queryByText("WIPRO")).not.toBeInTheDocument();
    expect(screen.queryByText("ZOMATO")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mid cap" }));
    expect(screen.getByText("WIPRO")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Small cap" }));
    expect(screen.getByText("ZOMATO")).toBeInTheDocument();
    expect(screen.queryByText("WIPRO")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All caps" }));
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("WIPRO")).toBeInTheDocument();
  });

  it("filters by sector via the select, and shows the sector summary panel", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.selectOptions(screen.getByDisplayValue("All sectors"), "Energy & Petrochemicals");
    expect(screen.getByText("Energy sector description.")).toBeInTheDocument();
    expect(screen.getByText("1 companies tracked")).toBeInTheDocument();
    expect(screen.getByText("Avg change +0.80%")).toBeInTheDocument();
    expect(screen.queryByText("TCS")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("Energy & Petrochemicals"), "Information Technology");
    expect(screen.getByText("2 companies tracked")).toBeInTheDocument();
    // TCS is the only stock with a non-null changePercent in IT -> negative avg
    expect(screen.getByText("Avg change -0.50%")).toBeInTheDocument();
  });

  it("shows no 'Avg change' line when every stock in the sector has a null changePercent", async () => {
    const user = userEvent.setup();
    const stocks = [
      ...baseStocks(),
      {
        symbol: "POWERCO",
        name: "Power Co",
        sector: "Utilities",
        capTier: "Small",
        logo: "https://logo.example/powerco.png",
        price: 100,
        previousClose: 100,
        change: null,
        changePercent: null,
        dayHigh: null,
        dayLow: null,
        volume: null,
        live: false,
        asOf: null,
      },
    ];
    const sectors = [...baseSectors(), { key: "util", name: "Utilities", description: "Utilities description." }];
    await renderAndFlush({ quotes: { stocks, sectors, liveCount: 3, totalCount: 5, generatedAt: null } });

    await user.selectOptions(screen.getByDisplayValue("All sectors"), "Utilities");
    expect(screen.getByText("Utilities description.")).toBeInTheDocument();
    expect(screen.getByText("1 companies tracked")).toBeInTheDocument();
    expect(screen.queryByText(/Avg change/)).not.toBeInTheDocument();
  });

  it("clears the sector summary when a stale sector filter no longer exists in refreshed metadata", async () => {
    const user = userEvent.setup();
    const fetchMock = await renderAndFlush();

    await user.selectOptions(screen.getByDisplayValue("All sectors"), "Retail");
    expect(screen.getByText("Retail sector description.")).toBeInTheDocument();

    // Refresh returns metadata that no longer includes "Retail" -> sectorFilter stays "Retail"
    // but the meta lookup now misses, exercising the `sectorSummary.meta?.description` branch.
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/market/quotes") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              stocks: baseStocks(),
              sectors: baseSectors().filter((s) => s.name !== "Retail"),
              liveCount: 3,
              totalCount: 4,
              generatedAt: null,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basePredictions()) });
    });

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.queryByText("Retail sector description.")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 companies tracked")).toBeInTheDocument();
  });

  it("filters and sorts the gainers tab, excluding losers and null-change stocks", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.click(screen.getByRole("button", { name: "Gainers" }));
    expect(screen.queryByText("TCS")).not.toBeInTheDocument();
    expect(screen.queryByText("WIPRO")).not.toBeInTheDocument();

    const symbols = screen.getAllByText(/^(RELIANCE|ZOMATO)$/).map((el) => el.textContent);
    // ZOMATO (+2.1%) should sort above RELIANCE (+0.8%)
    expect(symbols).toEqual(["ZOMATO", "RELIANCE"]);
  });

  it("filters and sorts the losers tab, excluding gainers and null-change stocks", async () => {
    const user = userEvent.setup();
    // A second real loser so the sort comparator actually runs (Array#sort skips the callback
    // for single-element arrays), while WIPRO's null changePercent stays in the dataset so the
    // losers filter's own `?? Infinity` fallback (which excludes it) is still exercised.
    const stocks = [
      ...baseStocks(),
      {
        symbol: "YESBANK",
        name: "Yes Bank",
        sector: "Banking",
        capTier: "Mid",
        logo: "https://logo.example/yesbank.png",
        price: 20,
        previousClose: 22,
        change: -2,
        changePercent: -2,
        dayHigh: 22,
        dayLow: 19,
        volume: 200,
        live: true,
        asOf: "2026-08-04T09:00:00.000Z",
      },
    ];
    await renderAndFlush({
      quotes: { stocks, sectors: baseSectors(), liveCount: 4, totalCount: 5, generatedAt: null },
    });

    await user.click(screen.getByRole("button", { name: "Losers" }));
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("ZOMATO")).not.toBeInTheDocument();
    expect(screen.queryByText("WIPRO")).not.toBeInTheDocument();

    const symbols = screen.getAllByText(/^(TCS|YESBANK)$/).map((el) => el.textContent);
    // YESBANK (-2%) is a bigger loser than TCS (-0.5%), so it should sort first.
    expect(symbols).toEqual(["YESBANK", "TCS"]);
  });

  it("sorts the default 'all' tab alphabetically by symbol", async () => {
    await renderAndFlush();
    const symbols = screen.getAllByText(/^(RELIANCE|TCS|WIPRO|ZOMATO)$/).map((el) => el.textContent);
    expect(symbols).toEqual(["RELIANCE", "TCS", "WIPRO", "ZOMATO"]);
  });

  it("resets all filters back to defaults from the empty-results state", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    const search = screen.getByPlaceholderText("Search company or symbol");
    await user.type(search, "nomatch");
    expect(screen.getByText("No stocks match your filters.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("Showing 4 of 4 stocks")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("calls onSelect with the stock symbol when a row is clicked", async () => {
    const onSelect = jest.fn();
    await renderAndFlush(undefined, { onSelect });

    await userEvent.click(screen.getByText("RELIANCE"));
    expect(onSelect).toHaveBeenCalledWith("RELIANCE");
  });

  it("does not throw when a row is clicked and no onSelect handler was provided", async () => {
    await renderAndFlush();
    await expect(userEvent.click(screen.getByText("TCS"))).resolves.not.toThrow();
  });

  it("shows the disabled 'Refreshing…' state while a manual refresh is in flight", async () => {
    await renderAndFlush();

    let resolveRefresh!: (value: unknown) => void;
    global.fetch = jest.fn((url: string) => {
      if (url === "/api/market/quotes") {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basePredictions()) });
    }) as unknown as typeof fetch;

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    await act(async () => {
      await userEvent.click(refreshButton);
    });

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();

    resolveRefresh({
      ok: true,
      json: () =>
        Promise.resolve({ stocks: baseStocks(), sectors: baseSectors(), liveCount: 3, totalCount: 4, generatedAt: null }),
    });

    expect(await screen.findByRole("button", { name: "Refresh" })).not.toBeDisabled();
  });

  it("polls the quotes endpoint again after the refresh interval elapses, and stops polling after unmount", async () => {
    jest.useFakeTimers();
    const onQuotesCall = jest.fn();
    installFetchMock({ onQuotesCall });

    let unmount!: () => void;
    await act(async () => {
      const result = render(<IndianStocksMarket />);
      unmount = result.unmount;
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onQuotesCall).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(onQuotesCall).toHaveBeenCalledTimes(2);

    unmount();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(onQuotesCall).toHaveBeenCalledTimes(2);
  });
});
