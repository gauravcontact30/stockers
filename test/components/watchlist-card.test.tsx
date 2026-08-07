import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MAX_WATCHED,
  STARTER_WATCHLIST,
  WatchRow,
  WatchlistCard,
  parseWatchlist,
} from "../../app/components/watchlist-card";
import { indianStocks } from "../../app/lib/indian-stocks";

const STORAGE_KEY = "stockers-watchlist";

// Every row asks the batched performance endpoint for its own returns. It is a GET with the
// symbols in the query string, and the hook memoises results for the session — so each test
// below watches a different ticker rather than fighting that cache.
function mockPerformance(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn(async (url: string) => {
    const symbols = new URL(url, "http://localhost").searchParams.get("symbols")?.split(",") ?? [];
    return {
      ok: true,
      json: async () => ({
        results: symbols.map((symbol) => ({
          symbol,
          name: symbol,
          assetType: "stock",
          capTier: "Large",
          currency: "INR",
          price: 1234.5,
          previousClose: 1200,
          change: 34.5,
          oneDay: 2.88,
          oneWeek: 1,
          oneMonth: 4.2,
          threeMonth: 6,
          sixMonth: 12.5,
          oneYear: 27.4,
          threeYear: 40,
          fiveYear: 60,
          overall: 60,
          overallSince: "2021-01-01",
          live: true,
          asOf: "2026-08-05T10:00:00.000Z",
          source: "test",
          ...overrides,
        })),
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.localStorage.clear();
  mockPerformance();
});

describe("parseWatchlist", () => {
  it("reads a stored list of known tickers", () => {
    expect(parseWatchlist(JSON.stringify(["RELIANCE", "TCS"]))).toEqual(["RELIANCE", "TCS"]);
  });

  it("treats nothing stored as an empty list", () => {
    expect(parseWatchlist(null)).toEqual([]);
    expect(parseWatchlist("")).toEqual([]);
  });

  // A hand-edited entry must not take the card down with it.
  it("survives malformed JSON and a non-array payload", () => {
    expect(parseWatchlist("{not json")).toEqual([]);
    expect(parseWatchlist(JSON.stringify({ RELIANCE: true }))).toEqual([]);
  });

  // A ticker that has since left the catalogue would render a row with no name and no returns.
  it("drops entries the catalogue no longer knows, and anything that is not a string", () => {
    expect(parseWatchlist(JSON.stringify(["RELIANCE", "NOTALISTEDCO", 42, null]))).toEqual(["RELIANCE"]);
  });

  it("de-duplicates and caps the list", () => {
    expect(parseWatchlist(JSON.stringify(["TCS", "TCS"]))).toEqual(["TCS"]);
    const many = indianStocks.slice(0, MAX_WATCHED + 5).map((stock) => stock.symbol);
    expect(parseWatchlist(JSON.stringify(many))).toHaveLength(MAX_WATCHED);
  });
});

describe("WatchRow", () => {
  it("shows the price, the day's move and three return windows", async () => {
    render(
      <ul>
        <WatchRow symbol="RELIANCE" onRemove={jest.fn()} />
      </ul>,
    );

    expect(await screen.findByText("₹1,234.50")).toBeInTheDocument();
    expect(screen.getByText("+2.88%")).toBeInTheDocument();
    expect(screen.getByText("+4.20%")).toBeInTheDocument();
    expect(screen.getByText("+12.50%")).toBeInTheDocument();
    expect(screen.getByText("+27.40%")).toBeInTheDocument();
    expect(screen.getByText(/Energy & Petrochemicals · Large cap/)).toBeInTheDocument();
  });

  // A missing figure is a dash, never a zero that reads as "flat".
  it("dashes a window the feed has no number for", async () => {
    mockPerformance({ price: null, oneDay: null, oneMonth: null, sixMonth: null, oneYear: null });
    render(
      <ul>
        <WatchRow symbol="ITC" onRemove={jest.fn()} />
      </ul>,
    );

    // Waits for the feed to land: while it is in flight the row shows an ellipsis, not a dash.
    expect((await screen.findAllByText("—")).length).toBeGreaterThanOrEqual(4);
  });

  it("colours a fall differently from a rise", async () => {
    mockPerformance({ oneYear: -18.4 });
    render(
      <ul>
        <WatchRow symbol="SBIN" onRemove={jest.fn()} />
      </ul>,
    );

    const fall = await screen.findByText("−18.40%");
    expect(fall.className).toContain("rose");
  });

  it("removes itself on request", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <ul>
        <WatchRow symbol="RELIANCE" onRemove={onRemove} />
      </ul>,
    );

    await user.click(screen.getByRole("button", { name: "Remove RELIANCE from watchlist" }));
    expect(onRemove).toHaveBeenCalledWith("RELIANCE");
  });
});

describe("WatchlistCard", () => {
  it("starts a first-time reader off with a working list", async () => {
    render(<WatchlistCard />);

    for (const symbol of STARTER_WATCHLIST) {
      expect(screen.getByText(symbol)).toBeInTheDocument();
    }
    expect(screen.getByText(`${STARTER_WATCHLIST.length} / ${MAX_WATCHED}`)).toBeInTheDocument();
    // And it is written down, so a removal actually sticks.
    expect(parseWatchlist(window.localStorage.getItem(STORAGE_KEY))).toEqual(STARTER_WATCHLIST);
  });

  it("reads a list the reader already has", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["ITC"]));
    render(<WatchlistCard />);

    expect(screen.getByText("ITC")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
  });

  it("adds a stock from the explorer and keeps it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["ITC"]));
    render(<WatchlistCard />);

    await user.click(screen.getByRole("button", { name: "+ Add a stock to watch" }));
    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "infy");
    await user.click(screen.getByRole("option", { name: /Infosys/ }));

    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(parseWatchlist(window.localStorage.getItem(STORAGE_KEY))).toEqual(["INFY", "ITC"]);
    // The picker closes once a choice is made.
    expect(screen.queryByRole("combobox", { name: "Search any listed stock" })).not.toBeInTheDocument();
  });

  it("ignores a stock that is already on the list", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["INFY"]));
    render(<WatchlistCard />);

    await user.click(screen.getByRole("button", { name: "+ Add a stock to watch" }));
    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "infy");
    await user.click(screen.getByRole("option", { name: /Infosys/ }));

    expect(parseWatchlist(window.localStorage.getItem(STORAGE_KEY))).toEqual(["INFY"]);
  });

  it("removes a stock and forgets it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["ITC", "INFY"]));
    render(<WatchlistCard />);

    await user.click(screen.getByRole("button", { name: "Remove ITC from watchlist" }));

    expect(screen.queryByText("ITC")).not.toBeInTheDocument();
    expect(parseWatchlist(window.localStorage.getItem(STORAGE_KEY))).toEqual(["INFY"]);
  });

  it("backs out of adding without changing anything", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["ITC"]));
    render(<WatchlistCard />);

    await user.click(screen.getByRole("button", { name: "+ Add a stock to watch" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "+ Add a stock to watch" })).toBeInTheDocument();
    expect(parseWatchlist(window.localStorage.getItem(STORAGE_KEY))).toEqual(["ITC"]);
  });

  // The cap is stated rather than silently swallowing the next add.
  it("stops at the cap and says why", async () => {
    const full = indianStocks.slice(0, MAX_WATCHED).map((stock) => stock.symbol);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    render(<WatchlistCard />);

    const button = screen.getByRole("button", { name: /Watchlist full/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(`${MAX_WATCHED} / ${MAX_WATCHED}`)).toBeInTheDocument();
  });

  it("explains an empty list rather than showing a blank card", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    render(<WatchlistCard />);
    expect(screen.getByText(/Nothing on the list yet/)).toBeInTheDocument();
  });

  // The list lives in the browser, and the card says so rather than implying it syncs.
  it("says where the list is kept and where the returns come from", () => {
    render(<WatchlistCard />);
    expect(screen.getByText(/Saved in this browser only/)).toBeInTheDocument();
  });

  it("keeps two cards on the page in step", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["ITC", "INFY"]));
    render(
      <>
        <div data-testid="first">
          <WatchlistCard />
        </div>
        <div data-testid="second">
          <WatchlistCard />
        </div>
      </>,
    );

    await user.click(within(screen.getByTestId("first")).getByRole("button", { name: "Remove ITC from watchlist" }));

    expect(within(screen.getByTestId("second")).queryByText("ITC")).not.toBeInTheDocument();
  });
});
