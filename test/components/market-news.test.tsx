import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MarketNews,
  formatMove,
  formatPrice,
  relativeTime,
  sentimentCounts,
  NewsStoryModal,
  splitBySentiment,
  stockMark,
} from "../../app/components/market-news";

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
    // The two columns only carry headlines that name a listed company, so a fixture without one
    // would render nothing at all.
    symbol: "RELIANCE",
    company: "Reliance Industries",
    ...overrides,
  };
}

/**
 * The feed, plus the quotes each card asks for.
 *
 * Every card that names a company also asks the batched performance endpoint for its price and
 * today's move, so a mock that answers the news call alone leaves the pills stuck on an ellipsis.
 */
function mockFeed(payload: unknown, ok = true) {
  const fetchMock = jest.fn(async (url: string) => {
    if (String(url).includes("/api/news/story")) {
      return {
        ok: true,
        json: async () => ({ brief: ["What it means, in one line."], related: [], writer: "ai" }),
      } as unknown as Response;
    }
    if (String(url).includes("/api/market/performance")) {
      const symbols = new URL(String(url), "http://localhost").searchParams.get("symbols")?.split(",") ?? [];
      return {
        ok: true,
        json: async () => ({
          results: symbols.map((symbol) => ({ symbol, name: symbol, price: 100, oneDay: 3.5, live: true })),
        }),
      } as unknown as Response;
    }
    return { ok, json: async () => payload } as Response;
  });
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

describe("splitBySentiment", () => {
  const named = (over: Record<string, unknown>) => ({ ...itemAt(1), ...over });

  it("keeps only headlines that name a company and lean one way", () => {
    const items = [
      named({ id: "a", sentiment: "Positive" }),
      named({ id: "b", sentiment: "Negative" }),
      named({ id: "c", sentiment: "Neutral" }),
      named({ id: "d", sentiment: "Positive", symbol: null }),
    ] as Parameters<typeof splitBySentiment>[0];

    const { positive, negative } = splitBySentiment(items);
    expect(positive.map((item) => item.id)).toEqual(["a"]);
    expect(negative.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("formatPrice / formatMove", () => {
  it("formats a rupee price and dashes what it does not have", () => {
    expect(formatPrice(1234.5)).toBe("\u20b91,234.50");
    expect(formatPrice(null)).toBe("\u2014");
    expect(formatPrice(undefined)).toBe("\u2014");
    expect(formatPrice(Number.NaN)).toBe("\u2014");
  });

  it("points a move the way it went", () => {
    expect(formatMove(2.5)).toBe("\u25b2 2.50%");
    expect(formatMove(-1.25)).toBe("\u25bc 1.25%");
    expect(formatMove(null)).toBe("\u2014");
  });
});

describe("stockMark", () => {
  // A ribbon has to mean something, so it is a real day's move rather than any green at all.
  it.each([
    [5, "ribbon"],
    [2, "ribbon"],
    [1.9, "flat"],
    [0, "flat"],
    [-0.1, "cap"],
    [null, "unknown"],
    [undefined, "unknown"],
    [Number.NaN, "unknown"],
  ])("marks a move of %s as %s", (move, expected) => {
    expect(stockMark(move as number | null | undefined)).toBe(expected);
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
  it("renders each headline with its company, publisher, age and sentiment", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    const first = (await screen.findByText("Sensex rallies past 82,000")).closest("button")!;
    expect(within(first).getByText("Business Standard")).toBeInTheDocument();
    expect(within(first).getByText("20m ago")).toBeInTheDocument();
    expect(within(first).getByText("Positive")).toBeInTheDocument();
    expect(within(first).getByText("Benchmarks closed higher on broad-based buying.")).toBeInTheDocument();
    expect(within(first).getByText("RELIANCE")).toBeInTheDocument();

    // The two halves, each named.
    expect(screen.getByText("Positive news")).toBeInTheDocument();
    expect(screen.getByText("Negative news")).toBeInTheDocument();

    expect(screen.getByText("Latest on Indian markets")).toBeInTheDocument();
    expect(screen.getByText("AI sentiment read")).toBeInTheDocument();
    expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();
  });

  // A falling stock wears a red cap over its mark and prints its move in red. The quote hook
  // memoises by symbol for the session, so this uses a ticker no other test in the file asks for.
  it("marks a company that is down today", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes("/api/market/performance")) {
        return {
          ok: true,
          json: async () => ({ results: [{ symbol: "ITC", name: "ITC Limited", price: 100, oneDay: -2.4 }] }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ ...baseFeed, items: [itemAt(20, { symbol: "ITC", company: "ITC Limited" })] }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<MarketNews />);

    expect(await screen.findByLabelText("Down today")).toBeInTheDocument();
    expect(screen.getByText("▼ 2.40%")).toBeInTheDocument();
  });

  it("counts more than one excluded headline in the plural", async () => {
    mockFeed({
      ...baseFeed,
      items: [
        itemAt(20),
        itemAt(30, { id: "x1", url: "https://news.example/x1", title: "Rupee holds range", symbol: null, company: null }),
        itemAt(40, { id: "x2", url: "https://news.example/x2", title: "RBI holds rates", symbol: null, company: null }),
      ],
    });
    render(<MarketNews />);

    expect(await screen.findByText(/2 further headlines are not shown above/)).toBeInTheDocument();
  });

  // The publisher's own link lives in the story modal now, not on the card, so a click opens the
  // story here rather than navigating away.
  it("opens the story in a modal, with the publisher's link inside it", async () => {
    const user = userEvent.setup();
    mockFeed(baseFeed);
    render(<MarketNews />);

    await user.click((await screen.findByText("Sensex rallies past 82,000")).closest("button")!);

    const link = await screen.findByRole("link", { name: /Read the full report at Business Standard/ });
    expect(link).toHaveAttribute("href", "https://news.example/20");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // Most Google News entries carry no prose beyond the headline, so the parser hands back an
  // empty summary rather than echoing the title — the card must then omit the line entirely.
  it("omits the summary line when a headline has no extra prose", async () => {
    mockFeed({ ...baseFeed, items: [itemAt(20, { summary: "" })] });
    render(<MarketNews />);

    const card = (await screen.findByText("Sensex rallies past 82,000")).closest("button")!;
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

  // 402 is the paywall, not the publisher. Reporting it as an outage sent readers looking for a
  // broken feed that was working perfectly.
  it("shows the plan the route asks for when the feed is behind the paywall", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ error: "Starter is needed for this feature. Subscribe to unlock it." }),
    })) as unknown as typeof fetch;

    render(<MarketNews />);
    expect(await screen.findByText(/Starter is needed for this feature/)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't reach the news feed/)).not.toBeInTheDocument();
  });

  it("says something useful when the paywall sends no message of its own", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 402, json: async () => { throw new Error("no body"); } })) as unknown as typeof fetch;

    render(<MarketNews />);
    expect(await screen.findByText("Subscribe to read the market news feed.")).toBeInTheDocument();
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

    const positive = (await screen.findByText("Sensex rallies past 82,000")).closest("button")!;
    const negative = screen.getByText("IT stocks slip").closest("button")!;

    expect(positive.className).toContain("bg-emerald-50/60");
    expect(negative.className).toContain("bg-rose-50/60");
  });

  /**
   * The halves are stock news, so a headline has to name a company and has to lean one way.
   * What is left out is counted rather than silently dropped.
   */
  it("leaves out headlines that name no company, and says how many", async () => {
    mockFeed({
      ...baseFeed,
      items: [
        itemAt(20),
        itemAt(40, { id: "n9", url: "https://news.example/n9", title: "Rupee holds range", symbol: null, company: null }),
      ],
    });
    render(<MarketNews />);

    expect(await screen.findByText("Sensex rallies past 82,000")).toBeInTheDocument();
    expect(screen.queryByText("Rupee holds range")).not.toBeInTheDocument();
    expect(screen.getByText(/1 further headline is not shown above/)).toBeInTheDocument();
  });

  it("summarises how the feed is leaning above the cards", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    expect(await screen.findByText("1 positive")).toBeInTheDocument();
    expect(screen.getByText("1 negative")).toBeInTheDocument();
    expect(screen.getByText("1 neutral")).toBeInTheDocument();
  });

  // Four to a page per half, and the rest reachable rather than dropped.
  it("pages each half four at a time", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 6 }, (_, i) =>
      itemAt(i + 1, { id: `p${i}`, url: `https://news.example/p${i}`, title: `Headline ${i}` }),
    );
    mockFeed({ ...baseFeed, items });
    render(<MarketNews />);

    await screen.findByText("Headline 0");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText("Headline 4")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next/ }));

    expect(screen.getByText("Headline 4")).toBeInTheDocument();
    expect(screen.queryByText("Headline 0")).not.toBeInTheDocument();
  });

  it("shows no pager when everything fits on one page", async () => {
    mockFeed(baseFeed);
    render(<MarketNews />);

    await screen.findByText("Sensex rallies past 82,000");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  // The modal is the only place the app writes prose of its own, so both of its unhappy paths
  // have to degrade to something honest rather than an empty panel.
  describe("the story modal", () => {
    it("lists the other publishers covering the same company", async () => {
      const user = userEvent.setup();
      const fetchMock = jest.fn(async (url: string) => {
        if (String(url).includes("/api/news/story")) {
          return {
            ok: true,
            json: async () => ({
              brief: ["Profit rose on higher refining margins."],
              related: [
                {
                  id: "r1",
                  title: "Reliance Q1 profit beats estimates",
                  summary: "",
                  source: "Mint",
                  url: "https://news.example/r1",
                  publishedAt: new Date(NOW - 60_000).toISOString(),
                  sentiment: "Positive",
                  symbol: "RELIANCE",
                  company: "Reliance Industries",
                },
              ],
              writer: "ai",
            }),
          } as unknown as Response;
        }
        if (String(url).includes("/api/market/performance")) {
          return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
        }
        return { ok: true, json: async () => baseFeed } as Response;
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      render(<MarketNews />);
      await user.click((await screen.findByText("Sensex rallies past 82,000")).closest("button")!);

      expect(await screen.findByText("Profit rose on higher refining margins.")).toBeInTheDocument();
      expect(screen.getByText("Also being reported")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Reliance Q1 profit beats estimates/ })).toHaveAttribute(
        "href",
        "https://news.example/r1",
      );
      expect(screen.getByText(/Written by AI from the headlines listed below/)).toBeInTheDocument();
    });

    it("closes again and puts the reader back on the board", async () => {
      const user = userEvent.setup();
      mockFeed(baseFeed);
      render(<MarketNews />);

      await user.click((await screen.findByText("Sensex rallies past 82,000")).closest("button")!);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Close" }));

      // The card is still there — closing the story does not disturb the feed behind it.
      expect(screen.getByText("Sensex rallies past 82,000")).toBeInTheDocument();
    });

    it("says so plainly when the background cannot be put together", async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn(async (url: string) => {
        if (String(url).includes("/api/news/story")) return { ok: false, json: async () => ({}) } as Response;
        if (String(url).includes("/api/market/performance")) {
          return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
        }
        return { ok: true, json: async () => baseFeed } as Response;
      }) as unknown as typeof fetch;

      render(<MarketNews />);
      await user.click((await screen.findByText("Sensex rallies past 82,000")).closest("button")!);

      expect(await screen.findByText(/Couldn't put the background together just now/)).toBeInTheDocument();
    });

    // A 200 is not a promise of a well-formed body.
    it("survives a story payload with nothing usable in it", async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn(async (url: string) => {
        if (String(url).includes("/api/news/story")) return { ok: true, json: async () => ({}) } as Response;
        if (String(url).includes("/api/market/performance")) {
          return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
        }
        return { ok: true, json: async () => baseFeed } as Response;
      }) as unknown as typeof fetch;

      render(<MarketNews />);
      await user.click((await screen.findByText("Sensex rallies past 82,000")).closest("button")!);

      expect(await screen.findByText(/No AI key configured/)).toBeInTheDocument();
      expect(screen.queryByText("Also being reported")).not.toBeInTheDocument();
    });
  });

});

