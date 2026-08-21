import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StockAnalysisSection } from "../../app/components/stock-analysis-section";
import type {
  AlternativePick,
  ScoredStock,
  SearchedStockAnalysis,
  StockBuyReport,
} from "../../app/lib/stock-buy-analysis";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

// The real combobox is a whole dropdown over /api/stocks/suggest with its own suite. Here it stands
// in as the plain input it wraps, plus a button for the "picked a row" path, so these tests drive
// this section rather than that one.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: ({
    value,
    onChange,
    onSelect,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (symbol: string) => void;
    placeholder?: string;
  }) => (
    <>
      <input aria-label="stock" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" onClick={() => onSelect?.("INFY")}>
        pick INFY
      </button>
    </>
  ),
}));

function scored(overrides: Partial<ScoredStock> & Pick<ScoredStock, "symbol" | "name">): ScoredStock {
  return {
    sector: "Information Technology",
    capTier: "Large",
    logo: null,
    currency: "INR",
    price: 1450.5,
    previousClose: 1430,
    changePercent: 1.43,
    dayLow: 1425,
    dayHigh: 1460,
    volume: 1_250_000,
    turnoverCr: 182.4,
    marketCapCr: 528_000,
    marketCapRank: 4,
    oneWeek: 1.2,
    oneMonth: 3.4,
    sixMonth: -2.1,
    oneYear: 18.9,
    threeYear: 44.2,
    score: 71,
    call: "Buy",
    ...overrides,
  };
}

function searched(overrides: Partial<SearchedStockAnalysis> = {}): SearchedStockAnalysis {
  return {
    ...scored({ symbol: "RELIANCE", name: "Reliance Industries Ltd" }),
    headline: "Buy - Reliance Industries Ltd scores 71/100",
    summary: "The measurements back a buy over the medium-term windows.",
    strengths: ["Up +18.9% over the past year."],
    risks: ["Down -2.1% over six months."],
    ...overrides,
  };
}

function alternative(
  rank: number,
  overrides: Partial<AlternativePick> & Pick<AlternativePick, "symbol" | "name">,
): AlternativePick {
  return {
    ...scored(overrides),
    rank,
    edge: `${overrides.name} scores better than RELIANCE on the same weighted windows.`,
    ...overrides,
  };
}

function report(overrides: Partial<StockBuyReport> = {}): StockBuyReport {
  return {
    stock: searched(),
    alternatives: [
      alternative(1, { symbol: "TCS", name: "Tata Consultancy Services Ltd", score: 84, call: "Buy", price: 3900.25 }),
      alternative(2, { symbol: "INFY", name: "Infosys Ltd", score: 58, call: "Hold", price: 1620.75 }),
      alternative(3, { symbol: "WIPRO", name: "Wipro Ltd", score: 31, call: "Avoid", price: 244.6 }),
      alternative(4, { symbol: "HCLTECH", name: "HCL Technologies Ltd", score: 30, price: 1502.1 }),
      alternative(5, { symbol: "TECHM", name: "Tech Mahindra Ltd", score: 29, price: 1610.4 }),
    ],
    drawnFrom: "Information Technology",
    sessionDate: "2026-08-20",
    generatedAt: "2026-08-21T04:00:00.000Z",
    source: "ai",
    ...overrides,
  };
}

