import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiStockCompare } from "../../app/components/ai-stock-compare";

// Driving a 270-name picker keystroke by keystroke is slow; under a loaded CI machine these
// interactions genuinely need longer than the 5s default.
jest.setTimeout(30000);

/**
 * The section makes two calls per comparison: the AI head-to-head and the performance cards it
 * shares with the three-stock comparison. Both are answered here, by URL.
 */
function mockFetchOnce(ok: boolean, data?: unknown, cards: { ok: boolean; body?: unknown } = { ok: true, body: cardsPayload }) {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).startsWith("/api/compare/custom")
      ? Promise.resolve({ ok: cards.ok, json: () => Promise.resolve(cards.body) })
      : Promise.resolve({ ok, json: () => Promise.resolve(data) }),
  );
}

const cardsPayload = {
  sameSector: true,
  leader: "TCS",
  laggard: "INFY",
  takeaway: "TCS leads INFY.",
  stocks: [
    {
      symbol: "TCS",
      name: "Tata Consultancy Services",
      sector: "Information Technology",
      capTier: "Large" as const,
      price: 2399.4,
      oneDay: -0.56,
      oneWeek: -1.33,
      oneMonth: 16.61,
      sixMonth: -18.43,
      oneYear: -20.87,
      score: 38,
      stance: "Sell" as const,
      rationale: "Long-run declines outweigh the recent bounce.",
      source: "ai" as const,
    },
  ],
};

const baseResult = {
  stockA: "TCS",
  stockB: "INFY",
  winner: "A" as const,
  verdict: "TCS looks stronger right now.",
  stockAPros: ["Strong margins"],
  stockACons: ["Rich valuation"],
  stockBPros: ["Diversified clients"],
  stockBCons: ["Slower growth"],
  stockAScore: 80,
  stockBScore: 70,
  source: "ai" as const,
};

