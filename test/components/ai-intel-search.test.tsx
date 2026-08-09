import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AiIntelSearch,
  BookmarkPanel,
  CategoryCard,
  DEFAULT_FILTERS,
  FollowUps,
  HorizonCards,
  PeerBoard,
  PeerBoards,
  PeerCard,
  rankPeers,
  StockProfile,
  VerdictBanner,
  bookmarkLabel,
  buildIntelBody,
  buildSuggestions,
  exactPercent,
  isDefaultFilters,
  suggestionsFrom,
  type IntelAnswer,
  type IntelGroup,
  type IntelPoint,
  type IntelStock,
  type PeerRow,
} from "../../app/components/ai-intel-search";
import { resetBookmarkCache, type IntelBookmark } from "../../app/components/intel-bookmarks";

jest.setTimeout(30000);

const SOURCES = [
  {
    title: "Tata Motors wins ₹2,000 crore order",
    publisher: "Economic Times",
    url: "https://example.com/one",
    publishedAt: new Date().toISOString(),
  },
  {
    title: "Brokerages raise target on Tata Motors",
    publisher: "Mint",
    url: "https://example.com/two",
    publishedAt: new Date().toISOString(),
  },
];

const POINTS: IntelPoint[] = [
  {
    text: "A ₹2,000 crore order lands from a state transport fleet.",
    source: 1,
    category: "orders",
    impact: "positive",
    badge: "₹2,000 Cr order",
  },
  {
    text: "Two brokerages raised their target after the win.",
    source: 2,
    category: "brokerage",
    impact: "positive",
    badge: "target raised",
  },
  {
    text: "No guidance change has been filed with the exchange.",
    source: null,
    category: "results",
    impact: "neutral",
    badge: "",
  },
];

const GROUPS: IntelGroup[] = [
  { category: "orders", label: "Orders & deals", points: [POINTS[0]], star: true },
  { category: "brokerage", label: "Brokerage & targets", points: [POINTS[1]], star: false },
  { category: "results", label: "Results & earnings", points: [POINTS[2]], star: false },
];

const OUTLOOK = {
  stance: "Buy" as const,
  conviction: 71,
  momentum: 68,
  news: { positive: 4, negative: 1, neutral: 2, total: 7, score: 61 },
  horizons: [
    { key: "6m", label: "Hold 6 months", stance: "Buy" as const, conviction: 70, trailing: 18.4, annualised: 40.2, basis: "Six-month basis line." },
    { key: "1y", label: "Hold 1 year", stance: "Buy" as const, conviction: 71, trailing: 32.1, annualised: 32.1, basis: "One-year basis line." },
    { key: "3y", label: "Hold 3 years", stance: "Hold" as const, conviction: 55, trailing: 44.0, annualised: 12.9, basis: "Three-year basis line." },
    { key: "5y", label: "Hold 5 years", stance: "Sell" as const, conviction: 38, trailing: null, annualised: null, basis: "No five years of price history for this scrip." },
  ],
  basis: "Momentum is with it: +9.0% over three months.",
};

const peer = (overrides: Partial<PeerRow> = {}): PeerRow => ({
  symbol: "MARUTI",
  name: "Maruti Suzuki India Ltd",
  code: "532500",
  capTier: "Large",
  category: "Automobile & Auto Components",
  price: 12850,
  changePercent: 0.82,
  returns: { "1w": 1.2, "1m": 3.4, "3m": 9.1, "6m": 18.4, "1y": 42.5, "3y": 88.2, "5y": 140.6, overall: 210.4 },
  ...overrides,
});

const PEERS = {
  category: "Automobile & Auto Components",
  leaders: [peer(), peer({ symbol: "EICHERMOT", name: "Eicher Motors Ltd", code: "505200" })],
  laggards: [peer({ symbol: "OLAELEC", name: "Ola Electric Ltd", code: "544225", capTier: "Mid", returns: { "1w": -2.1, "1m": -6.4, "3m": -12.2, "6m": -30.5, "1y": -58.3, "3y": null, "5y": null, overall: -58.3 } })],
};

const STOCK: IntelStock = {
  symbol: "TATAMOTORS",
  name: "Tata Motors Ltd",
  sector: "Automobile",
  capTier: "Large",
  code: "500570",
  isin: "INE155A01022",
  group: "A",
  rank: 24,
  price: 987.5,
  previousClose: 973.7,
  change: 13.8,
  changePercent: 1.42,
  open: 975,
  dayHigh: 991.25,
  dayLow: 972.1,
  volume: 2500000,
  turnoverCr: 246.9,
  trades: 84210,
  marketCapCr: 363000,
  sessionDate: "2026-08-07",
};

