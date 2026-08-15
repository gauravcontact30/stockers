import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopPerformers, formatPrice, formatReturn, type TopPerformer } from "../../app/components/top-performers";

// The panel embeds the exchange-wide search box, which has a suite of its own; here it is stubbed
// down to the input and clear button so these tests are about the board, not the combobox.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: (props: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <div>
      <input
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <button type="button" onClick={() => props.onChange("")}>
        clear
      </button>
    </div>
  ),
}));

const GAINERS: TopPerformer[] = [
  {
    symbol: "BSE",
    name: "BSE Ltd",
    sector: "Capital Markets",
    capTier: "Mid",
    price: 2840.5,
    changePercent: 1.9,
    periodReturn: 214.7,
  },
  {
    symbol: "TRENT",
    name: "Trent",
    sector: "Retail",
    capTier: "Large",
    price: 5960,
    changePercent: -0.4,
    periodReturn: 88.25,
  },
  {
    symbol: "SMALLCO",
    name: "Small Company",
    sector: "Chemicals",
    capTier: "Small",
    price: null,
    changePercent: null,
    periodReturn: 51,
  },
];

const LOSERS: TopPerformer[] = [
  {
    symbol: "FALLEN",
    name: "Fallen Industries",
    sector: "Textiles",
    capTier: "Small",
    price: 42.15,
    changePercent: -3.1,
    periodReturn: -78.4,
  },
];

type Payload = {
  stocks?: TopPerformer[];
  total?: number;
  page?: number;
  pages?: number;
  asOfDate?: string | null;
};

