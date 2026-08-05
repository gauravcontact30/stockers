import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndianEtfsMarket } from "../../app/components/indian-etfs-market";

type AnyEtf = Record<string, unknown>;

function baseEtfs(): AnyEtf[] {
  return [
    {
      symbol: "NIFTYBEES",
      name: "Nippon India ETF Nifty BeES",
      category: "Equity - Broad Market",
      amc: "Nippon India Mutual Fund",
      popular: true,
      logo: "https://logo.example/niftybees.png",
      price: 250.5,
      previousClose: 248.5,
      change: 2,
      changePercent: 0.8,
      dayHigh: 252,
      dayLow: 248,
      volume: 12_000_000,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
    {
      symbol: "BANKBEES",
      name: "Nippon India ETF Bank BeES",
      category: "Equity - Sectoral",
      amc: "Nippon India Mutual Fund",
      popular: false,
      logo: "https://logo.example/bankbees.png",
      price: 500,
      previousClose: 502.5,
      change: -2.5,
      changePercent: -0.5,
      dayHigh: 505,
      dayLow: 498,
      volume: 600_000,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
    {
      symbol: "GOLDBEES",
      name: "Nippon India ETF Gold BeES",
      category: "Gold",
      amc: "Nippon India Mutual Fund",
      popular: false,
      logo: "https://logo.example/goldbees.png",
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
      symbol: "MON100",
      name: "Motilal Oswal Nasdaq 100 ETF",
      category: "International",
      amc: "Motilal Oswal AMC",
      popular: true,
      logo: "https://logo.example/mon100.png",
      price: 120,
      previousClose: 117.5,
      change: 2.5,
      changePercent: 2.1,
      dayHigh: 121,
      dayLow: 116,
      volume: 100,
      live: true,
      asOf: "2026-08-04T09:00:00.000Z",
    },
  ];
}

function baseCategories() {
  return [
    { key: "broad", name: "Equity - Broad Market", description: "Broad market category description." },
    { key: "sectoral", name: "Equity - Sectoral", description: "Sectoral category description." },
    { key: "international", name: "International", description: "International category description." },
  ];
}

function basePredictions(source: "ai" | "heuristic" = "heuristic") {
  return {
    source,
    generatedAt: "2026-08-04T09:00:00.000Z",
    predictions: {
      NIFTYBEES: { symbol: "NIFTYBEES", outlook: "Bullish", confidence: 82, note: "Strong momentum" },
      BANKBEES: { symbol: "BANKBEES", outlook: "Bearish", confidence: 61, note: "Weak guidance" },
      GOLDBEES: { symbol: "GOLDBEES", outlook: "Neutral", confidence: 50, note: "Mixed signals" },
    },
  };
}

type MockOptions = {
  quotes?: { etfs: AnyEtf[]; categories: unknown[]; liveCount: number; totalCount: number; generatedAt: string | null };
  quotesOk?: boolean;
  quotesReject?: boolean;
  predictions?: ReturnType<typeof basePredictions>;
  predictionsOk?: boolean;
  predictionsReject?: boolean;
  onQuotesCall?: () => void;
};

function installFetchMock(options: MockOptions = {}) {
  const {
    quotes = {
      etfs: baseEtfs(),
      categories: baseCategories(),
      liveCount: 3,
      totalCount: 4,
      generatedAt: "2026-08-04T08:59:00.000Z",
    },
    quotesOk = true,
    quotesReject = false,
    predictions = basePredictions(),
    predictionsOk = true,
    predictionsReject = false,
    onQuotesCall,
  } = options;

  const fn = jest.fn((url: string) => {
    if (url === "/api/market/etfs") {
      onQuotesCall?.();
      if (quotesReject) return Promise.reject(new Error("network down"));
      return Promise.resolve({ ok: quotesOk, json: () => Promise.resolve(quotes) });
    }
    if (url === "/api/predictions/etf-daily") {
      if (predictionsReject) return Promise.reject(new Error("network down"));
      return Promise.resolve({ ok: predictionsOk, json: () => Promise.resolve(predictions) });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });

  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

async function renderAndFlush(options?: MockOptions, props?: { onSelect?: (symbol: string) => void }) {
  // Unmount any component left over from a previous renderAndFlush call within the same test.
  cleanup();
  const fetchMock = installFetchMock(options);
  render(<IndianEtfsMarket onSelect={props?.onSelect} />);
  // Wait for the initial loading skeleton (6 placeholder rows) to be replaced, which only
  // happens once loadEtfs's finally block has run — i.e. the component has fully settled.
  await waitFor(() => {
    expect(document.querySelectorAll("tbody tr")).not.toHaveLength(6);
  });
  return fetchMock;
}

describe("IndianEtfsMarket", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a loading skeleton until the etfs fetch resolves, then renders rows", async () => {
    let resolveEtfs!: (value: unknown) => void;
    global.fetch = jest.fn((url: string) => {
      if (url === "/api/market/etfs") {
        return new Promise((resolve) => {
          resolveEtfs = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basePredictions()) });
    }) as unknown as typeof fetch;

    render(<IndianEtfsMarket />);

    const rows = document.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(6);

    resolveEtfs({
      ok: true,
      json: () =>
        Promise.resolve({ etfs: baseEtfs(), categories: baseCategories(), liveCount: 3, totalCount: 4, generatedAt: null }),
    });

    expect(await screen.findByText("NIFTYBEES")).toBeInTheDocument();
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
  });

  it("renders live count, formatted prices/volume, AMC, popular badges, and outlook chips", async () => {
    await renderAndFlush();

    expect(screen.getByText("Live · 3/4")).toBeInTheDocument();
    expect(screen.getByText("₹250.50")).toBeInTheDocument();
    expect(screen.getByText("+₹2.00")).toBeInTheDocument();
    expect(screen.getByText("▲ 0.80%")).toBeInTheDocument();
    expect(screen.getByText("-₹2.50")).toBeInTheDocument();
    expect(screen.getByText("▼ 0.50%")).toBeInTheDocument();
    expect(screen.getByText("1.20 Cr")).toBeInTheDocument();
    expect(screen.getByText("6.00 L")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Popular")).toHaveLength(2); // NIFTYBEES + MON100
    expect(screen.getAllByText("Nippon India Mutual Fund").length).toBeGreaterThan(0);
    expect(screen.getByText("Motilal Oswal AMC")).toBeInTheDocument();
    expect(screen.getByText("Bullish · 82%")).toBeInTheDocument();
    expect(screen.getByText("Bearish · 61%")).toBeInTheDocument();
    expect(screen.getByText("Neutral · 50%")).toBeInTheDocument();
    expect(screen.getByText("Heuristic demo (no AI key configured)")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4 ETFs")).toBeInTheDocument();
  });

  it("shows 'Generated by AI agent' when predictions source is ai", async () => {
    await renderAndFlush({ predictions: basePredictions("ai") });
    expect(screen.getByText("Generated by AI agent")).toBeInTheDocument();
  });

  it("shows 'Feed unavailable' when liveCount is 0", async () => {
    await renderAndFlush({
      quotes: { etfs: baseEtfs(), categories: baseCategories(), liveCount: 0, totalCount: 4, generatedAt: null },
    });
    expect(screen.getByText("Feed unavailable")).toBeInTheDocument();
  });

  it("falls back to an initial letter avatar when a logo image fails to load", async () => {
    await renderAndFlush();
    const img = screen.getByAltText("Nippon India ETF Nifty BeES logo");
    fireEvent.error(img);
    expect(screen.getByText("N", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the amber error banner when the etfs fetch rejects", async () => {
    await renderAndFlush({ quotesReject: true });
    expect(
      screen.getByText("Couldn't reach the market data feed. Showing the last known values.")
    ).toBeInTheDocument();
  });

  it("shows the amber error banner when the etfs response is not ok", async () => {
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
      quotes: { etfs: baseEtfs(), categories: baseCategories(), liveCount: 3, totalCount: 4, generatedAt: momentsAgo },
    });
    expect(screen.getByText("Updated moments ago")).toBeInTheDocument();

    const minutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    await renderAndFlush({
      quotes: { etfs: baseEtfs(), categories: baseCategories(), liveCount: 3, totalCount: 4, generatedAt: minutesAgo },
    });
    expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();

    const hoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    await renderAndFlush({
      quotes: { etfs: baseEtfs(), categories: baseCategories(), liveCount: 3, totalCount: 4, generatedAt: hoursAgo },
    });
    expect(screen.getByText("Updated 3h ago")).toBeInTheDocument();
  });

  it("filters rows via the search box, matching on symbol or name and excluding non-matches", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    const search = screen.getByPlaceholderText("Search ETF or AMC");

    await user.type(search, "BANKBEES");
    expect(screen.getByText("BANKBEES")).toBeInTheDocument();
    expect(screen.queryByText("NIFTYBEES")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Nasdaq");
    expect(screen.getByText("MON100")).toBeInTheDocument();
    expect(screen.queryByText("NIFTYBEES")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzzznotfound");
    expect(screen.getByText("No ETFs match your filters.")).toBeInTheDocument();
  });

  it("filters by category via the select, and shows the category summary panel", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.selectOptions(screen.getByDisplayValue("All categories"), "Equity - Broad Market");
    expect(screen.getByText("Broad market category description.")).toBeInTheDocument();
    expect(screen.getByText("1 ETFs tracked")).toBeInTheDocument();
    expect(screen.getByText("Avg change +0.80%")).toBeInTheDocument();
    expect(screen.queryByText("BANKBEES")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("Equity - Broad Market"), "Equity - Sectoral");
    expect(screen.getByText("1 ETFs tracked")).toBeInTheDocument();
    expect(screen.getByText("Avg change -0.50%")).toBeInTheDocument();
  });

  it("shows no 'Avg change' line when every ETF in the category has a null changePercent", async () => {
    const user = userEvent.setup();
    const etfs = [
      ...baseEtfs(),
      {
        symbol: "SILVERBEES",
        name: "Silver BeES",
        category: "Silver",
        amc: "Nippon India Mutual Fund",
        popular: false,
        logo: "https://logo.example/silverbees.png",
        price: 80,
        previousClose: 80,
        change: null,
        changePercent: null,
        dayHigh: null,
        dayLow: null,
        volume: null,
        live: false,
        asOf: null,
      },
    ];
    const categories = [...baseCategories(), { key: "silver", name: "Silver", description: "Silver category description." }];
    await renderAndFlush({ quotes: { etfs, categories, liveCount: 3, totalCount: 5, generatedAt: null } });

    await user.selectOptions(screen.getByDisplayValue("All categories"), "Silver");
    expect(screen.getByText("Silver category description.")).toBeInTheDocument();
    expect(screen.getByText("1 ETFs tracked")).toBeInTheDocument();
    expect(screen.queryByText(/Avg change/)).not.toBeInTheDocument();
  });

  it("clears the category summary when a stale category filter no longer exists in refreshed metadata", async () => {
    const user = userEvent.setup();
    const fetchMock = await renderAndFlush();

    await user.selectOptions(screen.getByDisplayValue("All categories"), "International");
    expect(screen.getByText("International category description.")).toBeInTheDocument();

    // Refresh returns metadata that no longer includes "International" -> categoryFilter stays
    // "International" but the meta lookup now misses, exercising the
    // `categorySummary.meta?.description` branch.
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/market/etfs") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              etfs: baseEtfs(),
              categories: baseCategories().filter((c) => c.name !== "International"),
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
      expect(screen.queryByText("International category description.")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 ETFs tracked")).toBeInTheDocument();
  });

  it("filters and sorts the gainers tab, excluding losers and null-change ETFs", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.click(screen.getByRole("button", { name: "Gainers" }));
    expect(screen.queryByText("BANKBEES")).not.toBeInTheDocument();
    expect(screen.queryByText("GOLDBEES")).not.toBeInTheDocument();

    const symbols = screen.getAllByText(/^(NIFTYBEES|MON100)$/).map((el) => el.textContent);
    // MON100 (+2.1%) should sort above NIFTYBEES (+0.8%)
    expect(symbols).toEqual(["MON100", "NIFTYBEES"]);
  });

  it("filters and sorts the losers tab, excluding gainers and null-change ETFs", async () => {
    const user = userEvent.setup();
    // A second real loser so the sort comparator actually runs (Array#sort skips the callback
    // for single-element arrays), while GOLDBEES's null changePercent stays in the dataset so
    // the losers filter's own `?? Infinity` fallback (which excludes it) is still exercised.
    const etfs = [
      ...baseEtfs(),
      {
        symbol: "PSUBNKBEES",
        name: "PSU Bank BeES",
        category: "Equity - Sectoral",
        amc: "Nippon India Mutual Fund",
        popular: false,
        logo: "https://logo.example/psubnkbees.png",
        price: 70,
        previousClose: 72,
        change: -2,
        changePercent: -2,
        dayHigh: 72,
        dayLow: 69,
        volume: 200,
        live: true,
        asOf: "2026-08-04T09:00:00.000Z",
      },
    ];
    await renderAndFlush({
      quotes: { etfs, categories: baseCategories(), liveCount: 4, totalCount: 5, generatedAt: null },
    });

    await user.click(screen.getByRole("button", { name: "Losers" }));
    expect(screen.queryByText("NIFTYBEES")).not.toBeInTheDocument();
    expect(screen.queryByText("MON100")).not.toBeInTheDocument();
    expect(screen.queryByText("GOLDBEES")).not.toBeInTheDocument();

    const symbols = screen.getAllByText(/^(BANKBEES|PSUBNKBEES)$/).map((el) => el.textContent);
    // PSUBNKBEES (-2%) is a bigger loser than BANKBEES (-0.5%), so it should sort first.
    expect(symbols).toEqual(["PSUBNKBEES", "BANKBEES"]);
  });

  it("filters to the popular tab", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    await user.click(screen.getByRole("button", { name: "Popular ETFs" }));
    expect(screen.getByText("NIFTYBEES")).toBeInTheDocument();
    expect(screen.getByText("MON100")).toBeInTheDocument();
    expect(screen.queryByText("BANKBEES")).not.toBeInTheDocument();
    expect(screen.queryByText("GOLDBEES")).not.toBeInTheDocument();
  });

  it("sorts the default 'all' tab alphabetically by symbol", async () => {
    await renderAndFlush();
    const symbols = screen.getAllByText(/^(NIFTYBEES|BANKBEES|GOLDBEES|MON100)$/).map((el) => el.textContent);
    expect(symbols).toEqual(["BANKBEES", "GOLDBEES", "MON100", "NIFTYBEES"]);
  });

  it("resets all filters back to defaults from the empty-results state", async () => {
    const user = userEvent.setup();
    await renderAndFlush();

    const search = screen.getByPlaceholderText("Search ETF or AMC");
    await user.type(search, "nomatch");
    expect(screen.getByText("No ETFs match your filters.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("Showing 4 of 4 ETFs")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("calls onSelect with the ETF symbol when a row is clicked", async () => {
    const onSelect = jest.fn();
    await renderAndFlush(undefined, { onSelect });

    await userEvent.click(screen.getByText("NIFTYBEES"));
    expect(onSelect).toHaveBeenCalledWith("NIFTYBEES");
  });

  it("does not throw when a row is clicked and no onSelect handler was provided", async () => {
    await renderAndFlush();
    await expect(userEvent.click(screen.getByText("BANKBEES"))).resolves.not.toThrow();
  });

  it("shows the disabled 'Refreshing…' state while a manual refresh is in flight", async () => {
    await renderAndFlush();

    let resolveRefresh!: (value: unknown) => void;
    global.fetch = jest.fn((url: string) => {
      if (url === "/api/market/etfs") {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basePredictions()) });
    }) as unknown as typeof fetch;

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    await userEvent.click(refreshButton);

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();

    resolveRefresh({
      ok: true,
      json: () =>
        Promise.resolve({ etfs: baseEtfs(), categories: baseCategories(), liveCount: 3, totalCount: 4, generatedAt: null }),
    });

    expect(await screen.findByRole("button", { name: "Refresh" })).not.toBeDisabled();
  });

  it("polls the etfs endpoint again after the refresh interval elapses, and stops polling after unmount", async () => {
    jest.useFakeTimers();
    const onQuotesCall = jest.fn();
    installFetchMock({ onQuotesCall });

    const result = render(<IndianEtfsMarket />);

    expect(await screen.findByText("NIFTYBEES")).toBeInTheDocument();
    expect(onQuotesCall).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(onQuotesCall).toHaveBeenCalledTimes(2);

    result.unmount();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(onQuotesCall).toHaveBeenCalledTimes(2);
  });
});