function answer(overrides: Partial<IntelAnswer> = {}): IntelAnswer {
  return {
    stock: STOCK,
    subject: "Tata Motors Ltd",
    headline: "Order win and two upgrades inside a week",
    points: POINTS,
    groups: GROUPS,
    sources: SOURCES,
    outlook: OUTLOOK,
    measuredFrom: { "6m": "2026-02-06", "1y": "2025-08-07", "3y": "2023-08-07", "5y": null },
    peers: PEERS,
    followUps: [
      { label: "What are brokerages saying on Tata Motors Ltd?", topic: "brokerage", window: "1w" },
      { label: "Any dividend or bonus from Tata Motors Ltd?", topic: "corporate-actions", window: "1w" },
    ],
    writer: "ai",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Answers both endpoints the panel talks to, and records what it asked the desk for.
 *
 * The stock lookup is the same one the whole app uses for autocomplete; the intel endpoint is the
 * gated one, so its status is a parameter — a 402 is a state the panel has to render, not a bug.
 */
function mockDesk({ status = 200, payload = answer() }: { status?: number; payload?: unknown } = {}) {
  const calls: { url: string; body: unknown }[] = [];

  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });

    if (String(url).startsWith("/api/stocks/search")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            groups: [
              { sector: "Automobile", stocks: [{ symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile" }] },
              { sector: "Metals", stocks: [{ symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metals" }] },
            ],
          }),
      });
    }

    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(payload) });
  }) as unknown as typeof fetch;

  return calls;
}

const intelCalls = (calls: { url: string; body: unknown }[]) => calls.filter((call) => call.url === "/api/ai/intel");

// Every filter is a <select>, which carries the combobox role too — so the search box is asked
// for by its label rather than by role alone.
const searchBox = () => screen.getByRole("combobox", { name: "Search BSE stocks and the web" });

/** The answer region, so a card label can't collide with the same words in a filter dropdown. */
const results = () => within(screen.getByTestId("intel-answer"));

/** Types a question and runs it, which is the opening move of most of these tests. */
async function ask(user: ReturnType<typeof userEvent.setup>, term = "TATAMOTORS") {
  await user.type(searchBox(), term);
  await user.click(screen.getByRole("button", { name: "Search" }));
  return screen.findByText("Order win and two upgrades inside a week");
}

beforeEach(() => {
  window.localStorage.clear();
  resetBookmarkCache();
});

describe("buildIntelBody", () => {
  it("sends the trimmed question with every filter beside it", () => {
    expect(buildIntelBody("  tata motors  ", { topic: "orders", window: "1m", sort: "recent" })).toEqual({
      query: "tata motors",
      topic: "orders",
      window: "1m",
      sort: "recent",
    });
  });
});

describe("isDefaultFilters", () => {
  it("is true only while nothing has been chosen", () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, topic: "brokerage" })).toBe(false);
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, window: "1y" })).toBe(false);
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, sort: "recent" })).toBe(false);
  });
});

