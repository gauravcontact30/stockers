import { render, screen, waitFor } from "@testing-library/react";
import {
  AiVerdictPanel,
  VERDICT_SOURCES,
  applyVerdictFrame,
  clearAiVerdictPanelCache,
  parseVerdictFrame,
} from "../../app/components/ai-verdict-panel";
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

/**
 * A body that hands the frames over one chunk at a time, the way the route does.
 *
 * Split at the newline rather than delivered whole, so a test that asserts the calls are on screen
 * before the rationales land is actually exercising the streaming path and not a buffered one.
 */
function ndjsonBody(frames: unknown[], gate?: Promise<void>) {
  const encoder = new TextEncoder();
  const chunks = frames.map((frame) => encoder.encode(`${JSON.stringify(frame)}\n`));
  let index = 0;

  return {
    getReader: () => ({
      read: async () => {
        // Everything after the first chunk waits on the gate when the test supplied one. Without
        // it both frames resolve in the same microtask, React batches the two renders into one,
        // and a test asserting that the calls land *before* the prose can never observe it.
        if (index > 0 && gate) await gate;
        return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined };
      },
    }),
  };
}

/**
 * Answers the section feed and the verdicts endpoint, recording what was asked for.
 *
 * `rationales` is the second frame the route sends once the model has written over the calls.
 * `buffered` drops the body entirely, which is what a proxy that collects the whole response looks
 * like from here — the panel is meant to parse the same lines either way.
 */
