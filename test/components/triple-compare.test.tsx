import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripleCompare, type CustomComparison } from "../../app/components/triple-compare";
import type { Suggestion } from "../../app/components/stock-combobox";
import type { StockVerdict } from "../../app/components/verdict-view";

// Driving a 270-name picker keystroke by keystroke is slow; under a loaded CI machine these
// interactions genuinely need longer than the 5s default.
jest.setTimeout(30000);

function stock(overrides: Partial<StockVerdict> = {}): StockVerdict {
  return {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    capTier: "Large",
    price: 2407.9,
    oneDay: -0.5,
    oneWeek: 1.2,
    oneMonth: 17,
    sixMonth: -4.3,
    oneYear: -20.6,
    score: 39,
    stance: "Sell",
    rationale: "Down over every window beyond a month.",
    source: "ai",
    ...overrides,
  };
}

const SUGGESTIONS: Suggestion[] = [
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    capTier: "Large",
    scripCode: "532540",
    price: 2407.9,
    changePercent: -0.5,
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    sector: "Banking",
    capTier: "Large",
    scripCode: "500180",
    price: 1678.9,
    changePercent: 1.2,
  },
  {
    symbol: "INFY",
    name: "Infosys",
    sector: "Information Technology",
    capTier: "Large",
    scripCode: "500209",
    price: 1491.35,
    changePercent: 0.8,
  },
];

function suggestionPayload(url: string) {
  const params = new URL(url, "http://stockers.test").searchParams;
  const query = (params.get("q") ?? "").toLowerCase();
  const suggestions = SUGGESTIONS.filter(
    (stock) => !query || stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query),
  );
  return { suggestions, total: suggestions.length };
}

function mockCompare(payload: CustomComparison, ok = true) {
  const urls: string[] = [];
  global.fetch = jest.fn((url: string) => {
    const href = String(url);
    urls.push(href);
    if (href.startsWith("/api/stocks/suggest")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(suggestionPayload(href)) });
    }
    return Promise.resolve({ ok, json: () => Promise.resolve(payload) });
  }) as unknown as typeof fetch;
  return urls;
}

const acrossSectors: CustomComparison = {
  stocks: [stock(), stock({ symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", score: 24 })],
  sameSector: false,
  leader: "TCS",
  laggard: "HDFCBANK",
  takeaway: "Across 2 sectors, TCS has the strongest momentum and HDFCBANK the weakest.",
};

/** Opens the picker in the given slot and chooses a stock from it. */
async function pick(user: ReturnType<typeof userEvent.setup>, slot: string, symbol: string) {
  const label = screen.getByText(slot);
  const field = within(label.parentElement as HTMLElement).getByRole("combobox");
  await user.click(field);
  await user.type(field, symbol);
  await user.click(await screen.findByRole("option", { name: new RegExp(symbol) }));
}

describe("TripleCompare", () => {
  it("needs two stocks before it will compare", async () => {
    const user = userEvent.setup();
    mockCompare(acrossSectors);
    render(<TripleCompare />);

    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    expect(screen.getByText("Pick at least two stocks to run a comparison.")).toBeInTheDocument();

    await pick(user, "Stock 1", "TCS");
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();

    await pick(user, "Stock 2", "HDFCBANK");
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
  });

  it("compares the chosen stocks and lays out the verdicts", async () => {
    const user = userEvent.setup();
    const urls = mockCompare(acrossSectors);
    render(<TripleCompare />);

    await pick(user, "Stock 1", "TCS");
    await pick(user, "Stock 2", "HDFCBANK");
    await user.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(screen.getByText("Across sectors")).toBeInTheDocument());
    expect(urls).toContain("/api/compare/custom?symbols=TCS%2CHDFCBANK");
    expect(screen.getByText(/TCS has the strongest momentum/)).toBeInTheDocument();
    expect(screen.getAllByText("UNDERPERFORM").length).toBeGreaterThan(0);
    expect(screen.getByText(/Rationale written by AI agent/)).toBeInTheDocument();
  });

  it("labels a single-sector comparison as like-for-like", async () => {
    const user = userEvent.setup();
    mockCompare({
      ...acrossSectors,
      sameSector: true,
      stocks: [stock(), stock({ symbol: "INFY", name: "Infosys" })],
      takeaway: "In Information Technology the whole group is under pressure.",
    });
    render(<TripleCompare />);

    await pick(user, "Stock 1", "TCS");
    await pick(user, "Stock 2", "INFY");
    await user.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(screen.getByText(/Like-for-like/)).toBeInTheDocument());
  });

  it("keeps a stock chosen in one slot out of the others", async () => {
    const user = userEvent.setup();
    mockCompare(acrossSectors);
    render(<TripleCompare />);

    await pick(user, "Stock 1", "TCS");

    const secondField = within(screen.getByText("Stock 2").parentElement as HTMLElement).getByRole("combobox");
    await user.click(secondField);
    await user.type(secondField, "TCS");

    expect(await screen.findByText('Nothing listed matches "TCS".')).toBeInTheDocument();
  });

  it("resets every slot and the result", async () => {
    const user = userEvent.setup();
    mockCompare(acrossSectors);
    render(<TripleCompare />);

    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled();

    await pick(user, "Stock 1", "TCS");
    await pick(user, "Stock 2", "HDFCBANK");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(screen.getByText("Across sectors")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Reset all" }));

    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
    expect(screen.queryByText("Across sectors")).not.toBeInTheDocument();
    screen.getAllByRole("combobox", { name: "Search any listed stock" }).forEach((field) => {
      expect(field).toHaveValue("");
    });
  });

  it("reports a failed comparison without losing the picks", async () => {
    const user = userEvent.setup();
    mockCompare(acrossSectors, false);
    render(<TripleCompare />);

    await pick(user, "Stock 1", "TCS");
    await pick(user, "Stock 2", "HDFCBANK");
    await user.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(screen.getByText(/Couldn't run that comparison/)).toBeInTheDocument());
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
  });

  it("says nothing about a comparison that came back empty", async () => {
    const user = userEvent.setup();
    mockCompare({ ...acrossSectors, stocks: [] });
    render(<TripleCompare />);

    await pick(user, "Stock 1", "TCS");
    await pick(user, "Stock 2", "HDFCBANK");
    await user.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled());
    expect(screen.queryByText("Across sectors")).not.toBeInTheDocument();
  });
});