describe("suggestionsFrom", () => {
  it("flattens the sector groups into one list, best group first", () => {
    const hits = suggestionsFrom({
      groups: [
        { sector: "Automobile", stocks: [{ symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile" }] },
        { sector: "Metals", stocks: [{ symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metals" }] },
      ],
    });

    expect(hits.map((hit) => hit.symbol)).toEqual(["TATAMOTORS", "TATASTEEL"]);
  });

  it("answers with nothing when the search endpoint returns something else", () => {
    expect(suggestionsFrom(null)).toEqual([]);
    expect(suggestionsFrom({ error: "nope" })).toEqual([]);
    expect(suggestionsFrom({ groups: [{ sector: "Automobile" }] })).toEqual([]);
  });
});

describe("buildSuggestions", () => {
  it("offers the matching companies, then questions about the best of them", () => {
    const suggestions = buildSuggestions([
      { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile" },
      { symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metals" },
    ]);

    expect(suggestions.slice(0, 2).map((entry) => entry.label)).toEqual(["TATAMOTORS", "TATASTEEL"]);
    // The questions are all about the leading match, and each carries the filter that answers it.
    expect(suggestions.slice(2)).toEqual([
      { kind: "question", symbol: "TATAMOTORS", name: "Tata Motors Ltd", label: "Tata Motors Ltd — latest results", topic: "results" },
      { kind: "question", symbol: "TATAMOTORS", name: "Tata Motors Ltd", label: "Tata Motors Ltd — brokerage targets", topic: "brokerage" },
      { kind: "question", symbol: "TATAMOTORS", name: "Tata Motors Ltd", label: "Tata Motors Ltd — dividend & bonus", topic: "corporate-actions" },
    ]);
  });

  it("offers no questions when nothing matched", () => {
    expect(buildSuggestions([])).toEqual([]);
  });
});

describe("StockProfile", () => {
  it("shows the company as the exchange files it, with the session's price", () => {
    render(<StockProfile stock={answer().stock} subject="Tata Motors Ltd" />);

    expect(screen.getByText("Tata Motors Ltd")).toBeInTheDocument();
    expect(screen.getByText("TATAMOTORS · 500570 · Large cap · ₹3,63,000 Cr")).toBeInTheDocument();
    expect(screen.getByText("Automobile")).toBeInTheDocument();
    expect(screen.getByText("₹987.50")).toBeInTheDocument();
    expect(screen.getByText("+1.42%")).toBeInTheDocument();
  });

  // A question that names no listed company still gets an answer; it just must not pretend to be
  // about a scrip we never found.
  it("says so plainly when nothing listed matched the search", () => {
    render(<StockProfile stock={null} subject="green hydrogen policy" />);

    expect(screen.getByText("green hydrogen policy")).toBeInTheDocument();
    expect(screen.getByText(/No BSE-listed company matched this search/)).toBeInTheDocument();
  });

  // A scrip the exchange feed could not answer for prints its name and nothing invented: no price
  // chip, and no strip of dashes standing in for facts it does not have.
  it("prints only the facts the exchange actually filed", () => {
    render(
      <StockProfile
        stock={{
          ...STOCK,
          code: null,
          isin: null,
          group: null,
          rank: null,
          capTier: null,
          price: null,
          previousClose: null,
          change: null,
          changePercent: null,
          open: null,
          dayHigh: null,
          dayLow: null,
          volume: null,
          turnoverCr: null,
          trades: null,
          marketCapCr: null,
          sessionDate: null,
        }}
        subject="x"
      />,
    );

    expect(screen.getByText("TATAMOTORS")).toBeInTheDocument();
    expect(screen.queryByText("₹987.50")).not.toBeInTheDocument();
    expect(screen.queryByText("Scrip code")).not.toBeInTheDocument();
    expect(screen.queryByText("Day range")).not.toBeInTheDocument();
    expect(screen.queryByText(/session of/)).not.toBeInTheDocument();
  });

  // Half a day range is no day range: a low with no high would print "₹972.10 – —".
  it("drops the day range when only one end of it was filed", () => {
    render(<StockProfile stock={{ ...STOCK, dayHigh: null }} subject="x" />);

    expect(screen.queryByText("Day range")).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});

describe("VerdictBanner", () => {
  it("states the call, its conviction and what it was read off", () => {
    render(<VerdictBanner outlook={OUTLOOK} />);

    expect(screen.getByText("Outperform")).toBeInTheDocument();
    expect(screen.getByText("Conviction 71/100")).toBeInTheDocument();
    expect(screen.getByText("Trend 68/100")).toBeInTheDocument();
    expect(screen.getByText("4 positive")).toBeInTheDocument();
    expect(screen.getByText("1 negative")).toBeInTheDocument();
    expect(screen.getByText("Momentum is with it: +9.0% over three months.")).toBeInTheDocument();
  });
});

describe("HorizonCards", () => {
  it("gives every holding period its own call and the measured return behind it", () => {
    render(<HorizonCards horizons={OUTLOOK.horizons} />);

    for (const label of ["Hold 6 months", "Hold 1 year", "Hold 3 years", "Hold 5 years"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText("+18.40%")).toBeInTheDocument();
    expect(screen.getByText("measured · +40.20% a year")).toBeInTheDocument();
    // A window the archive cannot reach prints a dash rather than a fabricated zero.
    expect(screen.getByText("measured · —")).toBeInTheDocument();
    expect(screen.getAllByText("Outperform")).toHaveLength(2);
    expect(screen.getByText("Underperform")).toBeInTheDocument();
  });
});

describe("CategoryCard", () => {
  it("carries the badge, the impact pill and a link to the report behind each point", () => {
    render(<CategoryCard group={GROUPS[0]} sources={SOURCES} />);

    expect(screen.getByText("Orders & deals")).toBeInTheDocument();
    expect(screen.getByText("₹2,000 Cr order")).toBeInTheDocument();
    expect(screen.getByText("Positive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Economic Times ↗" })).toHaveAttribute("href", "https://example.com/one");
  });

  it("stars the card holding the most important finding, and only that one", () => {
    const { rerender } = render(<CategoryCard group={GROUPS[0]} sources={SOURCES} />);
    expect(screen.getByTestId("star-ribbon")).toBeInTheDocument();

    rerender(<CategoryCard group={GROUPS[1]} sources={SOURCES} />);
    expect(screen.queryByTestId("star-ribbon")).not.toBeInTheDocument();
  });

  // A point the desk couldn't attribute is shown and marked, not quietly dropped; a badge it
  // couldn't name simply isn't drawn.
  it("marks an unattributed point rather than hiding it", () => {
    render(<CategoryCard group={GROUPS[2]} sources={SOURCES} />);

    expect(screen.getByText("unsourced")).toBeInTheDocument();
    expect(screen.getByText("Neutral")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks a point as unsourced when its citation names no report", () => {
    render(
      <CategoryCard
        group={{ category: "other", label: "Other developments", star: false, points: [{ ...POINTS[0], source: 9 }] }}
        sources={SOURCES}
      />,
    );

    expect(screen.getByText("unsourced")).toBeInTheDocument();
  });
});

describe("FollowUps", () => {
  it("offers the next questions, and nothing at all when there are none", () => {
    const onAsk = jest.fn();
    const { rerender } = render(<FollowUps items={answer().followUps} onAsk={onAsk} />);

    expect(screen.getByText("Ask next")).toBeInTheDocument();
    rerender(<FollowUps items={[]} onAsk={onAsk} />);
    expect(screen.queryByText("Ask next")).not.toBeInTheDocument();
  });
});

describe("exactPercent", () => {
  it("keeps the unrounded figure for the tooltip, and offers none where there is no reading", () => {
    expect(exactPercent(12.3456789)).toBe("12.345679%");
    expect(exactPercent(null)).toBeUndefined();
    expect(exactPercent(undefined)).toBeUndefined();
    expect(exactPercent(Number.NaN)).toBeUndefined();
  });
});

describe("rankPeers", () => {
  const rows = [
    peer({ symbol: "A", code: "1", capTier: "Large", returns: { "1y": 10, "3y": 90 } }),
    peer({ symbol: "B", code: "2", capTier: "Mid", returns: { "1y": 40, "3y": 5 } }),
    peer({ symbol: "C", code: "3", capTier: "Large", returns: { "1y": null, "3y": null } }),
  ];

  it("ranks the leaders from the best down and the laggards from the worst up", () => {
    expect(rankPeers(rows, { tier: "all", period: "1y" }, "leaders").map((row) => row.symbol)).toEqual(["B", "A", "C"]);
    expect(rankPeers(rows, { tier: "all", period: "1y" }, "laggards").map((row) => row.symbol)).toEqual(["A", "B", "C"]);
  });

  it("re-ranks by whichever window is chosen", () => {
    expect(rankPeers(rows, { tier: "all", period: "3y" }, "leaders").map((row) => row.symbol)).toEqual(["A", "B", "C"]);
  });

  it("sorts a window with no reading to the bottom either way, and ties do not reorder", () => {
    const blank = [
      peer({ symbol: "X", code: "9", returns: { "1y": null } }),
      peer({ symbol: "Y", code: "8", returns: { "1y": null } }),
      peer({ symbol: "Z", code: "7", returns: { "1y": 5 } }),
    ];

    expect(rankPeers(blank, { tier: "all", period: "1y" }, "leaders").map((row) => row.symbol)).toEqual(["Z", "X", "Y"]);
    // A window the row has no key for at all is the same as one it has no reading for.
    expect(rankPeers(blank, { tier: "all", period: "5y" }, "leaders").map((row) => row.symbol)).toEqual(["X", "Y", "Z"]);
  });

  it("filters to one cap tier", () => {
    expect(rankPeers(rows, { tier: "Mid", period: "1y" }, "leaders").map((row) => row.symbol)).toEqual(["B"]);
    expect(rankPeers(rows, { tier: "Small", period: "1y" }, "leaders")).toEqual([]);
  });
});

describe("PeerBoard", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    peer({
      symbol: `PEER${index}`,
      code: String(index),
      capTier: index % 2 === 0 ? "Large" : "Small",
      returns: { "1y": 100 - index, "1w": index },
    }),
  );

  const board = () => (
    <PeerBoard
      title="Top 20 to outperform"
      ribbon="★ Leaders"
      blurb="Strongest one-year record in Automobile"
      rows={many}
      direction="leaders"
      tint=""
      ribbonTone=""
    />
  );

  it("pages five at a time, strongest first, with the ranks running on", async () => {
    const user = userEvent.setup();
    render(board());

    expect(screen.getByText("PEER0")).toBeInTheDocument();
    expect(screen.queryByText("PEER5")).not.toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(screen.getByText("PEER5")).toBeInTheDocument();
    // Row one of page two is the sixth strongest, not the first.
    expect(within(screen.getByText("PEER5").closest("li")!).getByText("6")).toBeInTheDocument();
  });

  it("filters to a cap tier and re-ranks by another window, and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(board());

    await user.selectOptions(screen.getByLabelText("leaders tier"), "Small");
    expect(screen.getByText("PEER1")).toBeInTheDocument();
    expect(screen.queryByText("PEER0")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("leaders rank by"), "1w");
    // Over a week the order inverts: the last of the twenty is the first of this ranking.
    expect(screen.getByText("PEER11")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("leaders tier"), "Mid");
    expect(screen.getByText("Nothing in this category matches these filters.")).toBeInTheDocument();
  });
});

describe("PeerBoards", () => {
  it("puts the leaders and the laggards side by side, each with its own ribbon", () => {
    render(<PeerBoards peers={PEERS} />);

    expect(screen.getByTestId("peer-ribbon-leaders")).toBeInTheDocument();
    expect(screen.getByTestId("peer-ribbon-laggards")).toBeInTheDocument();
    expect(screen.getByText("Top 20 to outperform")).toBeInTheDocument();
    expect(screen.getByText("Top 20 losers to avoid")).toBeInTheDocument();
  });
});

describe("PeerCard", () => {
  it("prints every window the archive reaches, and a dash where it does not", () => {
    render(
      <ul>
        <PeerCard peer={PEERS.laggards[0]} rank={3} />
      </ul>,
    );

    expect(screen.getByText("OLAELEC")).toBeInTheDocument();
    expect(screen.getByText("Mid cap")).toBeInTheDocument();
    // The one-year and overall readings are both -58.30% for this scrip; each has its own row.
    expect(screen.getAllByText("-58.30%")).toHaveLength(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("drops the tier pill for a scrip the exchange has not ranked", () => {
    render(
      <ul>
        <PeerCard peer={peer({ capTier: null })} rank={1} />
      </ul>,
    );

    expect(screen.queryByText(/cap$/)).not.toBeInTheDocument();
  });
});

describe("bookmarkLabel", () => {
  const saved = (overrides: Partial<IntelBookmark> = {}): IntelBookmark => ({
    id: "tatamotors|all|1w|relevance",
    query: "TATAMOTORS",
    topic: "all",
    window: "1w",
    sort: "relevance",
    savedAt: new Date().toISOString(),
    uses: 1,
    ...overrides,
  });

  it("names the filter a search was saved under, unless it was saved unfiltered", () => {
    expect(bookmarkLabel(saved())).toBe("TATAMOTORS");
    expect(bookmarkLabel(saved({ topic: "brokerage" }))).toBe("TATAMOTORS · Brokerage & targets");
    // A topic the panel no longer offers still renders as the bare question rather than "undefined".
    expect(bookmarkLabel(saved({ topic: "gone" }))).toBe("TATAMOTORS");
  });
});

describe("BookmarkPanel", () => {
  const bookmark: IntelBookmark = {
    id: "tatamotors|all|1w|relevance",
    query: "TATAMOTORS",
    topic: "all",
    window: "1w",
    sort: "relevance",
    savedAt: new Date().toISOString(),
    uses: 4,
  };

  const panel = (overrides: Partial<Parameters<typeof BookmarkPanel>[0]> = {}) => (
    <BookmarkPanel
      bookmarks={[bookmark]}
      currentId={bookmark.id}
      canSave
      onSave={jest.fn()}
      onOpen={jest.fn()}
      onRemove={jest.fn()}
      onClear={jest.fn()}
      {...overrides}
    />
  );

  it("shows how often a saved search is run, and maintains itself with icons alone", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    const onClear = jest.fn();
    const onOpen = jest.fn();
    render(panel({ onRemove, onClear, onOpen }));

    expect(screen.getByText("TATAMOTORS")).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove TATAMOTORS from bookmarks" }));
    expect(onRemove).toHaveBeenCalledWith(bookmark.id);

    await user.click(screen.getByRole("button", { name: "Clear all bookmarks" }));
    expect(onClear).toHaveBeenCalled();

    await user.click(screen.getByText("TATAMOTORS"));
    expect(onOpen).toHaveBeenCalledWith(bookmark);
  });

  it("shows the star as pressed for a search already kept, and offers to keep an unsaved one", () => {
    const { rerender } = render(panel());
    expect(screen.getByRole("button", { name: "Remove this search from bookmarks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(panel({ currentId: "something-else|all|1w|relevance" }));
    expect(screen.getByRole("button", { name: "Bookmark this search" })).toHaveAttribute("aria-pressed", "false");
  });

  it("cannot bookmark anything before a search has been run", () => {
    render(panel({ bookmarks: [], currentId: null, canSave: false }));

    expect(screen.getByRole("button", { name: "Bookmark this search" })).toBeDisabled();
    expect(screen.getByText(/Star a search to keep it here/)).toBeInTheDocument();
    // Nothing saved, so there is nothing to clear either.
    expect(screen.queryByRole("button", { name: "Clear all bookmarks" })).not.toBeInTheDocument();
  });

  it("counts a run only once for a search saved just now", () => {
    render(panel({ bookmarks: [{ ...bookmark, uses: 1 }] }));

    expect(screen.queryByText("×1")).not.toBeInTheDocument();
  });
});

describe("AiIntelSearch", () => {
  it("clears the search entry and the answer under it", async () => {
    const user = userEvent.setup();
    mockDesk();
    render(<AiIntelSearch />);

    // Nothing to clear before anything is typed.
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    await ask(user);
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(searchBox()).toHaveValue("");
    expect(screen.queryByTestId("intel-answer")).not.toBeInTheDocument();
    expect(screen.getByText("Try one of these")).toBeInTheDocument();
    // The star has nothing to keep once the search is gone.
    expect(screen.getByRole("button", { name: "Bookmark this search" })).toBeDisabled();
  });

  it("offers questions worth asking before anything has been searched", () => {
    mockDesk();
    render(<AiIntelSearch />);

    expect(screen.getByText("Try one of these")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TCS results" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  // The Search button is disabled while the box is empty, so this is the belt-and-braces guard
  // behind it: a form submitted some other way must not ask the desk about nothing.
  it("does not search when an empty form is submitted", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await user.type(searchBox(), "   ");
    fireEvent.submit(searchBox().closest("form")!);

    expect(intelCalls(calls)).toHaveLength(0);
  });

  it("counts a single report in the singular", async () => {
    const user = userEvent.setup();
    mockDesk({ payload: answer({ sources: [SOURCES[0]] }) });
    render(<AiIntelSearch />);

    await ask(user);
    expect(screen.getByText("1 report read")).toBeInTheDocument();
  });

  it("searches a company suggestion under the filters already set", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await user.type(searchBox(), "tata");
    await user.click(await screen.findByRole("option", { name: "TATASTEEL logo TATASTEEL Tata Steel Ltd" }));

    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ ...DEFAULT_FILTERS, query: "TATASTEEL" });
    });
  });

  // A lookup that lands after the reader has typed on is about a word they are no longer looking
  // at, so its answer must not appear under the newer one.
  it("drops a suggestion lookup the reader has already typed past", async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  groups: [{ sector: "Metals", stocks: [{ symbol: "STALE", name: "Stale Ltd", sector: "Metals" }] }],
                }),
            });
        }),
    ) as unknown as typeof fetch;

    render(<AiIntelSearch />);
    await user.type(searchBox(), "ta");
    await waitFor(() => expect(release).not.toBeNull());

    // Type on, which retires the request above, and only then let it answer.
    await user.type(searchBox(), "x");
    release!();

    await waitFor(() => expect(screen.queryByText("STALE")).not.toBeInTheDocument());
  });

  it("answers a search on categorised cards, over the stock's own profile and call", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await ask(user);

    expect(results().getByText("Tata Motors Ltd")).toBeInTheDocument();
    expect(results().getByText("₹987.50")).toBeInTheDocument();
    expect(results().getByText("Conviction 71/100")).toBeInTheDocument();
    expect(results().getByText("Hold 3 years")).toBeInTheDocument();
    expect(results().getByText("Orders & deals")).toBeInTheDocument();
    expect(results().getByText("₹2,000 Cr order")).toBeInTheDocument();
    expect(results().getByTestId("star-ribbon")).toBeInTheDocument();
    expect(screen.getByText("2 reports read")).toBeInTheDocument();

    // The exchange's own identifiers and the session's whole trade, to its own precision.
    expect(results().getByText("INE155A01022")).toBeInTheDocument();
    expect(results().getByText("#24")).toBeInTheDocument();
    expect(results().getByText("₹972.10 – ₹991.25")).toBeInTheDocument();
    expect(results().getByText("84,210")).toBeInTheDocument();
    expect(results().getByText(/session of 7 Aug 2026/)).toBeInTheDocument();
    // Every measured window says which close it is counted from.
    expect(results().getByText("Measured from the close of 7 Aug 2025")).toBeInTheDocument();

    // Both ends of the company's own category, ranked over the same year.
    expect(results().getByText("Top 20 to outperform")).toBeInTheDocument();
    expect(results().getByText("Top 20 losers to avoid")).toBeInTheDocument();
    expect(results().getByText("OLAELEC")).toBeInTheDocument();

    // The sources accordion is gone: attribution lives on the point it belongs to.
    expect(screen.queryByText(/^Sources/)).not.toBeInTheDocument();

    // Defaults are sent explicitly, so the server never has to guess what the panel was showing.
    expect(intelCalls(calls).at(-1)?.body).toEqual({ query: "TATAMOTORS", ...DEFAULT_FILTERS });
  });

  it("leaves out the call entirely when the company could not be measured", async () => {
    const user = userEvent.setup();
    mockDesk({ payload: answer({ outlook: null }) });
    render(<AiIntelSearch />);

    await ask(user);

    expect(screen.queryByText(/Conviction/)).not.toBeInTheDocument();
    expect(results().getByText("Orders & deals")).toBeInTheDocument();
  });

  // The filters are the point of the feature: the same company, asked a different way.
  it("re-asks the same question when a filter changes", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);
    await ask(user);

    await user.selectOptions(screen.getByLabelText("Topic"), "brokerage");
    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ ...DEFAULT_FILTERS, query: "TATAMOTORS", topic: "brokerage" });
    });

    await user.selectOptions(screen.getByLabelText("Since"), "1y");
    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({
        query: "TATAMOTORS",
        topic: "brokerage",
        window: "1y",
        sort: "relevance",
      });
    });

    await user.selectOptions(screen.getByLabelText("Order"), "recent");
    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({
        query: "TATAMOTORS",
        topic: "brokerage",
        window: "1y",
        sort: "recent",
      });
    });
  });

  it("clears every filter at once, and offers to only when something is set", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear).toBeDisabled();

    await ask(user);

    await user.selectOptions(screen.getByLabelText("Topic"), "regulatory");
    await user.selectOptions(screen.getByLabelText("Since"), "3m");
    expect(clear).toBeEnabled();

    await user.click(clear);

    expect(screen.getByLabelText("Topic")).toHaveValue(DEFAULT_FILTERS.topic);
    expect(screen.getByLabelText("Since")).toHaveValue(DEFAULT_FILTERS.window);
    expect(clear).toBeDisabled();
    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ query: "TATAMOTORS", ...DEFAULT_FILTERS });
    });
  });

  // A filter is a re-ask of a question already on screen; with nothing asked yet there is nothing
  // to re-ask, and firing a search for an empty box would be a wasted round trip.
  it("does not search when a filter changes before any question has been asked", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await user.selectOptions(screen.getByLabelText("Topic"), "results");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(intelCalls(calls)).toHaveLength(0);
  });

  it("asks a follow-up question under the filter that answers it", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);
    await ask(user);

    await user.click(screen.getByRole("button", { name: /Any dividend or bonus/ }));

    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({
        query: "TATAMOTORS",
        topic: "corporate-actions",
        window: "1w",
        sort: "relevance",
      });
    });
  });

  it("suggests companies and questions as you type, and searches the one you pick", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    const box = searchBox();
    await user.type(box, "tata");

    // Every option carries its company's logo, whose alt text names the ticker — so the company
    // rows are told apart from the question rows by their own labels.
    expect(await screen.findByRole("option", { name: "TATAMOTORS logo TATAMOTORS Tata Motors Ltd" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /latest results/ })).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-expanded", "true");

    // A suggested question carries its own filter with it.
    await user.click(screen.getByRole("option", { name: /brokerage targets/ }));

    expect(box).toHaveValue("TATAMOTORS");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ ...DEFAULT_FILTERS, query: "TATAMOTORS", topic: "brokerage" });
    });
    expect(screen.getByLabelText("Topic")).toHaveValue("brokerage");
  });

  it("closes the suggestions on Escape, and drops them when the box is emptied", async () => {
    const user = userEvent.setup();
    mockDesk();
    render(<AiIntelSearch />);

    await user.type(searchBox(), "tata");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.clear(searchBox());
    await user.click(searchBox());
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("shows no suggestions when the lookup fails", async () => {
    const user = userEvent.setup();
    const lookup = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    global.fetch = lookup as unknown as typeof fetch;
    render(<AiIntelSearch />);

    await user.type(searchBox(), "tata");

    // Wait for the debounced lookup itself, so this proves the failure was handled rather than
    // that the assertion simply ran before the request did.
    await waitFor(() => expect(lookup).toHaveBeenCalledWith("/api/stocks/search?q=tata"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("runs one of the offered questions with the filter it belongs to", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await user.click(screen.getByRole("button", { name: "TCS results" }));

    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ ...DEFAULT_FILTERS, query: "TCS", topic: "results" });
    });
    expect(screen.getByLabelText("Topic")).toHaveValue("results");
  });

  // The server is what enforces the paywall; this is the panel rendering its refusal.
  it("shows the lock rather than an error when the trial has lapsed", async () => {
    const user = userEvent.setup();
    mockDesk({ status: 402, payload: { error: "Your free trial has ended." } });
    render(<AiIntelSearch />);

    await user.type(searchBox(), "TATAMOTORS");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Intelligence search is locked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/#pricing");
  });

  it("reports a failed search without blanking the panel", async () => {
    const user = userEvent.setup();
    mockDesk({ status: 500, payload: {} });
    render(<AiIntelSearch />);

    await user.type(searchBox(), "TATAMOTORS");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/couldn't reach the web for this search/)).toBeInTheDocument();
    expect(searchBox()).toHaveValue("TATAMOTORS");
  });

  // With no model configured the endpoint answers with the publishers' own headlines, and the
  // footnote has to say so rather than implying a synthesis nobody wrote.
  it("names the writer of the answer underneath it", async () => {
    const user = userEvent.setup();
    mockDesk({ payload: answer({ writer: "extractive" }) });
    render(<AiIntelSearch />);

    await ask(user);

    expect(screen.getByText(/No AI model is configured/)).toBeInTheDocument();
  });

  it("keeps a search on the bookmark shelf and reopens it with its filters intact", async () => {
    const user = userEvent.setup();
    const calls = mockDesk();
    render(<AiIntelSearch />);

    await user.type(searchBox(), "TATAMOTORS");
    await user.selectOptions(screen.getByLabelText("Topic"), "brokerage");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Order win and two upgrades inside a week");

    await user.click(screen.getByRole("button", { name: "Bookmark this search" }));

    expect(screen.getByText("TATAMOTORS · Brokerage & targets")).toBeInTheDocument();

    // Ask something else, then come back to the saved question.
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.selectOptions(screen.getByLabelText("Topic"), "results");
    await user.type(searchBox(), "TCS");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(intelCalls(calls).at(-1)?.body).toMatchObject({ query: "TCS" }));

    await user.click(screen.getByText("TATAMOTORS · Brokerage & targets"));

    await waitFor(() => {
      expect(intelCalls(calls).at(-1)?.body).toEqual({ ...DEFAULT_FILTERS, query: "TATAMOTORS", topic: "brokerage" });
    });
    expect(searchBox()).toHaveValue("TATAMOTORS");
    expect(screen.getByLabelText("Topic")).toHaveValue("brokerage");
  });

  it("drops one bookmark, and then all of them, from icons alone", async () => {
    const user = userEvent.setup();
    mockDesk();
    render(<AiIntelSearch />);
    await ask(user);

    await user.click(screen.getByRole("button", { name: "Bookmark this search" }));
    expect(screen.getByRole("button", { name: "Remove this search from bookmarks" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove TATAMOTORS from bookmarks" }));
    expect(screen.getByText(/Star a search to keep it here/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bookmark this search" }));
    await user.click(screen.getByRole("button", { name: "Clear all bookmarks" }));
    expect(screen.getByText(/Star a search to keep it here/)).toBeInTheDocument();
  });

  // The shelf ranks by how often a saved search is actually run, so a reader's morning routine
  // rises to the front without anyone curating it.
  it("counts every re-run of a bookmarked search", async () => {
    const user = userEvent.setup();
    mockDesk();
    render(<AiIntelSearch />);
    await ask(user);

    await user.click(screen.getByRole("button", { name: "Bookmark this search" }));
    expect(screen.queryByText("×2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("×2")).toBeInTheDocument());
  });
});