function mockBoard(body: Payload, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => body } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Answers each request from the query string, the way the route does. */
function mockRouted(handler: (url: string) => Payload) {
  const fetchMock = jest.fn((url: string) =>
    Promise.resolve({ ok: true, json: async () => handler(url) } as Response),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("formatReturn", () => {
  it("signs the move in both directions and keeps one decimal", () => {
    expect(formatReturn(214.74)).toBe("+214.7%");
    expect(formatReturn(-3.2)).toBe("-3.2%");
  });

  it("reads a ten-fold-plus run as the multiple it is", () => {
    // The whole-history window throws up figures like +571,228%, which nobody parses.
    expect(formatReturn(571228.28)).toBe("5,713x");
    expect(formatReturn(1000)).toBe("11x");
  });
});

describe("formatPrice", () => {
  it("renders rupees, and a dash where there is no price", () => {
    expect(formatPrice(2840.5)).toBe("₹2,840.5");
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(Number.NaN)).toBe("—");
  });
});

describe("TopPerformers", () => {
  it("opens on one-year gainers and asks the exchange for exactly that", async () => {
    const fetchMock = mockBoard({ stocks: GAINERS, total: 3, page: 1, pages: 1, asOfDate: "2026-08-10" });
    render(<TopPerformers />);

    expect(await screen.findByText("Up more than 50% over the last one year")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/market/top-performers?direction=gainers&period=1y&page=1&pageSize=5&q=",
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Top Gainers" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows every name with its logo, ticker, sector and cap pills, return and price", async () => {
    mockBoard({ stocks: GAINERS, total: 3, page: 1, pages: 1, asOfDate: "2026-08-10" });
    render(<TopPerformers />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(3);

    const leader = within(rows[0]);
    expect(leader.getByAltText("BSE (BSE) logo")).toBeInTheDocument();
    expect(leader.getByText("BSE Ltd")).toBeInTheDocument();
    expect(leader.getByText("Capital Markets")).toBeInTheDocument();
    expect(leader.getByText("Mid cap")).toBeInTheDocument();
    expect(leader.getByText("+214.7%")).toBeInTheDocument();
    expect(leader.getByText("₹2,840.5")).toBeInTheDocument();
    expect(leader.getByText("#1")).toBeInTheDocument();

    // A name the quote feed had no price for still ranks; only its price is missing.
    expect(within(rows[2]).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("3 above 50% · as of 2026-08-10 · past performance is not a prediction.")).toBeInTheDocument();
  });

  it("switches to the losers board and asks for the other direction", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted((url) =>
      url.includes("direction=losers")
        ? { stocks: LOSERS, total: 1, page: 1, pages: 1, asOfDate: "2026-08-10" }
        : { stocks: GAINERS, total: 3, page: 1, pages: 1, asOfDate: "2026-08-10" },
    );
    render(<TopPerformers />);
    await screen.findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: "Top Losers" }));

    expect(await screen.findByText("Down more than 50% over the last one year")).toBeInTheDocument();
    const row = within(await screen.findByRole("listitem"));
    expect(row.getByText("Fallen Industries")).toBeInTheDocument();
    expect(row.getByText("-78.4%")).toBeInTheDocument();
    expect(screen.getByText("1 below 50% · as of 2026-08-10 · past performance is not a prediction.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/market/top-performers?direction=losers&period=1y&page=1&pageSize=5&q=",
      expect.anything(),
    );
  });

  it("switches window, and says which one it is showing", async () => {
    const user = userEvent.setup();
    const fetchMock = mockBoard({ stocks: GAINERS, total: 3, page: 1, pages: 1 });
    render(<TopPerformers />);
    await screen.findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: "5Y" }));
    expect(await screen.findByText("Up more than 50% over the last five years")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("period=5y"), expect.anything()));

    await user.click(screen.getByRole("button", { name: "3Y" }));
    expect(await screen.findByText("Up more than 50% over the last three years")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overall" }));
    expect(await screen.findByText("Up more than 50% over the whole listed history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overall" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "false");
  });

  it("pages forward and back, and keeps the ranking counting across pages", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted((url) =>
      url.includes("page=2")
        ? { stocks: [LOSERS[0]], total: 7, page: 2, pages: 2, asOfDate: null }
        : { stocks: GAINERS, total: 7, page: 1, pages: 2, asOfDate: null },
    );
    render(<TopPerformers />);
    await screen.findAllByRole("listitem");

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.anything());
    // Page two starts at seven, not at one.
    expect(within(screen.getByRole("listitem")).getByText("#6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());
  });

  it("searches the board, and clearing the search restores it", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted((url) =>
      url.includes("q=trent")
        ? { stocks: [GAINERS[1]], total: 1, page: 1, pages: 1, asOfDate: null }
        : { stocks: GAINERS, total: 3, page: 1, pages: 1, asOfDate: null },
    );
    render(<TopPerformers />);
    await screen.findAllByRole("listitem");

    await user.type(screen.getByPlaceholderText("Search any BSE-listed company"), "trent");

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("q=trent"), expect.anything());

    await user.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
  });

  it("sends the search back to page one", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted(() => ({ stocks: GAINERS, total: 20, page: 2, pages: 4, asOfDate: null }));
    render(<TopPerformers />);
    await screen.findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.anything()));

    await user.type(screen.getByPlaceholderText("Search any BSE-listed company"), "bse");

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("page=1&pageSize=5&q=bse"), expect.anything()));
  });

  it("says so plainly when nothing clears the bar, with and without a search", async () => {
    const user = userEvent.setup();
    mockRouted(() => ({ stocks: [], total: 0, page: 1, pages: 1, asOfDate: null }));
    render(<TopPerformers />);

    expect(await screen.findByText("No tracked company is up more than 50% over the last one year.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search any BSE-listed company"), "zzz");

    // A searched name outside the tracked catalogue is explained rather than left blank.
    expect(
      await screen.findByText(
        'No tracked company matching "zzz" is up more than 50% over the last one year. Long-run returns are tracked for the catalogue rather than every listed scrip.',
      ),
    ).toBeInTheDocument();

    // The same two sentences read the other way round on the losers board.
    await user.click(screen.getByRole("button", { name: "Top Losers" }));
    expect(await screen.findByText(/matching "zzz" is down more than 50%/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "clear" }));
    expect(await screen.findByText("No tracked company is down more than 50% over the last one year.")).toBeInTheDocument();
  });

  it("treats a response with no fields as an empty board rather than a crash", async () => {
    mockBoard({});
    render(<TopPerformers />);

    expect(await screen.findByText(/No tracked company is up more than 50%/)).toBeInTheDocument();
  });

  it("explains itself when the history feed refuses", async () => {
    mockBoard({ stocks: GAINERS, total: 3 }, false);
    render(<TopPerformers />);

    expect(await screen.findByText(/Performance history could not be reached/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows a skeleton while the board is loading", async () => {
    let settle: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    ) as unknown as typeof fetch;

    render(<TopPerformers />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("Up more than 50% over the last one year")).toBeInTheDocument();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => {
      settle({ ok: true, json: async () => ({ stocks: GAINERS, total: 3, page: 1, pages: 1 }) });
    });

    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
  });

  it("ignores an answer to controls the reader has already moved on from", async () => {
    const user = userEvent.setup();
    const rejecters: ((reason: unknown) => void)[] = [];
    global.fetch = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejecters.push(reject);
        }),
    ) as unknown as typeof fetch;

    render(<TopPerformers />);
    await waitFor(() => expect(rejecters).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "3Y" }));

    // Switching window aborts the one-year request; its rejection lands afterwards and must not
    // raise an error banner over the three-year request still in flight.
    await act(async () => {
      rejecters[0](new Error("aborted"));
    });

    expect(screen.queryByText(/could not be reached/)).not.toBeInTheDocument();
  });
});
