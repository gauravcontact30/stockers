import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketNews, relativeTime, sentimentCounts } from "../../app/components/market-news";

const NOW = new Date("2026-08-05T12:00:00.000Z").getTime();

function itemAt(minutesAgo: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `https://news.example/${minutesAgo}`,
    title: "Sensex rallies past 82,000",
    summary: "Benchmarks closed higher on broad-based buying.",
    source: "Business Standard",
    url: `https://news.example/${minutesAgo}`,
    publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    sentiment: "Positive",
    ...overrides,
  };
}

function mockFeed(payload: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const baseFeed = {
  scope: "Indian markets",
  fetchedAt: new Date(NOW - 5 * 60_000).toISOString(),
  classifier: "ai",
  items: [
    itemAt(20),
    itemAt(200, { id: "n2", url: "https://news.example/n2", title: "IT stocks slip", sentiment: "Negative", source: "Reuters" }),
    itemAt(3000, { id: "n3", url: "https://news.example/n3", title: "Rupee holds range", sentiment: "Neutral", source: "Mint" }),
  ],
};

describe("relativeTime", () => {
  it.each([
    [0, "just now"],
    [20, "20m ago"],
    [200, "3h ago"],
    [3000, "2d ago"],
  ])("renders %s minutes ago as %s", (minutesAgo, expected) => {
    expect(relativeTime(new Date(NOW - minutesAgo * 60_000).toISOString(), NOW)).toBe(expected);
  });

  it("returns an empty string for an unparseable date", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});

describe("MarketNews", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("shows loading skeletons before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<MarketNews />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });

  // Every headline must carry its publisher, its age and a link back to the original — the feed
  // reports other people's reporting, so it has to say whose it is.
  it("renders each headline with its publisher, age, sentiment and source link", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    const first = (await screen.findByText("Sensex rallies past 82,000")).closest("a")!;
    expect(first).toHaveAttribute("href", "https://news.example/20");
    expect(first).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(first).getByText("Business Standard")).toBeInTheDocument();
    expect(within(first).getByText("20m ago")).toBeInTheDocument();
    expect(within(first).getByText("Positive")).toBeInTheDocument();
    expect(within(first).getByText("Benchmarks closed higher on broad-based buying.")).toBeInTheDocument();

    // All three sentiment styles render.
    expect(screen.getByText("Negative")).toBeInTheDocument();
    expect(screen.getByText("Neutral")).toBeInTheDocument();

    expect(screen.getByText("Latest on Indian markets")).toBeInTheDocument();
    expect(screen.getByText("AI sentiment read")).toBeInTheDocument();
    expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();
  });

  // Most Google News entries carry no prose beyond the headline, so the parser hands back an
  // empty summary rather than echoing the title — the card must then omit the line entirely.
  it("omits the summary line when a headline has no extra prose", async () => {
    mockFeed({ ...baseFeed, items: [itemAt(20, { summary: "" })] });
    render(<MarketNews />);

    const card = (await screen.findByText("Sensex rallies past 82,000")).closest("a")!;
    // The gloss paragraph is the card's only <p>; headline, source and time are other elements.
    expect(card.querySelectorAll("p")).toHaveLength(0);
    expect(within(card).getByText("Business Standard")).toBeInTheDocument();
    expect(within(card).getByText("20m ago")).toBeInTheDocument();
  });

  // The dedicated news page has its own hero; repeating the section header under it reads as a
  // duplicated title.
  it("drops its own heading in compact mode but keeps the status chip", async () => {
    mockFeed(baseFeed);
    render(<MarketNews compact />);

    expect(await screen.findByText("AI sentiment read")).toBeInTheDocument();
    expect(screen.queryByText("Market news")).not.toBeInTheDocument();
    expect(screen.queryByText("Latest on Indian markets")).not.toBeInTheDocument();
    expect(screen.getByText("Sensex rallies past 82,000")).toBeInTheDocument();
    expect(screen.getByText("3 headlines · newest first")).toBeInTheDocument();
  });

  it("says it is still fetching when compact mode has no headlines yet", async () => {
    mockFeed({ ...baseFeed, items: [] });
    render(<MarketNews compact />);
    expect(await screen.findByText("Fetching the latest headlines…")).toBeInTheDocument();
  });

  it("says so when sentiment fell back to keyword matching", async () => {
    mockFeed({ ...baseFeed, classifier: "heuristic" });
    render(<MarketNews />);
    expect(await screen.findByText("Keyword sentiment (no AI key)")).toBeInTheDocument();
  });

  it("requests and titles a single stock's news when given a symbol", async () => {
    const fetchMock = mockFeed({ ...baseFeed, scope: "Reliance Industries" });
    render(<MarketNews symbol="RELIANCE" />);

    expect(await screen.findByText("Latest on Reliance Industries")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/news?symbol=RELIANCE");
  });

  it("requests the whole-market feed when no symbol is given", async () => {
    const fetchMock = mockFeed(baseFeed);
    render(<MarketNews />);
    await screen.findByText("Latest on Indian markets");
    expect(fetchMock).toHaveBeenCalledWith("/api/news");
  });

  it("shows an empty state when there are no headlines", async () => {
    mockFeed({ ...baseFeed, items: [] });
    render(<MarketNews />);
    expect(await screen.findByText(/No fresh headlines right now/)).toBeInTheDocument();
  });

  it("shows an error banner when the response is not ok", async () => {
    mockFeed({}, false);
    render(<MarketNews />);
    expect(await screen.findByText(/Couldn't reach the news feed/)).toBeInTheDocument();
  });

  it("shows an error banner when the fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<MarketNews />);
    expect(await screen.findByText(/Couldn't reach the news feed/)).toBeInTheDocument();
  });
});

describe("sentimentCounts", () => {
  it("tallies each mood, including the ones with nothing in them", () => {
    expect(sentimentCounts(baseFeed.items as { sentiment: "Positive" | "Negative" | "Neutral" }[])).toEqual({
      Positive: 1,
      Negative: 1,
      Neutral: 1,
    });
  });

  it("returns zeroes for an empty feed rather than an empty object", () => {
    expect(sentimentCounts([])).toEqual({ Positive: 0, Negative: 0, Neutral: 0 });
  });
});

describe("MarketNews as a card grid", () => {
  // Headlines used to be identical grey rows; the mood is now the card, not a chip on it.
  it("washes each card in its own sentiment colour", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    const positive = (await screen.findByText("Sensex rallies past 82,000")).closest("a")!;
    const negative = screen.getByText("IT stocks slip").closest("a")!;
    const neutral = screen.getByText("Rupee holds range").closest("a")!;

    expect(positive.className).toContain("bg-emerald-50/60");
    expect(negative.className).toContain("bg-rose-50/60");
    expect(neutral.className).toContain("bg-slate-50");
  });

  it("summarises how the feed is leaning above the cards", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    expect(await screen.findByText("1 positive")).toBeInTheDocument();
    expect(screen.getByText("1 negative")).toBeInTheDocument();
    expect(screen.getByText("1 neutral")).toBeInTheDocument();
  });

  // Six to a page, and the rest reachable rather than dropped.
  it("pages the feed six at a time", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 8 }, (_, i) =>
      itemAt(i + 1, { id: `p${i}`, url: `https://news.example/p${i}`, title: `Headline ${i}` }),
    );
    mockFeed({ ...baseFeed, items });
    render(<MarketNews />);

    await screen.findByText("Headline 0");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText("Headline 6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next/ }));

    expect(screen.getByText("Headline 6")).toBeInTheDocument();
    expect(screen.queryByText("Headline 0")).not.toBeInTheDocument();
  });

  it("shows no pager when everything fits on one page", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    await screen.findByText("Sensex rallies past 82,000");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});