/**
 * The modal on its own.
 *
 * Two paths the board itself cannot reach: a story whose headline named no company, and a reader
 * who closes the panel before the background finishes loading.
 */
describe("NewsStoryModal", () => {
  const bare = {
    id: "solo",
    title: "RBI holds rates",
    summary: "",
    source: "Mint",
    url: "https://news.example/solo",
    publishedAt: new Date(NOW - 60_000).toISOString(),
    sentiment: "Neutral" as const,
    symbol: null,
    company: null,
  };

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("renders nothing at all when no story is open", () => {
    const { container } = render(<NewsStoryModal item={null} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the background without a symbol when the headline named no company", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ brief: ["Policy stayed put."], related: [], writer: "ai" }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<NewsStoryModal item={bare} onClose={jest.fn()} />);

    expect(await screen.findByText("Policy stayed put.")).toBeInTheDocument();
    const requested = (fetchMock as unknown as jest.Mock).mock.calls[0][0] as string;
    expect(requested).toContain("title=RBI+holds+rates");
    expect(requested).not.toContain("symbol=");
    // No company means no pill: there is no mark, price or move to show.
    expect(screen.queryByText("The company in this story")).not.toBeInTheDocument();
  });

  // Closing mid-flight must not write into a panel that is no longer on the page.
  it("drops a reply that lands after the reader has closed it", async () => {
    let land!: (value: unknown) => void;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    ) as unknown as typeof fetch;

    const { unmount } = render(<NewsStoryModal item={bare} onClose={jest.fn()} />);
    unmount();

    land({ ok: true, json: async () => ({ brief: ["Too late."], related: [], writer: "ai" }) });
    await Promise.resolve();

    expect(screen.queryByText("Too late.")).not.toBeInTheDocument();
  });
});