function mockDesk({
  feed = {},
  verdicts = [verdict()],
  rationales,
  feedOk = true,
  verdictsOk = true,
  buffered = false,
  gated = false,
}: {
  feed?: unknown;
  verdicts?: StockVerdict[];
  rationales?: { symbol: string; rationale: string }[];
  feedOk?: boolean;
  verdictsOk?: boolean;
  buffered?: boolean;
  gated?: boolean;
} = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  const frames: unknown[] = [{ type: "verdicts", verdicts }];
  if (rationales) frames.push({ type: "rationales", rationales });

  let release = () => {};
  const gate = gated ? new Promise<void>((resolve) => { release = resolve; }) : undefined;

  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url) === "/api/ai/verdicts") {
      const text = () => Promise.resolve(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""));
      return Promise.resolve({ ok: verdictsOk, body: buffered ? null : ndjsonBody(frames, gate), text });
    }
    return Promise.resolve({ ok: feedOk, json: () => Promise.resolve(feed) });
  }) as unknown as typeof fetch;

  return Object.assign(calls, { release: () => release() });
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
  beforeEach(() => {
    clearAiVerdictPanelCache();
  });

  // The panel is not normally mounted for a caller the route would refuse — the gate holds it back
  // — so this is the path where the status call itself failed and the gate had to fail open.
  it("reports the paywall's own message instead of blaming the desk", async () => {
    global.fetch = jest.fn(async (url: string) =>
      String(url) === "/api/ai/verdicts"
        ? { ok: false, status: 402, json: async () => ({ error: "Pro is needed for this feature. Upgrade your plan to unlock it." }) }
        : { ok: true, json: async () => ({}) },
    ) as unknown as typeof fetch;

    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText(/Pro is needed for this feature/)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't score these stocks/)).not.toBeInTheDocument();
  });

  it("has a line of its own when the paywall sends no message", async () => {
    global.fetch = jest.fn(async (url: string) =>
      String(url) === "/api/ai/verdicts"
        ? { ok: false, status: 402, json: async () => { throw new Error("no body"); } }
        : { ok: true, json: async () => ({}) },
    ) as unknown as typeof fetch;

    render(<AiVerdictPanel section="overview" />);
    expect(await screen.findByText("Subscribe to see the AI desk's calls on these stocks.")).toBeInTheDocument();
  });

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

  // A stream that carries nothing the panel recognises — a half-written frame, a line of prose,
  // a frame whose payload is the wrong shape — leaves it with no stocks rather than an error.
  it("treats a malformed verdicts stream as nothing scored", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        body: null,
        text: () => Promise.resolve('{"type":"verdicts","verdicts":"not-a-list"}\nnot json at all\n{"type":"nope"}\n'),
      }),
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

  it("serves a completed panel from cache without repeating the desk call", async () => {
    const calls = mockDesk({ verdicts: [verdict({ symbol: "TCS" })] });
    const { unmount } = render(<AiVerdictPanel section="overview" />);
    await screen.findByText("TCS");
    unmount();

    render(<AiVerdictPanel section="overview" />);

    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  // The point of streaming this endpoint: the calls are decided by arithmetic and are on screen
  // before the model has written a word, and the prose then replaces the computed sentence without
  // the set of stocks changing underneath the reader.
  it("shows the computed calls first and swaps in the model's note when it lands", async () => {
    const desk = mockDesk({
      gated: true,
      verdicts: [verdict({ symbol: "TCS", rationale: "Holding its ground: +1.0% over a month.", source: "heuristic" })],
      rationales: [{ symbol: "TCS", rationale: "Deal wins are holding up billing despite a soft discretionary quarter." }],
    });

    render(<AiVerdictPanel section="overview" />);

    // The model has not written anything yet: the call, the score and the computed sentence are
    // all already on screen, and the panel says the note is still coming.
    expect(await screen.findByText(/Holding its ground/)).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText(/Writing the analyst/)).toBeInTheDocument();

    desk.release();

    expect(await screen.findByText(/Deal wins are holding up billing/)).toBeInTheDocument();
    expect(screen.queryByText(/Holding its ground/)).not.toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Writing the analyst/)).not.toBeInTheDocument());
  });

  it("leaves the computed sentences standing when the model writes nothing", async () => {
    mockDesk({
      verdicts: [verdict({ symbol: "TCS", rationale: "Holding its ground: +1.0% over a month.", source: "heuristic" })],
    });

    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText(/Holding its ground/)).toBeInTheDocument();
  });

  // A rationale for a stock the stream never sent is dropped rather than added as a row of its own.
  it("ignores a rationale for a stock that is not in the set", async () => {
    mockDesk({
      verdicts: [verdict({ symbol: "TCS" })],
      rationales: [{ symbol: "WIPRO", rationale: "Not one of the stocks on screen." }],
    });

    render(<AiVerdictPanel section="overview" />);

    await screen.findByText("TCS");
    await waitFor(() => expect(screen.queryByText(/Not one of the stocks on screen/)).not.toBeInTheDocument());
    expect(screen.queryByText("WIPRO")).not.toBeInTheDocument();
  });

  it("parses the same frames when a proxy buffers the whole response", async () => {
    mockDesk({
      buffered: true,
      verdicts: [verdict({ symbol: "TCS", rationale: "Computed.", source: "heuristic" })],
      rationales: [{ symbol: "TCS", rationale: "Written by the model." }],
    });

    render(<AiVerdictPanel section="overview" />);

    expect(await screen.findByText(/Written by the model/)).toBeInTheDocument();
  });
});

describe("verdict stream frames", () => {
  it("keeps only the lines that are frames", () => {
    expect(parseVerdictFrame("")).toBeNull();
    expect(parseVerdictFrame("   ")).toBeNull();
    expect(parseVerdictFrame("half a fr")).toBeNull();
    expect(parseVerdictFrame('{"type":"verdicts","verdicts":"nope"}')).toBeNull();
    expect(parseVerdictFrame('{"type":"rationales","rationales":{}}')).toBeNull();
    expect(parseVerdictFrame('{"type":"other"}')).toBeNull();
    expect(parseVerdictFrame('{"type":"verdicts","verdicts":[]}')).toEqual({ type: "verdicts", verdicts: [] });
  });

  it("replaces the set on a verdicts frame and only the prose on a rationales frame", () => {
    const first = verdict({ symbol: "TCS", rationale: "Computed.", source: "heuristic" });
    const applied = applyVerdictFrame([], { type: "verdicts", verdicts: [first] });
    expect(applied).toEqual([first]);

    const written = applyVerdictFrame(applied, {
      type: "rationales",
      rationales: [{ symbol: "TCS", rationale: "Written." }],
    });

    expect(written).toEqual([{ ...first, rationale: "Written.", source: "ai" }]);
    // The frame is applied to a copy, so the set the panel already rendered is untouched.
    expect(applied[0].rationale).toBe("Computed.");
  });
});
