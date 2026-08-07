import { render, screen, waitFor } from "@testing-library/react";
import { AiVerdictPanel, VERDICT_SOURCES } from "../../app/components/ai-verdict-panel";
import type { StockVerdict } from "../../app/components/verdict-view";

function verdict(overrides: Partial<StockVerdict> = {}): StockVerdict {
  return {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Energy & Petrochemicals",
    capTier: "Large",
    price: 1281,
    oneDay: -0.9,
    oneWeek: 0.4,
    oneMonth: -2.1,
    sixMonth: 3.4,
    oneYear: -1.2,
    score: 42,
    stance: "Hold",
    rationale: "Flat over the year with no trend to lean on either way.",
    source: "ai",
    ...overrides,
  };
}

/** Answers the section feed and the verdicts endpoint, recording what was asked for. */
function mockDesk({
  feed = {},
  verdicts = [verdict()],
  feedOk = true,
  verdictsOk = true,
}: { feed?: unknown; verdicts?: StockVerdict[]; feedOk?: boolean; verdictsOk?: boolean } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url) === "/api/ai/verdicts") {
      return Promise.resolve({ ok: verdictsOk, json: () => Promise.resolve({ verdicts }) });
    }
    return Promise.resolve({ ok: feedOk, json: () => Promise.resolve(feed) });
  }) as unknown as typeof fetch;
  return calls;
}

describe("VERDICT_SOURCES symbol extraction", () => {
  it("takes the index heavyweights for sections that are not a stock list", () => {
    expect(VERDICT_SOURCES.overview.symbols(null)).toContain("RELIANCE");
    expect(VERDICT_SOURCES.research.symbols(null)).toContain("TCS");
  });

  it("reads the large-cap movers off the market pulse", () => {
    const payload = {
      breadth: {
        movers: {
          Large: {
            gainers: [{ symbol: "HINDZINC" }, { symbol: "BOSCHLTD" }, { symbol: "SHRIRAMFIN" }, { symbol: "EXTRA" }],
            losers: [{ symbol: "TCS" }],
          },
        },
      },
    };
    expect(VERDICT_SOURCES["market-pulse"].symbols(payload)).toEqual(["HINDZINC", "BOSCHLTD", "SHRIRAMFIN", "TCS"]);
  });

  it("reads picks off the screener feeds", () => {
    const picks = { picks: [{ symbol: "INFY" }, { symbol: "SBIN" }] };
    expect(VERDICT_SOURCES["top-picks"].symbols(picks)).toEqual(["INFY", "SBIN"]);
    expect(VERDICT_SOURCES["buy-tomorrow"].symbols(picks)).toEqual(["INFY", "SBIN"]);
    expect(VERDICT_SOURCES["dip-winners"].symbols({ stocks: [{ symbol: "WIPRO" }] })).toEqual(["WIPRO"]);
    expect(VERDICT_SOURCES["etf-research"].symbols({ etfs: [{ symbol: "NIFTYBEES" }] })).toEqual(["NIFTYBEES"]);
  });

  // Each exchange board reads its own feed, so the calls are about the names on that board.
  it("reads the largest companies off the directory by ticker", () => {
    expect(VERDICT_SOURCES.directory.symbols({ rows: [{ ticker: "RELIANCE" }, { ticker: "TCS" }] })).toEqual([
      "RELIANCE",
      "TCS",
    ]);
  });

  it("reads the turnover board and the MTF board off the same feed, separately", () => {
    const feed = { byValue: [{ symbol: "HDFCBANK" }], mtf: [{ symbol: "SBIN" }] };
    expect(VERDICT_SOURCES["most-traded"].symbols(feed)).toEqual(["HDFCBANK"]);
    expect(VERDICT_SOURCES.mtf.symbols(feed)).toEqual(["SBIN"]);
  });

  it("flattens the sector-grouped filings and dividend feeds", () => {
    expect(
      VERDICT_SOURCES["stock-news"].symbols({
        sectors: [{ items: [{ symbol: "BEL" }] }, { items: [{ symbol: "ABB" }] }],
      }),
    ).toEqual(["BEL", "ABB"]);

    expect(
      VERDICT_SOURCES.dividends.symbols({
        sectors: [{ dividends: [{ symbol: "HYUNDAI" }] }, { dividends: [{ symbol: "ITC" }] }],
      }),
    ).toEqual(["HYUNDAI", "ITC"]);
  });

  it("flattens the ETF board across its asset classes", () => {
    expect(
      VERDICT_SOURCES["etf-board"].symbols({ groups: [{ etfs: [{ symbol: "GOLDBEES" }] }, { etfs: [{ symbol: "NIFTYBEES" }] }] }),
    ).toEqual(["GOLDBEES", "NIFTYBEES"]);
  });

  // Sector rotation and the IPO pipeline are not lists of listed stocks, so both fall back to the
  // heavyweights a reader would price anything else against.
  it("uses the heavyweights for boards that are not a stock list", () => {
    expect(VERDICT_SOURCES.sectors.symbols(null)).toContain("HDFCBANK");
    expect(VERDICT_SOURCES.ipos.symbols(null)).toContain("INFY");
  });

  it("survives a feed that is empty or the wrong shape", () => {
    expect(VERDICT_SOURCES.directory.symbols({ rows: [{ ticker: 7 }, { ticker: "TCS" }] })).toEqual(["TCS"]);
    expect(VERDICT_SOURCES.dividends.symbols({ sectors: [{ dividends: [{ symbol: 7 }] }] })).toEqual([]);
    expect(VERDICT_SOURCES["stock-news"].symbols({})).toEqual([]);
    expect(VERDICT_SOURCES["etf-board"].symbols({})).toEqual([]);
    expect(VERDICT_SOURCES["top-picks"].symbols(null)).toEqual([]);
    expect(VERDICT_SOURCES["market-pulse"].symbols({})).toEqual([]);
    expect(VERDICT_SOURCES["dip-winners"].symbols({ stocks: "nope" })).toEqual([]);
    // Rows without a usable symbol are dropped rather than sent as blanks.
    expect(VERDICT_SOURCES["top-picks"].symbols({ picks: [{ symbol: 7 }, { symbol: "INFY" }] })).toEqual(["INFY"]);
  });
});