/** One fetch answer, shaped the way the route answers. */
function answer(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

/**
 * The two feeds this section talks to, routed by URL.
 *
 * The movers board is asked once on mount for the session's leader, so it cannot be a positional
 * mock: every test would have to spend its first answer on a request it is not about. `leader`
 * overrides that reply; `answers` are the analysis replies, in order.
 */
function mockFetch(...answers: Response[]) {
  return mockFeeds({ analysis: answers });
}

function mockFeeds({ analysis = [] as Response[], leader = answer({ rows: [] }) } = {}) {
  const queue = [...analysis];
  const fetchMock = jest.fn((url: string) =>
    url.startsWith(LEADER_URL) ? Promise.resolve(leader) : Promise.resolve(queue.shift() as Response),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const LEADER_URL = "/api/market/bse/movers";

/** The analysis calls only — the leader lookup is noise in an assertion about what was analysed. */
function analysisCalls(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.map(([url]) => url as string).filter((url) => !url.startsWith(LEADER_URL));
}

function analyse() {
  fireEvent.click(screen.getByRole("button", { name: "Analyse stock" }));
}

/** The alternative cards currently on screen — the rows carrying a score chip. */
function pickCards() {
  return screen.getAllByRole("listitem").filter((item) => within(item).queryByText(/^Score /));
}

function symbolOf(card: HTMLElement) {
  return within(card).getByText(/^[A-Z]{2,}$/).textContent;
}

describe("StockAnalysisSection", () => {
  it("opens as a search box with no analysis run", async () => {
    const fetchMock = mockFetch();
    render(<StockAnalysisSection />);

    expect(screen.getByRole("heading", { name: /Search any BSE stock/ })).toBeInTheDocument();
    expect(screen.getByText("Every listed BSE company")).toBeInTheDocument();
    expect(screen.getByText(/Search a company above to get its buy verdict/)).toBeInTheDocument();

    // The leader lookup is the only thing that fires unasked, and it costs no model call.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(analysisCalls(fetchMock)).toEqual([]);
  });

  // The box opens on whoever is actually leading the session rather than on a name we picked.
  it("starts on today's top performer once the movers feed names it", async () => {
    mockFeeds({ leader: answer({ rows: [{ ticker: "IDEA", changePercent: 12.4 }] }) });
    render(<StockAnalysisSection />);

    await waitFor(() => expect(screen.getByLabelText("stock")).toHaveValue("IDEA"));
    expect(screen.getByText(/top performer on the BSE/)).toBeInTheDocument();
    expect(screen.getByText("+12.40%")).toBeInTheDocument();
  });

  it("still names the leader when the exchange reports no move for it", async () => {
    mockFeeds({ leader: answer({ rows: [{ ticker: "IDEA" }] }) });
    render(<StockAnalysisSection />);

    await waitFor(() => expect(screen.getByLabelText("stock")).toHaveValue("IDEA"));
    expect(screen.getByText(/top performer on the BSE/)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it.each([
    ["an empty board", answer({ rows: [] })],
    ["a row with no ticker on it", answer({ rows: [{ changePercent: 4 }] })],
    ["a refusal from the feed", answer({ error: "down" }, false, 502)],
  ])("keeps its stand-in ticker given %s", async (_case, leader) => {
    mockFeeds({ leader });
    render(<StockAnalysisSection />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByLabelText("stock")).toHaveValue("RELIANCE");
    expect(screen.queryByText(/top performer on the BSE/)).not.toBeInTheDocument();
  });

  it("keeps its stand-in ticker when the movers feed cannot be reached", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(<StockAnalysisSection />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByLabelText("stock")).toHaveValue("RELIANCE");
  });

  // A reader who has already started typing owns the box, however late the leader lands.
  it("never overwrites a ticker the reader has already typed", async () => {
    let name: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => { name = resolve; });
    global.fetch = jest.fn(() => pending) as unknown as typeof fetch;

    render(<StockAnalysisSection />);
    fireEvent.change(screen.getByLabelText("stock"), { target: { value: "TITAN" } });

    name(answer({ rows: [{ ticker: "IDEA", changePercent: 12.4 }] }));
    await waitFor(() => expect(screen.getByText(/top performer on the BSE/)).toBeInTheDocument());
    expect(screen.getByLabelText("stock")).toHaveValue("TITAN");
  });

  it("asks the route about the ticker in the box and renders both panels", async () => {
    const fetchMock = mockFetch(answer(report()));
    render(<StockAnalysisSection />);

    analyse();

    // The skeleton stands in until the report lands, so the page does not jump.
    expect(screen.getByText(/Reading RELIANCE's market value/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analysing…" })).toBeDisabled();

    expect(await screen.findByText("Buy - Reliance Industries Ltd scores 71/100")).toBeInTheDocument();
    expect(analysisCalls(fetchMock)).toEqual(["/api/ai/stock-analysis?symbol=RELIANCE"]);

    // The verdict: the call, the score meter, and the market value the call was measured against.
    const meter = screen.getByRole("meter", { name: "Momentum score out of 100" });
    expect(meter).toHaveAttribute("aria-valuenow", "71");
    expect(screen.getByText("₹1,450.50")).toBeInTheDocument();
    expect(screen.getByText("₹5,28,000 Cr")).toBeInTheDocument();
    expect(screen.getByText("12.50 L")).toBeInTheDocument();
    expect(screen.getByText("Up +18.9% over the past year.")).toBeInTheDocument();
    expect(screen.getByText("Down -2.1% over six months.")).toBeInTheDocument();
    expect(screen.getByText("Worth buying on the measured trend")).toBeInTheDocument();

    // The instead-of panel: the best three on the opening page, each saying what it does better.
    expect(screen.getByText("5 to consider instead of RELIANCE")).toBeInTheDocument();
    expect(screen.getByText(/From Information Technology/)).toBeInTheDocument();
    expect(screen.getByText("6 names compared")).toBeInTheDocument();

    const picks = pickCards();
    expect(picks).toHaveLength(3);
    expect(within(picks[0]).getByText("TCS")).toBeInTheDocument();
    expect(within(picks[0]).getByText("#1")).toBeInTheDocument();
    expect(within(picks[0]).getByText("Score 84")).toBeInTheDocument();
    expect(within(picks[0]).getByText(/Better than RELIANCE:/)).toBeInTheDocument();
    expect(within(picks[1]).getByText("Hold")).toBeInTheDocument();
    expect(within(picks[2]).getByText("Avoid")).toBeInTheDocument();
  });

  // Three per page: the whole shortlist down the right of a single verdict would run far past it.
  it("pages the alternatives three at a time", async () => {
    mockFetch(answer(report()));
    render(<StockAnalysisSection />);

    analyse();
    await screen.findByText("5 to consider instead of RELIANCE");

    expect(screen.getByText(/Showing/)).toHaveTextContent("Showing 1–3 of 5 stocks");
    expect(pickCards().map(symbolOf)).toEqual(["TCS", "INFY", "WIPRO"]);

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(pickCards().map(symbolOf)).toEqual(["HCLTECH", "TECHM"]);

    fireEvent.click(screen.getByRole("button", { name: /Prev/ }));
    expect(pickCards().map(symbolOf)).toEqual(["TCS", "INFY", "WIPRO"]);
  });

  it("analyses a company as soon as it is picked from the dropdown", async () => {
    const fetchMock = mockFetch(answer(report({ stock: searched({ symbol: "INFY", name: "Infosys Ltd" }) })));
    render(<StockAnalysisSection />);

    fireEvent.click(screen.getByRole("button", { name: "pick INFY" }));

    await waitFor(() => expect(analysisCalls(fetchMock)).toEqual(["/api/ai/stock-analysis?symbol=INFY"]));
    expect(await screen.findByText("5 to consider instead of INFY")).toBeInTheDocument();
    expect(screen.getByLabelText("stock")).toHaveValue("INFY");
  });

  // Clearing the box clears the answer: a verdict standing under an empty search field would read
  // as the answer to whatever gets typed next.
  it("empties both panels when the search is cleared", async () => {
    mockFetch(answer(report()));
    render(<StockAnalysisSection />);

    analyse();
    expect(await screen.findByText("Buy - Reliance Industries Ltd scores 71/100")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("stock"), { target: { value: "" } });

    expect(screen.queryByText("Buy - Reliance Industries Ltd scores 71/100")).not.toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText("5 to consider instead of RELIANCE")).not.toBeInTheDocument();
    expect(screen.getByText(/Search a company above to get its buy verdict/)).toBeInTheDocument();
    expect(screen.getByText("Every listed BSE company")).toBeInTheDocument();
  });

  it("says unclassified and dashes the cap when the exchange carries neither", async () => {
    mockFetch(
      answer(
        report({
          stock: searched({ capTier: null, marketCapCr: null }),
          alternatives: [alternative(1, { symbol: "TCS", name: "Tata Consultancy Services Ltd", capTier: null })],
        }),
      ),
    );
    render(<StockAnalysisSection />);

    analyse();

    expect(await screen.findByText("Unclassified cap")).toBeInTheDocument();
    expect(screen.getByText("Tata Consultancy Services Ltd · Unclassified cap")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("2 names compared")).toBeInTheDocument();
  });

  it("shows the route's own words for a ticker nobody lists", async () => {
    mockFetch(answer({ error: 'No BSE-listed company matches "ZZZZ".' }, false, 404));
    render(<StockAnalysisSection />);

    fireEvent.change(screen.getByLabelText("stock"), { target: { value: "zzzz" } });
    analyse();

    expect(await screen.findByText('No BSE-listed company matches "ZZZZ".')).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("falls back to its own message when the route fails without one", async () => {
    mockFetch(answer({}, false, 500));
    render(<StockAnalysisSection />);

    analyse();

    expect(await screen.findByText("Couldn't analyse that stock right now.")).toBeInTheDocument();
  });

  it("refuses an empty box rather than asking the route about nothing", async () => {
    const fetchMock = mockFetch();
    render(<StockAnalysisSection />);

    fireEvent.change(screen.getByLabelText("stock"), { target: { value: "  " } });
    analyse();

    expect(await screen.findByText("Search for a BSE-listed stock to analyse.")).toBeInTheDocument();
    expect(analysisCalls(fetchMock)).toEqual([]);
  });

  it("reports an unreachable analysis service", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<StockAnalysisSection />);

    analyse();

    expect(await screen.findByText(/Couldn't reach the analysis service/)).toBeInTheDocument();
  });
});
