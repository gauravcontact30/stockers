import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BseMoversBoard,
  MoverTableRow,
  buildMoversUrl,
  type RankedMoverRow,
} from "../../app/components/bse-movers-board";
// Through the constant rather than as a literal, so the page size can move in one place — the
// server prefetch reads the same one, and the two must never disagree.
import { MOVERS_PAGE_SIZE } from "../../app/lib/market-urls";

jest.setTimeout(30000);

function row(overrides: Partial<RankedMoverRow> = {}): RankedMoverRow {
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
    change: -12,
    changePercent: -0.93,
    dayHigh: 1295,
    dayLow: 1275,
    volume: 250000,
    turnoverCr: 32.5,
    returnPercent: 154.2,
    ...overrides,
  };
}

// Every mover the fixture knows about, per tier and direction, sharpest first — the endpoint
// searches, filters, ranks and slices this, so the mock does too.
const MOVERS: Record<string, RankedMoverRow[]> = {
  "all|gainers": [
    row({ code: "1", ticker: "CHLOGIST", name: "Chartered Logistics Ltd", capTier: "Small", sector: "Services", changePercent: 20, change: 4.2, price: 25.2 }),
    row({ code: "6", ticker: "SECOND", name: "Second Best Ltd", capTier: "Small", changePercent: 18 }),
    row({ code: "7", ticker: "THIRD", name: "Third Best Ltd", capTier: "Small", changePercent: 1.6 }),
  ],
  "all|losers": [
    row({ code: "2", ticker: "SCARNOSE", name: "Scarnose International Ltd", capTier: "Small", sector: "Consumer Discretionary", changePercent: -19.99 }),
    row({ code: "8", ticker: "NEXTWORST", name: "Next Worst Ltd", capTier: "Small", changePercent: -14 }),
    row({ code: "9", ticker: "THIRDWORST", name: "Third Worst Ltd", capTier: "Small", changePercent: -11 }),
  ],
  "large|gainers": [row({ code: "3", ticker: "HINDZINC", name: "Hindustan Zinc Ltd", sector: "Commodities", changePercent: 5.7 })],
  "large|losers": [row({ code: "4", ticker: "TCS", name: "Tata Consultancy Services Ltd", sector: "Information Technology", changePercent: -1.23 })],
  "mid|gainers": [row({ code: "5", ticker: "HINDCOPPER", capTier: "Mid", sector: "Commodities", changePercent: 8.36 })],
  "mid|losers": [],
  "small|gainers": [],
  "small|losers": [],
};

/**
 * Answers the movers endpoint the way the server does — searching and filtering before it pages.
 *
 * The mock pages two at a time rather than the real ten: the board takes `pageSize` from the
 * response to number its rows, so a short page proves the rank arithmetic without a dozen
 * fixture rows.
 */
const MOCK_PAGE_SIZE = 2;

function mockFeed(ok = true, table: Record<string, RankedMoverRow[]> = MOVERS) {
  global.fetch = jest.fn((url: string) => {
    const params = new URLSearchParams(String(url).split("?")[1]);
    const tier = params.get("tier") ?? "all";
    const direction = params.get("direction") ?? "gainers";
    const period = params.get("period") ?? "1d";
    const wanted = Number(params.get("page") ?? 1);
    const term = (params.get("q") ?? "").toLowerCase();
    const min = Number(params.get("min") ?? 0);

    // A search looks through every listed company rather than the tab being viewed, so the pool is
    // both directions and the tab only decides the order — the same rule the endpoint follows.
    const pool = term
      ? [...(table[`${tier}|gainers`] ?? []), ...(table[`${tier}|losers`] ?? [])].sort((a, b) =>
          direction === "gainers"
            ? (b.changePercent ?? 0) - (a.changePercent ?? 0)
            : (a.changePercent ?? 0) - (b.changePercent ?? 0),
        )
      : (table[`${tier}|${direction}`] ?? []);

    const all = pool
      .filter((stock) => Math.abs(stock.changePercent ?? 0) >= min)
      .filter(
        (stock) =>
          !term ||
          stock.ticker.toLowerCase().includes(term) ||
          stock.name.toLowerCase().includes(term) ||
          stock.code.includes(term),
      );

    return Promise.resolve({
      ok,
      json: () =>
        Promise.resolve({
          rows: all.slice((wanted - 1) * MOCK_PAGE_SIZE, wanted * MOCK_PAGE_SIZE),
          period,
          // The reference session the return is measured from — only meaningful past one day.
          periodFrom: period === "1d" ? "2026-08-05" : "2021-08-06",
          total: all.length,
          page: wanted,
          pageSize: MOCK_PAGE_SIZE,
          pages: Math.max(Math.ceil(all.length / MOCK_PAGE_SIZE), 1),
          sessionDate: "2026-08-05",
        }),
    });
  }) as unknown as typeof fetch;
}

