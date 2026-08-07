import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ALL_SECTORS,
  SECTOR_NAMES,
  StockExplorer,
  countMatches,
  groupBySector,
} from "../../app/components/stock-explorer";
import { indianStocks, sectors } from "../../app/lib/indian-stocks";

describe("groupBySector", () => {
  it("buckets matches under the sector each company belongs to", () => {
    const groups = groupBySector("bank", ALL_SECTORS);

    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      for (const stock of group.stocks) {
        expect(stock.sector).toBe(group.sector);
        expect(`${stock.symbol} ${stock.name}`.toLowerCase()).toContain("bank");
      }
    }
  });

  // "TCS" means the ticker, not a company with those letters buried in its name.
  it("ranks a ticker match above a name match inside its group", () => {
    const [group] = groupBySector("tcs", ALL_SECTORS);
    expect(group.stocks[0].symbol).toBe("TCS");
  });

  it("narrows to a single category when one is chosen", () => {
    const groups = groupBySector("", "Banking");
    expect(groups).toHaveLength(1);
    expect(groups[0].sector).toBe("Banking");
  });

  it("returns the whole catalogue, grouped, when nothing is typed", () => {
    expect(groupBySector("", ALL_SECTORS).length).toBeGreaterThan(1);
  });

  it("returns nothing for a query no company matches", () => {
    expect(groupBySector("zzzzzz", ALL_SECTORS)).toEqual([]);
  });

  // The dropdown draws a slice; `total` still reports how many are behind it, so the footer can
  // say what is being held back rather than implying the list is complete.
  it("caps the rows it draws but keeps the true count", () => {
    const groups = groupBySector("", "Banking");
    expect(groups[0].stocks.length).toBeLessThanOrEqual(6);
    expect(groups[0].total).toBe(indianStocks.filter((stock) => stock.sector === "Banking").length);
  });

  it("caps how many sectors it draws at once", () => {
    expect(groupBySector("", ALL_SECTORS).length).toBeLessThanOrEqual(8);
  });
});

describe("countMatches", () => {
  it("adds up the real totals, not the drawn rows", () => {
    expect(countMatches([])).toBe(0);
    expect(countMatches(groupBySector("", "Banking"))).toBe(
      indianStocks.filter((stock) => stock.sector === "Banking").length,
    );
  });
});

describe("SECTOR_NAMES", () => {
  /**
   * Every category, not just the hand-classified ones.
   *
   * The filter used to hide sectors with no company in the local catalogue. Now that the search
   * reaches all ~4,950 listed companies, that rule would hide categories with hundreds of real
   * listings behind them — BSE files something under every one of these.
   */
  it("offers every category the app defines", () => {
    expect(SECTOR_NAMES).toEqual(sectors.map((sector) => sector.name));
    expect(SECTOR_NAMES.length).toBeGreaterThan(10);
    expect(SECTOR_NAMES).toContain("Banking");
    expect(SECTOR_NAMES).toContain("Textiles");
  });

  it("still covers the sectors the local catalogue uses", () => {
    for (const stock of indianStocks) {
      expect(SECTOR_NAMES).toContain(stock.sector);
    }
  });
});

