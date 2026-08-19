// The landing page's trending section: two boards side by side, not one list.
//
// What the exchange crowded *into* and what it crowded *out of*, because a stock being dumped
// prints exactly as busy a tape as one being bought and the old single ranking put both under a
// heading that read as buying. The split is the sign of the session's move, the filters are shared
// across the two, and the pages are not — most of what is checked here is that those three things
// stay true.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BseTrendingBoard, TrendingRow, buildTrendingUrl } from "../../app/components/bse-trending-board";
import type { BseTrendingBoard as BseTrendingPayload, BseTrendingRow } from "../../app/lib/bse-market";

jest.setTimeout(30000);

// The exchange-wide type-ahead has a suite of its own; here it is stubbed to the input so these
// tests are about the board rather than the combobox.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: (props: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
  ),
}));

function row(overrides: Partial<BseTrendingRow> = {}): BseTrendingRow {
  return {
    code: "500180",
    ticker: "HDFCBANK",
    name: "HDFC Bank Ltd",
    group: "A",
    isin: "INE040A01034",
    capTier: "Large",
    rank: 2,
    marketCapCr: 1_500_000,
    url: "",
    sector: "Financial Services",
    industry: "Banks",
    price: 727.35,
    previousClose: 727,
    change: 0.35,
    changePercent: 0.05,
    open: 726,
    dayHigh: 730,
    dayLow: 724,
    volume: 4_390_000,
    turnoverCr: 319.4,
    trades: 28_254,
    turnoverShare: 3.52,
    averageTradeValue: 113_029,
    returnPercent: 12.5,
    brokers: [],
    brokerRank: null,
    liveQuote: null,
    ...overrides,
  };
}

/** A live print sitting on top of a row's session close, as ../lib/bse-market attaches it. */
function live(overrides: Partial<NonNullable<BseTrendingRow["liveQuote"]>> = {}) {
  return {
    price: 812.4,
    change: 85.05,
    changePercent: 11.69,
    dayHigh: 815,
    dayLow: 726,
    asOf: "2026-08-18T06:00:00.000Z",
    ...overrides,
  };
}

// A freshly listed, unclassified scrip on a group letter that maps to no known platform: every
// optional field arrives null at once, and none of them may take the row down.
const SPARSE = row({
  code: "544865",
  ticker: "LEAPIND",
  name: "Leap India Ltd",
  group: "??",
  sector: null,
  capTier: null,
  changePercent: null,
  turnoverCr: null,
  turnoverShare: null,
  averageTradeValue: null,
  trades: null,
  volume: null,
  price: null,
  dayHigh: null,
  dayLow: null,
  // Listed after the reference session, so there is no return to measure. A dash, never a zero.
  returnPercent: null,
});

const SME = row({
  code: "543279",
  ticker: "SMECO",
  name: "Small Enterprise Co Ltd",
  group: "M",
  capTier: "Small",
  sector: "Capital Goods",
  price: 88,
  changePercent: 10,
  turnoverCr: 0.35,
  trades: 300,
  turnoverShare: 0.01,
  averageTradeValue: 11_666,
  returnPercent: -4.2,
});

/** The selling side, so a test can tell which of the two boards it is looking at. */
const FALLER = row({
  code: "532822",
  ticker: "IDEA",
  name: "Vodafone Idea Ltd",
  group: "B",
  sector: "Telecommunication",
  capTier: "Small",
  price: 14.1,
  changePercent: -1.4,
  volume: 54_953_475,
  turnoverCr: 77.5,
  trades: 567_272,
  turnoverShare: 0.85,
  averageTradeValue: 1355,
  returnPercent: -33.3,
});

const BOARDS: Record<string, BseTrendingRow[]> = {
  turnover: [row(), SPARSE, SME],
  trades: [row({ code: "500325", ticker: "RELIANCE", name: "Reliance Industries Ltd", trades: 567_272 })],
  volume: [SPARSE],
  brokers: [
    row({ brokers: [{ broker: "groww", brokerName: "Groww", label: "Most bought on Groww", rank: 1 }], brokerRank: 1 }),
  ],
};