describe("buildMoversUrl", () => {
  it("asks for one page of a tier's movers, in one direction, ranked over one period", () => {
    expect(buildMoversUrl("small", "losers", "overall", "", "0", 3)).toBe(
      `/api/market/bse/movers?tier=small&direction=losers&period=overall&page=3&pageSize=${MOVERS_PAGE_SIZE}`,
    );
  });

  // A search and a move floor are only sent when they are actually set, so the unfiltered board
  // and the cleared board request exactly the same URL — and hit the same cache entry.
  it("carries the search term and the move floor only when they are set", () => {
    expect(buildMoversUrl("all", "gainers", "1y", "tata steel", "5", 1)).toBe(
      `/api/market/bse/movers?tier=all&direction=gainers&period=1y&page=1&pageSize=${MOVERS_PAGE_SIZE}&q=tata+steel&min=5`,
    );
  });
});

describe("MoverTableRow", () => {
  it("carries the identity, the classification, the move and what it cost to trade", () => {
    render(
      <table>
        <tbody>
          <MoverTableRow row={row()} rank={4} />
        </tbody>
      </table>,
    );

    expect(screen.getByLabelText("Rank 4 in this segment")).toBeInTheDocument();
    expect(screen.getByAltText(/\(RELIANCE\) logo$/)).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries Ltd")).toBeInTheDocument();
    // Sector and cap tier ride with the company rather than holding columns of their own.
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Large cap")).toBeInTheDocument();
    expect(screen.getByText("₹1,281.00")).toBeInTheDocument();
    expect(screen.getByText("+154.20%")).toBeInTheDocument();
    expect(screen.getByText("-0.93%")).toBeInTheDocument();
    // Turnover and market cap arrive in crore and are printed in crore, not converted twice.
    expect(screen.getByText("₹32.5 Cr")).toBeInTheDocument();
    expect(screen.getByText("₹17,33,518 Cr")).toBeInTheDocument();
  });

  it("drops what the remaining columns already say", () => {
    render(
      <table>
        <tbody>
          <MoverTableRow row={row()} rank={4} />
        </tbody>
      </table>,
    );

    // The day's move in rupees, restated by Day %.
    expect(screen.queryByText("-₹12.00")).not.toBeInTheDocument();
    // Both ends of the session as text, when the close is already in Price.
    expect(screen.queryByText("₹1,275.00 – ₹1,295.00")).not.toBeInTheDocument();
    // A share count, when turnover says the same thing in the unit that matters.
    expect(screen.queryByText("2.50 L")).not.toBeInTheDocument();
    // BSE's own scrip code, which is how the exchange keys its pages, not how a reader reads one.
    expect(screen.queryByText(/500325/)).not.toBeInTheDocument();
  });

  // A scrip the exchange has not classified, and one that reports no turnover or market cap, must
  // still print a readable row rather than "null" or "₹NaN Cr".
  it("falls back to a dash wherever the exchange files nothing", () => {
    render(
      <table>
        <tbody>
          <MoverTableRow
            row={row({ sector: null, capTier: null, rank: null, turnoverCr: null, marketCapCr: null })}
            rank={1}
          />
        </tbody>
      </table>,
    );

    expect(screen.queryByText("Energy")).not.toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
    // An unfiled cap tier drops its pill rather than printing a dash beside the sector.
    expect(screen.queryByText(/cap$/)).not.toBeInTheDocument();
    // Turnover and market cap.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("BseMoversBoard", () => {
  it("opens on the gainers tab and lists every gainer on the exchange, sharpest first", async () => {
    mockFeed();
    render(<BseMoversBoard />);

    expect(await screen.findByText("CHLOGIST")).toBeInTheDocument();
    expect(screen.getByText("SECOND")).toBeInTheDocument();
    expect(screen.getByText("3 closed higher")).toBeInTheDocument();
    // One year is the default ranking: a holding period, not the day's move and not since listing.
    expect(screen.getByText(/stocks in all up over 1y/)).toBeInTheDocument();
    expect(screen.getByText(/sorted by 1Y return, biggest gain first · ten a page/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /% Return/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Return period")).toHaveValue("1y");
    expect(screen.getByRole("tab", { name: "Most Gainers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Most Losers" })).toHaveAttribute("aria-selected", "false");
    expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1y", "", "0", 1));
  });

  // The other tab is the other question: its own heading, its own count, its own order.
  it("switches to the losers tab, deepest fall first", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.click(screen.getByRole("tab", { name: "Most Losers" }));

    expect(await screen.findByText("SCARNOSE")).toBeInTheDocument();
    expect(screen.queryByText("CHLOGIST")).not.toBeInTheDocument();
    expect(screen.getByText("Every BSE stock that closed lower")).toBeInTheDocument();
    expect(screen.getByText("3 closed lower")).toBeInTheDocument();
    expect(screen.getByText(/sorted by 1Y return, deepest fall first/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Most Losers" })).toHaveAttribute("aria-selected", "true");
    expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "losers", "1y", "", "0", 1));
  });

  // Page two of the gainers is not a place to land in the losers.
  it("opens the other tab at its own sharpest move, however deep the last one was paged", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.click(screen.getByRole("button", { name: "Next →" }));
    await screen.findByText("THIRD");

    await user.click(screen.getByRole("tab", { name: "Most Losers" }));

    expect(await screen.findByText("SCARNOSE")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "losers", "1y", "", "0", 1));
  });

  it("names every column of the table", async () => {
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    for (const heading of ["Company", "Price", "Day %", "Turnover", "Market cap"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }

    // Seven columns, and no more: the board is a screen, not a dump of the Bhavcopy.
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    for (const dropped of ["Tier", "Day change", "Day range", "Volume"]) {
      expect(screen.queryByRole("columnheader", { name: dropped })).not.toBeInTheDocument();
    }
  });

  it("pages through the list with the ranks running on", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const pager = screen.getByRole("navigation", { name: "gainers pages" });
    await user.click(within(pager).getByRole("button", { name: "Next →" }));

    const third = await screen.findByText("THIRD");
    expect(screen.queryByText("CHLOGIST")).not.toBeInTheDocument();
    // Row one of page two is the third sharpest move, not the first.
    expect(within(third.closest("tr")!).getByLabelText("Rank 3 in this segment")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1y", "", "0", 2));

    await user.click(within(pager).getByRole("button", { name: "← Prev" }));
    expect(await screen.findByText("CHLOGIST")).toBeInTheDocument();
  });

  // Page thirty of the large caps is not a sensible place to land in the small caps.
  it("starts the list again at its sharpest move when the cap tier changes", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.click(screen.getByRole("button", { name: "Next →" }));
    await screen.findByText("THIRD");

    await user.selectOptions(screen.getByLabelText("Tier"), "large");

    expect(await screen.findByText("HINDZINC")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("large", "gainers", "1y", "", "0", 1));
  });

  it("says so when a cap tier has no move in this direction, and offers to widen it", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.selectOptions(screen.getByLabelText("Tier"), "small");

    expect(
      await screen.findByText("No listed company matches this search and these filters."),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Tier"), "mid");
    expect(await screen.findByText("HINDCOPPER")).toBeInTheDocument();
  });

  // A session with nothing rising at all is a statement about the market, not a filter to clear.
  it("reports an unfiltered board that is empty without offering to clear anything", async () => {
    mockFeed(true, {});
    render(<BseMoversBoard />);

    expect(
      await screen.findByText("Nothing closed higher this session — the whole exchange was flat or lower."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters and show everything" })).not.toBeInTheDocument();
  });

  // The whole point of the period control: the same tab, ranked over a different window — and it
  // now lives in the column header whose figures it rewrites, not in the toolbar above.
  it("re-ranks from the % Return header, on both tabs", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const header = screen.getByRole("columnheader", { name: /% Return/ });
    await user.selectOptions(within(header).getByLabelText("Return period"), "5y");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "5y", "", "0", 1));
    });
    expect(screen.getByText(/sorted by 5Y return, biggest gain first/)).toBeInTheDocument();
    // The baseline is stated, so nobody has to guess what the return is measured against.
    expect(screen.getByText(/measured from 6 Aug 2021/)).toBeInTheDocument();

    // The losers tab keeps the period: it is the board's ranking, not the tab's.
    await user.click(screen.getByRole("tab", { name: "Most Losers" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "losers", "5y", "", "0", 1));
    });
    expect(screen.getByText(/sorted by 5Y return, deepest fall first/)).toBeInTheDocument();
  });

  it("offers the five windows a position is actually held over, and nothing else", async () => {
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const periods = within(screen.getByLabelText("Return period"));
    for (const label of ["1M", "6M", "1Y", "3Y", "5Y"]) {
      expect(periods.getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(periods.getAllByRole("option")).toHaveLength(5);

    // Since-listing returns put +81,286% scrips at the top of a board people read for what to
    // trade; 1D and 1W only restated the Day % column.
    for (const dropped of ["Overall", "1D", "1W", "3M"]) {
      expect(periods.queryByRole("option", { name: dropped })).not.toBeInTheDocument();
    }
  });

  // A month is new to the endpoint's whitelist, though ../lib/bse-history has always kept the
  // baseline — so it is worth proving the request goes out and comes back.
  it("ranks over one month, the shortest window it offers", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.selectOptions(screen.getByLabelText("Return period"), "1m");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1m", "", "0", 1));
    });
    expect(screen.getByText(/sorted by 1M return, biggest gain first/)).toBeInTheDocument();
  });

  it("filters the list to moves of at least the chosen size", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.selectOptions(screen.getByLabelText("Move"), "10");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1y", "", "10", 1));
    });
    // THIRD only moved 1.6%, so the floor drops it — and the count line says the total is filtered.
    expect(await screen.findByText(/stocks match these filters/)).toBeInTheDocument();
    expect(screen.getByText("CHLOGIST")).toBeInTheDocument();
  });

  it("searches the list and offers the matches as a dropdown", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const search = screen.getByLabelText("Search these movers");
    await user.type(search, "second");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1y", "second", "0", 1));
    });

    const option = await screen.findByRole("option", { name: /SECOND/ });
    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(within(option).getByAltText(/\(SECOND\) logo$/)).toBeInTheDocument();
    expect(within(option).getByText("Second Best Ltd")).toBeInTheDocument();
    expect(within(option).getByLabelText("Rank 1 in this segment")).toBeInTheDocument();
    expect(within(option).getByText("Energy")).toBeInTheDocument();
    expect(within(option).getByText("+18.00%")).toBeInTheDocument();

    // Picking a suggestion pins the list to that ticker without waiting for the settle.
    await user.click(option);
    expect(search).toHaveValue("SECOND");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(buildMoversUrl("all", "gainers", "1y", "SECOND", "0", 1));
    });
  });

  // Roughly half the exchange falls on any given day; being told from the gainers tab that a
  // company that fell does not exist was the bug this covers.
  it("finds a company that fell without leaving the gainers tab", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.type(screen.getByLabelText("Search these movers"), "scarnose");

    // Once in the table, and once as a suggestion in the dropdown.
    await waitFor(() => expect(screen.getAllByText("SCARNOSE")).toHaveLength(2));
    expect(within(screen.getByRole("table")).getByText("SCARNOSE")).toBeInTheDocument();
    expect(screen.getByText(/listed companies match/)).toBeInTheDocument();
    expect(screen.getByText(/searched across the whole exchange, whichever way they went/)).toBeInTheDocument();
    // Still the gainers tab: the search changed what was looked through, not which tab is open.
    expect(screen.getByRole("tab", { name: "Most Gainers" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes the dropdown on Escape and when focus leaves the control", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const search = screen.getByLabelText("Search these movers");
    await user.type(search, "second");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(search);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Most Gainers" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers a way out when a search matches nothing", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    await user.type(screen.getByLabelText("Search these movers"), "zzzz");

    expect(await screen.findByText("No listed company matches this search and these filters.")).toBeInTheDocument();
    // Nothing matched, so there is nothing to suggest either.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters and show everything" }));
    expect(await screen.findByText("CHLOGIST")).toBeInTheDocument();
  });

  it("clears the search and every filter at once, and offers to only when something is set", async () => {
    const user = userEvent.setup();
    mockFeed();
    render(<BseMoversBoard />);
    await screen.findByText("CHLOGIST");

    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Tier"), "large");
    await user.selectOptions(screen.getByLabelText("Move"), "5");
    await user.type(screen.getByLabelText("Search these movers"), "hind");
    expect(clear).toBeEnabled();

    await user.click(clear);

    expect(screen.getByLabelText("Search these movers")).toHaveValue("");
    expect(screen.getByLabelText("Tier")).toHaveValue("all");
    expect(screen.getByLabelText("Move")).toHaveValue("0");
    expect(clear).toBeDisabled();

    expect(await screen.findByText("CHLOGIST")).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(buildMoversUrl("all", "gainers", "1y", "", "0", 1));
    });
  });

  it("shows a skeleton first and reports a feed failure without blanking the section", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const { container } = render(<BseMoversBoard />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByText("Loading BSE…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Non-equity instruments/)).toBeInTheDocument();
  });
});