describe("StockExplorer", () => {
  it("stays closed until the reader engages with it", () => {
    render(<StockExplorer onSelect={jest.fn()} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search any listed stock" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on focus and groups the results by category", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));

    const list = screen.getByRole("listbox", { name: "Matching stocks" });
    expect(within(list).getAllByRole("group").length).toBeGreaterThan(1);
    expect(within(list).getAllByRole("option").length).toBeGreaterThan(1);
  });

  it("narrows as the reader types", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "infy");
    const list = screen.getByRole("listbox", { name: "Matching stocks" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(within(list).getByRole("option", { name: /Infosys/ })).toBeInTheDocument();
  });

  // A native select draws its own option list in the system's colours; these are our chips, so
  // every category is visible and styled like the rest of the panel.
  it("offers every category as a chip, with the active one marked", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    const rail = within(screen.getByRole("group", { name: "Filter by category" }));

    expect(rail.getAllByRole("button")).toHaveLength(SECTOR_NAMES.length + 1);
    expect(rail.getByRole("button", { name: ALL_SECTORS })).toHaveAttribute("aria-pressed", "true");

    await user.click(rail.getByRole("button", { name: "Banking" }));
    expect(rail.getByRole("button", { name: "Banking" })).toHaveAttribute("aria-pressed", "true");
    expect(rail.getByRole("button", { name: ALL_SECTORS })).toHaveAttribute("aria-pressed", "false");
  });

  // Everything about the search lives in the one dropdown: the filter, the clear, the results.
  it("filters to one category from inside the dropdown", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    await user.click(within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name: "Banking" }));

    const list = screen.getByRole("listbox", { name: "Matching stocks" });
    expect(within(list).getAllByRole("group")).toHaveLength(1);
    expect(within(list).getByRole("group", { name: "Banking" })).toBeInTheDocument();
  });

  it("offers no filter controls until the dropdown is open", () => {
    render(<StockExplorer onSelect={jest.fn()} />);
    expect(screen.queryByRole("group", { name: "Filter by category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("offers a clear only once something is filtered, and puts everything back", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name: "Banking" }));
    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "hdfc");
    const list = () => screen.getByRole("listbox", { name: "Matching stocks" });
    expect(within(list()).getAllByRole("group")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("combobox", { name: "Search any listed stock" })).toHaveValue("");
    expect(within(list()).getAllByRole("group").length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("reports the selected stock and puts its ticker in the box", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<StockExplorer onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Search any listed stock" });
    await user.type(input, "infy");
    await user.click(screen.getByRole("option", { name: /Infosys/ }));

    expect(onSelect).toHaveBeenCalledWith("INFY");
    expect(input).toHaveValue("INFY");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the stock that is already being analysed", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} selected="INFY" />);

    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "infy");
    expect(screen.getByRole("option", { name: /Infosys/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says so plainly when nothing matches", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "zzzzzz");
    expect(screen.getByText(/Nothing in the catalogue matches that/)).toBeInTheDocument();
  });

  // The list is a slice of the matches, and it says so rather than implying it is all of them.
  it("says how many matches are being held back", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    await user.click(within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name: "Banking" }));
    expect(screen.getByText(/Showing \d+ of \d+ matches/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // Any other key must not close it — only Escape does.
  it("stays open on an ordinary keypress", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search any listed stock" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  /**
   * Focus containment rather than a timer: the dropdown closes when focus leaves the whole
   * explorer, and not a moment before.
   */
  it("closes when focus leaves the explorer altogether", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);
    const input = screen.getByRole("combobox", { name: "Search any listed stock" });

    await user.click(input);
    fireEvent.blur(input, { relatedTarget: document.body });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // Clicking a category chip moves focus out of the input; the dropdown must survive that, or
  // the reader loses their choice halfway through making it.
  it("stays open when focus moves to the category filter inside it", async () => {
    const user = userEvent.setup();
    render(<StockExplorer onSelect={jest.fn()} />);
    const input = screen.getByRole("combobox", { name: "Search any listed stock" });

    await user.click(input);
    const rail = within(screen.getByRole("group", { name: "Filter by category" }));
    const banking = rail.getByRole("button", { name: "Banking" });
    fireEvent.blur(input, { relatedTarget: banking });

    expect(screen.getByRole("listbox", { name: "Matching stocks" })).toBeInTheDocument();

    await user.click(banking);
    const list = screen.getByRole("listbox", { name: "Matching stocks" });
    expect(within(list).getByRole("group", { name: "Banking" })).toBeInTheDocument();
  });

});

/**
 * The exchange tier.
 *
 * The browser holds a few hundred hand-classified companies; the other ~4,560 listed scrips live
 * behind /api/stocks/search. Local results paint first and are replaced when the exchange answers,
 * so these check both that the swap happens and that a failed swap leaves the local list alone.
 */
describe("StockExplorer over the whole exchange", () => {
  function mockSearch(payload: unknown, ok = true) {
    const fetchMock = jest.fn(async () => ({ ok, json: async () => payload }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  afterEach(() => {
    // @ts-expect-error -- put the environment back the way the other suites expect it.
    delete global.fetch;
  });

  it("replaces the local matches with the exchange's answer", async () => {
    const user = userEvent.setup();
    mockSearch({
      groups: [
        {
          sector: "Textiles",
          total: 42,
          stocks: [{ symbol: "SOMESMALLCO", name: "Some Small Mills", sector: "Textiles", capTier: "Small" }],
        },
      ],
      total: 42,
    });

    render(<StockExplorer onSelect={jest.fn()} />);
    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "mills");

    // Nothing in the local catalogue matches, so this row can only have come from the exchange.
    expect(await screen.findByRole("option", { name: /Some Small Mills/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Textiles" })).toBeInTheDocument();
    // The group's true size is reported even though one row is drawn.
    expect(screen.getByText(/42 in all/)).toBeInTheDocument();
  });

  it("can pick a company that only the exchange knows about", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    mockSearch({
      groups: [
        {
          sector: "Textiles",
          total: 1,
          stocks: [{ symbol: "SOMESMALLCO", name: "Some Small Mills", sector: "Textiles", capTier: "Small" }],
        },
      ],
      total: 1,
    });

    render(<StockExplorer onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: "Search any listed stock" });
    await user.type(input, "mills");

    await user.click(await screen.findByRole("option", { name: /Some Small Mills/ }));

    expect(onSelect).toHaveBeenCalledWith("SOMESMALLCO");
    expect(input).toHaveValue("SOMESMALLCO");
  });

  // A search that 404s or times out must not empty the dropdown under the reader.
  it.each([
    ["a failed response", () => mockSearch({}, false)],
    ["a network error", () => {
      const fetchMock = jest.fn(async () => {
        throw new Error("offline");
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }],
  ])("keeps the local matches on screen after %s", async (_label, install) => {
    const user = userEvent.setup();
    const fetchMock = install();

    render(<StockExplorer onSelect={jest.fn()} />);
    await user.type(screen.getByRole("combobox", { name: "Search any listed stock" }), "infy");

    // The request has to have actually gone out and come back badly — asserting only that the
    // local row is still there would pass even if the search were never attempted.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByRole("option", { name: /Infosys/ })).toBeInTheDocument();
  });
});