function payload(rank: string, overrides: Partial<BseTrendingPayload> = {}): BseTrendingPayload {
  const rows = overrides.rows ?? BOARDS[rank];
  return {
    rows,
    rank: rank as BseTrendingPayload["rank"],
    direction: "bought",
    returnPeriod: "1m",
    returnFrom: "2026-07-14",
    totals: { turnoverCr: 9075, volume: 1_000_000, trades: 2_000_000, traded: 4419 },
    platforms: [
      { platform: "Main Board", count: 2 },
      { platform: "SME", count: 1 },
    ],
    total: rows.length,
    page: 1,
    pageSize: 5,
    pages: 1,
    sessionDate: "2026-08-14",
    marketSession: "closed",
    liveAsOf: null,
    ...overrides,
  };
}

/** The buying board's rows for the ranking asked for; the selling board always gets the faller. */
function bySide(url: URL): BseTrendingPayload {
  const rank = url.searchParams.get("rank") ?? "turnover";
  return url.searchParams.get("direction") === "sold"
    ? payload(rank, { direction: "sold", rows: [FALLER], total: 1 })
    : payload(rank);
}

function mockFeed(build: (url: URL) => BseTrendingPayload = bySide) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    return { ok: true, json: async () => build(url) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const BOUGHT_URL = "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&direction=bought";
const SOLD_URL = "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&direction=sold";

/** The panel one side of the section draws, found by the label it carries for assistive tech. */
function panel(side: "bought" | "sold") {
  return screen.getByRole("region", {
    name: side === "bought" ? "Most bought on BSE this session" : "Most sold on BSE this session",
  });
}

describe("buildTrendingUrl", () => {
  it("leaves every default off the query string", () => {
    expect(buildTrendingUrl("brokers", "", "all", "all", "all", "0", 1)).toBe(
      "/api/market/bse/trending?rank=brokers&page=1&pageSize=5",
    );
  });

  it("carries the search, platform, tier and move filters when they are set", () => {
    expect(buildTrendingUrl("trades", "hdfc", "SME", "groww", "large", "5", 3)).toBe(
      "/api/market/bse/trending?rank=trades&page=3&pageSize=5&q=hdfc&platform=SME&broker=groww&tier=large&min=5",
    );
  });

  it("names the half of the tape and the return window once they leave their defaults", () => {
    expect(buildTrendingUrl("turnover", "", "all", "all", "all", "0", 1, "sold", "3y")).toBe(
      "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&direction=sold&period=3y",
    );
  });
});

describe("TrendingRow", () => {
  it("shows the ranked figure for whichever ranking it is drawn under", () => {
    const { rerender } = render(
      <ul>
        <TrendingRow row={row()} rank="turnover" position={1} returnLabel="1M" />
      </ul>,
    );
    expect(screen.getByText("₹319 Cr")).toBeInTheDocument();

    rerender(
      <ul>
        <TrendingRow row={row()} rank="volume" position={1} returnLabel="1M" />
      </ul>,
    );
    expect(screen.getByText("43.90 L")).toBeInTheDocument();

    rerender(
      <ul>
        <TrendingRow row={row()} rank="trades" position={1} returnLabel="1M" />
      </ul>,
    );
    expect(screen.getByText("28,254")).toBeInTheDocument();
  });

  it("reports the trailing return under the window it was measured over", () => {
    const { rerender } = render(
      <ul>
        <TrendingRow row={row()} rank="turnover" position={1} returnLabel="1M" />
      </ul>,
    );
    expect(screen.getByText("1M return")).toBeInTheDocument();
    expect(screen.getByText("+12.50%")).toBeInTheDocument();

    rerender(
      <ul>
        <TrendingRow row={row()} rank="turnover" position={1} returnLabel="5Y" />
      </ul>,
    );
    expect(screen.getByText("5Y return")).toBeInTheDocument();
  });

  // A company younger than the window genuinely has no return over it. A zero would claim it went
  // nowhere, which is a different — and false — statement.
  it("draws a dash for a company with no return over the window", () => {
    render(
      <ul>
        <TrendingRow row={SPARSE} rank="turnover" position={1} returnLabel="3Y" />
      </ul>,
    );
    const stat = screen.getByText("3Y return").closest("div") as HTMLElement;
    expect(within(stat).getByText("—")).toBeInTheDocument();
  });
});

describe("BSE trending board", () => {
  it("draws both halves of the tape, side by side", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    await screen.findByText("HDFC Bank Ltd");
    expect(within(panel("bought")).getByText("HDFC Bank Ltd")).toBeInTheDocument();
    expect(within(panel("sold")).getByText("Vodafone Idea Ltd")).toBeInTheDocument();

    // Each side says what its own word actually means, rather than leaving "bought" to be read as
    // order flow the exchange does not publish.
    expect(screen.getByText("Trading above the previous close — money going in")).toBeInTheDocument();
    expect(screen.getByText("Trading below the previous close — money coming out")).toBeInTheDocument();
  });

  it("asks the endpoint for one half of the tape per board", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(fetchMock).toHaveBeenCalledWith(BOUGHT_URL);
    expect(fetchMock).toHaveBeenCalledWith(SOLD_URL);
  });

  it("leads each row with the company's real name, sector and cap tier", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("HDFC Bank Ltd")).closest("li") as HTMLElement;
    expect(within(card).getByText("HDFCBANK · 500180")).toBeInTheDocument();
    expect(within(card).getByText("Financial Services")).toBeInTheDocument();
    expect(within(card).getByText("Large cap")).toBeInTheDocument();

    // The exchange-wide count, not the page's — it describes the session rather than the board.
    expect(screen.getByText("4,419 traded")).toBeInTheDocument();
  });

  it("opens on exchange turnover, which is where the session's money went", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.getByText("Ranked by the rupees that changed hands.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "By turnover (₹)" })).toHaveAttribute("aria-pressed", "true");

    // A row the exchange published no turnover for draws a dash rather than a zero.
    const unplaced = (await screen.findByText("Leap India Ltd")).closest("li") as HTMLElement;
    expect(within(unplaced).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("names no platform but the exchange — no broker ranking, and no broker filter", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    for (const name of ["Groww", "Zerodha", "Angel One", "Upstox", "ICICI Direct", "All BSE"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Broker lists/i)).not.toBeInTheDocument();
  });

  it("re-ranks both boards at once when the ranking changes", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "By trade count" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/trending?rank=trades&page=1&pageSize=5&direction=bought"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/trending?rank=trades&page=1&pageSize=5&direction=sold");
    expect(screen.getByText("Ranked by how many separate transactions were struck.")).toBeInTheDocument();
    expect(await screen.findByText("Reliance Industries Ltd")).toBeInTheDocument();
  });

  it("re-ranks by share volume", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: "By volume (shares)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/trending?rank=volume&page=1&pageSize=5&direction=bought"),
    );
    expect(screen.getByText("Ranked by the number of shares that moved.")).toBeInTheDocument();
  });

  it("puts the rank under the logo rather than beside it", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    // Third row on page one, drawn muted in the logo's own column.
    const badge = within(card).getByText("3");
    expect(badge.className).toContain("text-slate-400");
    expect(badge.previousElementSibling).not.toBeNull();
  });

  it("keeps exchange segment names out of SME listings", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    expect(within(card).queryByText("BSE SME")).not.toBeInTheDocument();
    expect(within(card).getByText("Capital Goods")).toBeInTheDocument();
    expect(within(card).getByText("Small cap")).toBeInTheDocument();
  });

  it("renders a sparse row as dashes and draws no platform, sector or tier pill", async () => {
    mockFeed();
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Leap India Ltd")).closest("li") as HTMLElement;
    expect(within(card).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(card).queryByText(/^BSE /)).not.toBeInTheDocument();
    expect(within(card).queryByText(/cap$/)).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The shared filters
  // ---------------------------------------------------------------------------

  it("searches the exchange and offers to clear the filters once one is set", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search any BSE company/), "hdfc");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&q=hdfc&direction=bought",
      ),
    );
    // One search, both boards: it is one question asked of two lists.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&q=hdfc&direction=sold",
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(BOUGHT_URL));
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("filters by stock shortcut, by cap tier and by the size of the move", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(screen.getByRole("button", { name: /HDFC Bank\s+HDFCBANK/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&q=HDFCBANK&direction=bought",
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Market cap tier"), "small");
    await userEvent.selectOptions(screen.getByLabelText("Minimum move"), "5");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&q=HDFCBANK&tier=small&min=5&direction=bought",
      ),
    );

    // Back to every company, with the other two filters left alone.
    await userEvent.click(screen.getByRole("button", { name: "All Platform" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&tier=small&min=5&direction=bought",
      ),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("platform="))).toBe(false);
  });

  it("changes the return window on both boards, and leaves it alone when the filters are cleared", async () => {
    const fetchMock = mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.selectOptions(screen.getByLabelText("Return period"), "3y");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&direction=bought&period=3y",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/market/bse/trending?rank=turnover&page=1&pageSize=5&direction=sold&period=3y",
    );
    expect(screen.getAllByText("3Y return").length).toBeGreaterThan(0);

    // The window narrows nothing, so it is not one of the filters "Clear filters" offers to undo —
    // it does not even bring the button out, and a search that does leaves the window where it was.
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search any BSE company/), "hdfc");
    await userEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByText("3Y return").length).toBeGreaterThan(0);
  });

  it("shows stock shortcuts instead of exchange segment chips", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.getByRole("group", { name: "Popular stock shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Platform" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /HDFC Bank\s+HDFCBANK/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /BSE Z Group/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /BSE SME/ })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Two lists, two pagers
  // ---------------------------------------------------------------------------

  it("pages one side without moving the other", async () => {
    const fetchMock = mockFeed((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      const sold = url.searchParams.get("direction") === "sold";
      if (sold) return payload("turnover", { direction: "sold", rows: [FALLER], total: 1 });
      return payload("turnover", { total: 8, page, pages: 2, rows: page === 1 ? BOARDS.turnover : [SME] });
    });
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    await userEvent.click(within(panel("bought")).getByRole("button", { name: "Next →" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/trending?rank=turnover&page=2&pageSize=5&direction=bought"),
    );
    // Page two of a five-a-page board starts at the sixth rank.
    const card = (await within(panel("bought")).findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    expect(within(card).getByText("6")).toBeInTheDocument();

    // The selling board was never asked for a second page.
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("page=2&pageSize=5&direction=sold"))).toBe(true);
    expect(within(panel("sold")).getByText("Vodafone Idea Ltd")).toBeInTheDocument();
  });

  it("pages the selling board on its own pager", async () => {
    const fetchMock = mockFeed((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (url.searchParams.get("direction") !== "sold") return payload("turnover");
      return payload("turnover", { direction: "sold", total: 7, page, pages: 2, rows: page === 1 ? [FALLER] : [SME] });
    });
    render(<BseTrendingBoard />);
    await screen.findByText("Vodafone Idea Ltd");

    await userEvent.click(within(panel("sold")).getByRole("button", { name: "Next →" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/market/bse/trending?rank=turnover&page=2&pageSize=5&direction=sold"),
    );
    expect(await within(panel("sold")).findByText("Small Enterprise Co Ltd")).toBeInTheDocument();
    // And the buying board stayed where it was.
    expect(within(panel("bought")).getByText("HDFC Bank Ltd")).toBeInTheDocument();
  });

  it("tells an unpublished session apart from empty filters, per side", async () => {
    mockFeed((url) =>
      payload(url.searchParams.get("rank") ?? "turnover", {
        direction: url.searchParams.get("direction") === "sold" ? "sold" : "bought",
        rows: [],
        total: 0,
        platforms: [],
      }),
    );
    render(<BseTrendingBoard />);

    // Every ranking here is read from the same exchange file, so an empty board means one thing.
    expect((await screen.findAllByText(/hasn't published a complete session file yet/)).length).toBe(2);

    await userEvent.selectOptions(screen.getByLabelText("Minimum move"), "10");
    expect(await screen.findByText("No rising BSE stock matches those filters this session.")).toBeInTheDocument();
    expect(screen.getByText("No falling BSE stock matches those filters this session.")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The session, and which clock each figure runs on
  // ---------------------------------------------------------------------------

  /**
   * Which session, and what the exchange is doing about it.
   *
   * The board used to say "today" in its heading and nothing at all about the session its figures
   * came from. During market hours that was false: the ranking is the last *completed* session's,
   * because BSE's own file only covers all ~4,900 scrips after the close. A reader at noon was
   * reading yesterday, told it was today.
   */
  it("dates the session it ranked and says the exchange is shut", async () => {
    mockFeed();
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(screen.getByText("Market closed")).toBeInTheDocument();
    expect(screen.getByText("Ranked on the session of 14 Aug 2026")).toBeInTheDocument();
    // Nothing is refreshing, so nothing claims to be.
    expect(screen.queryByText(/Prices refresh every/)).not.toBeInTheDocument();
  });

  it("says the market is live, prices the rows against it, and refreshes faster", async () => {
    mockFeed((url) =>
      payload(url.searchParams.get("rank") ?? "turnover", {
        marketSession: "live",
        liveAsOf: "2026-08-18T06:00:00.000Z",
        rows: url.searchParams.get("direction") === "sold" ? [FALLER] : [row({ liveQuote: live() })],
      }),
    );
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("HDFC Bank Ltd")).closest("li") as HTMLElement;
    // The session state arrives with the payload and is adopted a render later, so this settles
    // asynchronously — the board opens on the slower cadence and moves onto the faster one.
    expect(await screen.findByText("Market live")).toBeInTheDocument();
    expect(screen.getByText("Prices refresh every 30s while the market is open")).toBeInTheDocument();

    // The live price leads, the live move is the chip beside it...
    expect(within(card).getByText("₹812.40")).toBeInTheDocument();
    expect(within(card).getByText("+11.69%")).toBeInTheDocument();
    // ...and the close the ranking was actually computed from is still on the row, because that is
    // the number the ordering means. A live price alone would be ranked by a figure it never shows.
    expect(within(card).getByText("Close ₹727.35")).toBeInTheDocument();
  });

  it("leaves a row the feed had nothing live for on its session close", async () => {
    mockFeed((url) =>
      payload(url.searchParams.get("rank") ?? "turnover", {
        marketSession: "live",
        liveAsOf: "2026-08-18T06:00:00.000Z",
        rows: url.searchParams.get("direction") === "sold" ? [FALLER] : [row({ liveQuote: live() }), SME],
      }),
    );
    render(<BseTrendingBoard />);

    const card = (await screen.findByText("Small Enterprise Co Ltd")).closest("li") as HTMLElement;
    expect(within(card).getByText("₹88.00")).toBeInTheDocument();
    expect(within(card).queryByText(/^Close /)).not.toBeInTheDocument();
  });

  it("counts both halves of the session in one sentence", async () => {
    mockFeed((url) =>
      url.searchParams.get("direction") === "sold"
        ? payload("turnover", { direction: "sold", rows: [FALLER], total: 1_902 })
        : payload("turnover", { total: 2_310 }),
    );
    render(<BseTrendingBoard />);
    await screen.findByText("HDFC Bank Ltd");

    expect(
      await screen.findByText(
        "2,310 BSE stocks closed above their previous close this session and 1,902 closed below it, across 4,419 scrips that traded.",
      ),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The server's opening payload
  // ---------------------------------------------------------------------------

  /**
   * The one thing the server's render cannot do for this board.
   *
   * It resolves the opening view into the HTML, which is what saves the reader a round trip — but
   * it cannot reach the quote feed while doing so, so during market hours that payload arrives
   * ranked and dated with no live half to its prices. The board renders it anyway and asks the
   * endpoint, which has no such limit, immediately.
   */
  it("asks again at once when the server's payload arrived without live prices", async () => {
    const fetchMock = mockFeed((url) =>
      payload("turnover", {
        marketSession: "live",
        liveAsOf: "2026-08-18T06:00:00.000Z",
        rows: url.searchParams.get("direction") === "sold" ? [FALLER] : [row({ liveQuote: live() })],
      }),
    );

    render(
      <BseTrendingBoard
        prefetched={{ url: BOUGHT_URL, data: payload("turnover", { marketSession: "live", liveAsOf: null }) }}
        soldPrefetched={{
          url: SOLD_URL,
          data: payload("turnover", { direction: "sold", marketSession: "live", liveAsOf: null, rows: [FALLER] }),
        }}
      />,
    );

    // Rendered from the server's payload immediately — no skeleton, no waiting.
    expect(screen.getByText("HDFC Bank Ltd")).toBeInTheDocument();
    expect(screen.getByText("Vodafone Idea Ltd")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(BOUGHT_URL));
    expect(await screen.findByText("Close ₹727.35")).toBeInTheDocument();
  });

  it("does not believe an empty payload without asking the endpoint first", async () => {
    const fetchMock = mockFeed();

    // A render that resolved no rows looks exactly like an exchange that published none. Only one
    // of those is worth showing a reader, so the board checks before settling on the empty state.
    render(
      <BseTrendingBoard
        prefetched={{ url: BOUGHT_URL, data: payload("turnover", { marketSession: "closed", rows: [], total: 0 }) }}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(BOUGHT_URL));
    expect(await screen.findByText("HDFC Bank Ltd")).toBeInTheDocument();
  });

  it("uses server-rendered payloads for both sides without going to the network", async () => {
    const fetchMock = mockFeed();

    render(
      <BseTrendingBoard
        prefetched={{ url: BOUGHT_URL, data: payload("turnover") }}
        soldPrefetched={{
          url: SOLD_URL,
          data: payload("turnover", { direction: "sold", rows: [FALLER], total: 1 }),
        }}
      />,
    );

    expect(screen.getByText("HDFC Bank Ltd")).toBeInTheDocument();
    expect(screen.getByText("Vodafone Idea Ltd")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("keeps the surviving half of the section when one board's feed refuses", async () => {
    // Two boards, two requests, two things that can fail independently. A selling board that could
    // not be reached must not take the buying one — or the sentence that counts both — down with it.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.get("direction") === "bought") return { ok: false } as Response;
      return { ok: true, json: async () => payload("turnover", { direction: "sold", rows: [FALLER], total: 640 }) } as Response;
    }) as unknown as typeof fetch;

    render(<BseTrendingBoard />);

    expect(await within(panel("sold")).findByText("Vodafone Idea Ltd")).toBeInTheDocument();
    expect(within(panel("bought")).getByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
    // The half that answered is still counted; the half that did not reads as zero rather than as
    // a number nobody measured.
    expect(
      screen.getByText(
        "0 BSE stocks closed above their previous close this session and 640 closed below it, across 4,419 scrips that traded.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a feed failure instead of an empty board", async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;

    render(<BseTrendingBoard />);

    expect((await screen.findAllByText(/Couldn't reach the market data feed/)).length).toBe(2);
    expect(screen.getByText("Loading BSE…")).toBeInTheDocument();
  });
});