describe("AiStockCompare", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("opens on a default pairing, picked through the sector-grouped dropdowns", () => {
    render(<AiStockCompare />);

    expect(screen.getByText("Stock A")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText(/Tata Consultancy Services · Information Technology · Large cap/)).toBeInTheDocument();
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare with AI" })).toBeEnabled();
  });

  it("cannot be submitted with a side cleared", async () => {
    const user = userEvent.setup();
    render(<AiStockCompare />);

    // Each picker exposes its own Clear; the first belongs to stock A.
    await user.click(screen.getAllByRole("button", { name: "Clear" })[0]);

    expect(screen.getByRole("button", { name: "Compare with AI" })).toBeDisabled();
    expect(screen.getByText("Pick both sides to run the head-to-head.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // The pickers live inside the form, so Enter in a search box can submit it even while the
  // Compare button is disabled — the handler has to refuse on its own.
  it("refuses a submit that bypasses the disabled button", async () => {
    const user = userEvent.setup();
    const { container } = render(<AiStockCompare />);

    await user.click(screen.getAllByRole("button", { name: "Clear" })[0]);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resets both sides", async () => {
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getAllByText(/Pick the (first|second) stock/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("keeps the stock chosen on one side out of the other side's list", async () => {
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: /Tata Consultancy Services/ }));
    await user.type(screen.getByLabelText("Search stocks for Stock A"), "INFY");

    expect(screen.getByText(/No stock matches “INFY”/)).toBeInTheDocument();
  });

  it("shows a loading label and posts the two symbols on submit", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    expect(screen.getByRole("button", { name: "Comparing..." })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/compare",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockA: "TCS", stockB: "INFY" }),
      })
    );

    resolveFetch({ ok: true, json: () => Promise.resolve(baseResult) });
    await waitFor(() => expect(screen.getByRole("button", { name: "Compare with AI" })).toBeInTheDocument());
  });

  it("renders the winner-A verdict, scores, pros/cons, and 'Generated by AI agent' provenance", async () => {
    mockFetchOnce(true, baseResult);
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() => expect(screen.getByText("TCS looks stronger right now.")).toBeInTheDocument());
    // "TCS" appears both as the winner-verdict badge and the stockA card heading.
    expect(screen.getAllByText("TCS").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Score 80/100")).toBeInTheDocument();
    expect(screen.getByText("Score 70/100")).toBeInTheDocument();
    expect(screen.getByText("Strong margins")).toBeInTheDocument();
    expect(screen.getByText("Rich valuation")).toBeInTheDocument();
    expect(screen.getByText("Diversified clients")).toBeInTheDocument();
    expect(screen.getByText("Slower growth")).toBeInTheDocument();
    expect(screen.getByText(/Generated by AI agent/)).toBeInTheDocument();
  });

  it("renders the winner-B verdict label", async () => {
    mockFetchOnce(true, { ...baseResult, winner: "B" as const });
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() => expect(screen.getByText("INFY", { selector: "span.bg-violet-600" })).toBeInTheDocument());
  });

  it("renders 'Too close to call' for a Tie, and the heuristic-demo provenance line", async () => {
    mockFetchOnce(true, { ...baseResult, winner: "Tie" as const, source: "demo" as const });
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() => expect(screen.getByText("Too close to call")).toBeInTheDocument());
    expect(screen.getByText(/Heuristic demo \(no AI key configured\)/)).toBeInTheDocument();
  });

  it("shows 'No points returned.' when a pros/cons list is empty", async () => {
    mockFetchOnce(true, { ...baseResult, stockAPros: [], stockACons: [], stockBPros: [], stockBCons: [] });
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() => expect(screen.getAllByText("No points returned.")).toHaveLength(4));
  });

  it("shows an error message when the response is not ok", async () => {
    mockFetchOnce(false);
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't run the comparison right now. Please try again shortly.")).toBeInTheDocument()
    );
  });

  it("shows an error message when fetch rejects", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't run the comparison right now. Please try again shortly.")).toBeInTheDocument()
    );
  });

  it("lets the user swap both sides through the dropdowns before submitting", async () => {
    mockFetchOnce(true, baseResult);
    const user = userEvent.setup();
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: /Tata Consultancy Services/ }));
    await user.type(screen.getByLabelText("Search stocks for Stock A"), "RELIANCE");
    await user.click(screen.getByRole("option", { name: /^RELIANCE/ }));

    await user.click(screen.getByRole("button", { name: /Infosys/ }));
    await user.type(screen.getByLabelText("Search stocks for Stock B"), "ONGC");
    await user.click(screen.getByRole("option", { name: /^ONGC/ }));

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/compare",
        expect.objectContaining({ body: JSON.stringify({ stockA: "RELIANCE", stockB: "ONGC" }) })
      )
    );
  });

  it("lays the pairing out in the same cards the three-stock comparison uses", async () => {
    const user = userEvent.setup();
    mockFetchOnce(true, baseResult);
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    // One card per stock, carrying the same figures and call as the other compare section. The
    // pros/cons lists are list items too, so the card is found by its price.
    const card = (await screen.findByText("₹2,399.40")).closest("li")!;
    expect(within(card).getByText("Large cap")).toBeInTheDocument();
    expect(within(card).getByText("+16.61%")).toBeInTheDocument();
    expect(within(card).getByText("SELL")).toBeInTheDocument();
    expect(within(card).getByText(/Long-run declines outweigh/)).toBeInTheDocument();
  });

  it("still shows the AI head-to-head when only the performance cards fail", async () => {
    const user = userEvent.setup();
    mockFetchOnce(true, baseResult, { ok: false });
    render(<AiStockCompare />);

    await user.click(screen.getByRole("button", { name: "Compare with AI" }));

    expect(await screen.findByText(baseResult.verdict)).toBeInTheDocument();
    expect(screen.queryByText("₹2,399.40")).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't run the comparison/)).not.toBeInTheDocument();
  });
});