describe("AiVerdictPanel", () => {
  it("scores a fixed set of stocks without reading any feed", async () => {
    const calls = mockDesk();
    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("AI desk: today's heavyweights")).toBeInTheDocument();
    expect(screen.getByText("HOLD")).toBeInTheDocument();
    expect(screen.getByText("1 stocks scored")).toBeInTheDocument();
    expect(screen.getByText(/Rationale written by AI agent/)).toBeInTheDocument();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "/api/ai/verdicts",
      body: { feature: "research", symbols: expect.arrayContaining(["RELIANCE"]) },
    });
  });

  it("reads a section's own feed and scores the stocks it is showing", async () => {
    const calls = mockDesk({ feed: { picks: [{ symbol: "INFY" }, { symbol: "SBIN" }] } });
    render(<AiVerdictPanel section="top-picks" />);

    await waitFor(() => expect(screen.getByText("RELIANCE")).toBeInTheDocument());
    expect(calls[0].url).toBe("/api/predictions/top-picks");
    expect(calls[1]).toMatchObject({ url: "/api/ai/verdicts", body: { feature: "top-picks", symbols: ["INFY", "SBIN"] } });
  });

  it("shows a loading state before the calls land", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<AiVerdictPanel section="overview" />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
  });

  it("says nothing is scored yet when the section has no stocks", async () => {
    mockDesk({ feed: { picks: [] } });
    render(<AiVerdictPanel section="top-picks" />);

    expect(await screen.findByText(/This section has no stocks to score yet/)).toBeInTheDocument();
  });

  it("reports a failure from the section feed", async () => {
    mockDesk({ feedOk: false });
    render(<AiVerdictPanel section="dip-winners" />);

    expect(await screen.findByText(/The AI desk couldn't score these stocks/)).toBeInTheDocument();
  });

  it("reports a failure from the verdicts endpoint", async () => {
    mockDesk({ verdictsOk: false });
    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText(/The AI desk couldn't score these stocks/)).toBeInTheDocument();
  });

  it("treats a malformed verdicts payload as nothing scored", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ verdicts: "not-a-list" }) }),
    ) as unknown as typeof fetch;
    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText(/This section has no stocks to score yet/)).toBeInTheDocument();
  });

  // The compare section is all verdicts already, so the dashboard never mounts a desk for it.
  it("renders nothing for a section with no desk configured", () => {
    mockDesk();
    const { container } = render(<AiVerdictPanel section="compare" />);
    expect(container).toBeEmptyDOMElement();
  });
});
