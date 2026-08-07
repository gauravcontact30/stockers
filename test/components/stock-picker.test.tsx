import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockPicker, filterGroups, findOption, pickerGroups } from "../../app/components/stock-picker";

// Driving a 270-name picker keystroke by keystroke is slow; under a loaded CI machine these
// interactions genuinely need longer than the 5s default.
jest.setTimeout(30000);

describe("pickerGroups", () => {
  it("groups the whole universe by sector, with no empty sectors", () => {
    expect(pickerGroups.length).toBeGreaterThan(5);
    expect(pickerGroups.every((group) => group.stocks.length > 0)).toBe(true);
    expect(pickerGroups.map((group) => group.sector)).toContain("Data Centers");
  });
});

describe("filterGroups", () => {
  it("returns every sector when nothing is typed", () => {
    expect(filterGroups(pickerGroups, "")).toHaveLength(pickerGroups.length);
  });

  it("matches on symbol, company name and sector name", () => {
    expect(filterGroups(pickerGroups, "tcs").flatMap((g) => g.stocks).map((s) => s.symbol)).toContain("TCS");
    expect(filterGroups(pickerGroups, "infosys").flatMap((g) => g.stocks).map((s) => s.symbol)).toContain("INFY");

    const bySector = filterGroups(pickerGroups, "data centers");
    expect(bySector).toHaveLength(1);
    expect(bySector[0].stocks.map((s) => s.symbol)).toContain("TATACOMM");
  });

  it("drops stocks already chosen in another slot", () => {
    const withTcs = filterGroups(pickerGroups, "tcs").flatMap((g) => g.stocks);
    const without = filterGroups(pickerGroups, "tcs", ["TCS"]).flatMap((g) => g.stocks);
    expect(withTcs.map((s) => s.symbol)).toContain("TCS");
    expect(without.map((s) => s.symbol)).not.toContain("TCS");
  });

  it("returns nothing when the search matches nothing", () => {
    expect(filterGroups(pickerGroups, "zzzzz")).toHaveLength(0);
  });
});

describe("findOption", () => {
  it("resolves a symbol to its company, sector and tier", () => {
    expect(findOption("TATACOMM")).toMatchObject({ name: "Tata Communications", sector: "Data Centers", capTier: "Large" });
  });

  it("is null for no selection and for a symbol outside the universe", () => {
    expect(findOption(null)).toBeNull();
    expect(findOption("NOTREAL")).toBeNull();
  });
});

describe("StockPicker", () => {
  it("starts empty, opens the sector-grouped list, and reports the chosen stock", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StockPicker label="Stock 1" value={null} onChange={onChange} />);

    expect(screen.getByText("Search or pick a stock")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Search or pick a stock/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Stock 1" })).toBeInTheDocument();
    expect(screen.getByText("Information Technology")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /^TCS/ }));
    expect(onChange).toHaveBeenCalledWith("TCS");
    // Choosing closes the menu again.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("narrows the list as you type and says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<StockPicker label="Stock 1" value={null} onChange={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: /Search or pick a stock/ }));

    const search = screen.getByLabelText("Search stocks for Stock 1");
    await user.type(search, "netweb");

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: /NETWEB/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /^TCS/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzzz");
    expect(screen.getByText(/No stock matches “zzzz”/)).toBeInTheDocument();
  });

  it("shows the selection with its sector and tier, and clears it on request", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StockPicker label="Stock 2" value="TATACOMM" onChange={onChange} />);

    expect(screen.getByText("TATACOMM")).toBeInTheDocument();
    expect(screen.getByText(/Tata Communications · Data Centers · Large cap/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("offers no Clear button when nothing is selected", () => {
    render(<StockPicker label="Stock 3" value={null} onChange={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("closes on an outside click and on Escape", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <StockPicker label="Stock 1" value={null} onChange={jest.fn()} />
        <button type="button">elsewhere</button>
      </div>,
    );

    const toggle = screen.getByRole("button", { name: /Search or pick a stock/ });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when the toggle itself is clicked again", async () => {
    const user = userEvent.setup();
    render(<StockPicker label="Stock 1" value={null} onChange={jest.fn()} />);
    const toggle = screen.getByRole("button", { name: /Search or pick a stock/ });

    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the current value as the selected option", async () => {
    const user = userEvent.setup();
    render(<StockPicker label="Stock 1" value="TCS" onChange={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /TCS/ }));
    expect(screen.getByRole("option", { name: /^TCS/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /^INFY/ })).toHaveAttribute("aria-selected", "false");
  });
});
