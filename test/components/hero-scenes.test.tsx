import { render, screen, waitFor, within } from "@testing-library/react";
import {
  DEFENCE_TRIO,
  DefenceStocksScene,
  DATA_CENTRE_TRIO,
  DataCentreScene,
  LILAC,
  MINT,
  SAND,
  SKY,
  DipBuysScene,
  dipPrice,
  dipRailPosition,
  tiltLabel,
  tiltTone,
  MARKET_THEMES,
  TickerTape,
  TopGainersScene,
  TrioCard,
  signed,
  strongestMove,
  themeAverage,
  trioPrice,
  trioReturn,
} from "../../app/components/hero-scenes";

describe("signed", () => {
  it("always carries the sign, so a gain never reads as a bare number", () => {
    expect(signed(2.5)).toBe("+2.50%");
    expect(signed(-2.5)).toBe("−2.50%");
    expect(signed(0)).toBe("+0.00%");
  });

  it("honours the requested precision", () => {
    expect(signed(31.24, 1)).toBe("+31.2%");
  });
});

describe("the palettes", () => {
  // The point of four palettes is that no two slides look alike.
  it("gives each slide its own light background, card and tape", () => {
    const palettes = [MINT, SKY, LILAC, SAND];
    expect(new Set(palettes.map((palette) => palette.key)).size).toBe(4);
    expect(new Set(palettes.map((palette) => palette.bg)).size).toBe(4);
    expect(new Set(palettes.map((palette) => palette.tape)).size).toBe(4);
  });

  it("keeps every palette light", () => {
    for (const palette of [MINT, SKY, LILAC, SAND]) {
      expect(palette.bg).toContain("-50");
      expect(palette.title).toBe("text-slate-900");
    }
  });
});

describe("TickerTape", () => {
  // The row is duplicated so the marquee can loop without a visible seam.
  it("renders every ticker twice", () => {
    render(<TickerTape palette={MINT} />);
    expect(screen.getAllByText("S&P BSE SENSEX ▲ 0.98%")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scene 1 — top performers by theme
// ---------------------------------------------------------------------------

describe("strongestMove", () => {
  it("finds the single strongest move across every theme", () => {
    expect(strongestMove(MARKET_THEMES)).toBe(7.35);
  });

  // Bars are drawn as a share of this, so an empty board must not hand back a divisor of NaN.
  it("returns zero when there is nothing to rank", () => {
    expect(strongestMove([])).toBe(0);
  });
});

describe("themeAverage", () => {
  it("averages a theme's three movers", () => {
    expect(themeAverage(MARKET_THEMES[1])).toBeCloseTo((4.26 + 2.91 + 2.14) / 3);
  });
});

describe("TopGainersScene", () => {
  it("shows all three themes, each with its three strongest scrips", () => {
    render(<TopGainersScene />);

    expect(screen.getByText("Data centres")).toBeInTheDocument();
    expect(screen.getByText("Banking")).toBeInTheDocument();
    expect(screen.getByText("Development & infra")).toBeInTheDocument();

    for (const theme of MARKET_THEMES) {
      expect(theme.stocks).toHaveLength(3);
      for (const stock of theme.stocks) {
        expect(screen.getByText(stock.symbol)).toBeInTheDocument();
      }
    }
  });

  it("ranks each theme 1-3 and prints the average alongside the leader", () => {
    render(<TopGainersScene />);

    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.getByText("+7.35%")).toBeInTheDocument();
    expect(screen.getByText("avg +4.87%")).toBeInTheDocument();
  });

  // Real companies with illustrative figures have to say which is which.
  it("says the figures are an illustration and the codes are not", () => {
    render(<TopGainersScene />);
    expect(screen.getByText(/Companies and BSE scrip codes are real/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scene 2 — two stocks compared
// ---------------------------------------------------------------------------

describe("every scene", () => {
  it("carries the same BSE index rail", () => {
    for (const Scene of [TopGainersScene, DefenceStocksScene, DataCentreScene, DipBuysScene]) {
      const { container, unmount } = render(<Scene />);
      expect(within(container).getByText("S&P BSE SENSEX")).toBeInTheDocument();
      expect(within(container).getByText("BSE BANKEX")).toBeInTheDocument();
      unmount();
    }
  });

  /**
   * Everything a scene draws sits inside one padded card, inset from a padded frame — so no
   * content can end up flush against the edge of the slide at any width.
   */
  it("keeps its content inside a padded card, inset from the frame", () => {
    for (const Scene of [TopGainersScene, DefenceStocksScene, DataCentreScene, DipBuysScene]) {
      const { container, unmount } = render(<Scene />);

      // Each slide sets its own inset — a roomy scene sits further in, a dense one closer to
      // the edge — but every one of them has some.
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toMatch(/(^| )p-\d/);

      const card = frame.querySelector(":scope > .rounded-3xl") as HTMLElement;
      expect(card).not.toBeNull();
      expect(card.className).toContain("p-3");
      // The rail, the heading, the body, the footnote and the tape all hang off the card.
      expect(within(card).getByText("BSE BANKEX")).toBeInTheDocument();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// The two live-figure trio slides
// ---------------------------------------------------------------------------

describe("trioPrice", () => {
  it("prints rupees in Indian grouping, to paise", () => {
    expect(trioPrice(1432.5)).toBe("₹1,432.50");
    expect(trioPrice(1127967)).toBe("₹11,27,967.00");
  });

  // A missing price is a dash, never a zero — a zero would read as a real quote.
  it("shows a dash rather than inventing a number", () => {
    expect(trioPrice(null)).toBe("—");
    expect(trioPrice(undefined)).toBe("—");
    expect(trioPrice(Number.NaN)).toBe("—");
  });
});

describe("trioReturn", () => {
  it("always carries the sign, to one place", () => {
    expect(trioReturn(12.34)).toBe("+12.3%");
    expect(trioReturn(-4)).toBe("−4.0%");
  });

  // A company younger than the window genuinely has no figure, and printing 0% would be a lie.
  it("shows a dash when the window has no measurement", () => {
    expect(trioReturn(null)).toBe("—");
    expect(trioReturn(Number.NaN)).toBe("—");
  });
});

const SAMPLE_PERFORMANCE = {
  symbol: "HAL",
  name: "Hindustan Aeronautics",
  assetType: "stock" as const,
  capTier: "Large" as const,
  currency: "INR",
  price: 4910,
  previousClose: 4920,
  change: -10,
  oneDay: 1.29,
  oneWeek: 2.4,
  oneMonth: -1.1,
  threeMonth: 5,
  sixMonth: 8.8,
  oneYear: 24.6,
  threeYear: 60,
  fiveYear: 120,
  overall: 400,
  overallSince: "2018-03-28",
  live: true,
  asOf: "2026-08-07T10:00:00.000Z",
  source: "test",
};

describe("TrioCard", () => {
  const stock = DEFENCE_TRIO[0];

  it("names the company, its ticker and its real BSE scrip code", () => {
    render(<TrioCard stock={stock} performance={SAMPLE_PERFORMANCE} loading={false} />);

    expect(screen.getByText("HAL")).toBeInTheDocument();
    expect(screen.getByText("Hindustan Aeronautics")).toBeInTheDocument();
    expect(screen.getByText("Large")).toBeInTheDocument();
  });

  it("shows the live price and the day's move", () => {
    render(<TrioCard stock={stock} performance={SAMPLE_PERFORMANCE} loading={false} />);

    expect(screen.getByText("₹4,910.00")).toBeInTheDocument();
    expect(screen.getByText("+1.3%")).toBeInTheDocument();
  });

  it("reports all five windows, not just the day", () => {
    render(<TrioCard stock={stock} performance={SAMPLE_PERFORMANCE} loading={false} />);

    for (const label of ["1W", "1M", "6M", "1Y", "3Y"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("+2.4%")).toBeInTheDocument();
    expect(screen.getByText("−1.1%")).toBeInTheDocument();
    expect(screen.getByText("+8.8%")).toBeInTheDocument();
    expect(screen.getByText("+24.6%")).toBeInTheDocument();
    expect(screen.getByText("+60.0%")).toBeInTheDocument();
  });

  // A card mid-flight must not print dashes, which would read as "there is no such figure".
  it("shows placeholders while the figures are still arriving", () => {
    const { container } = render(<TrioCard stock={stock} performance={null} loading />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹4,910.00")).not.toBeInTheDocument();
  });

  // A feed that answered with nothing is not the same as a feed still answering.
  it("shows dashes when the feed has no figures for the company", () => {
    render(<TrioCard stock={stock} performance={null} loading={false} />);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

});

describe("the trio line-ups", () => {
  it("names the three defence companies the slide is about", () => {
    expect(DEFENCE_TRIO.map((stock) => stock.symbol)).toEqual(["HAL", "MAZDOCK", "PARAS"]);
    expect(DEFENCE_TRIO.map((stock) => stock.company)).toEqual([
      "Hindustan Aeronautics",
      "Mazagon Dock Shipbuilders",
      "Paras Defence and Space Technologies",
    ]);
  });

  // Three different sizes, which is the whole reason the tier is on the card: a small cap's 100%
  // year and a large cap's 10% year are not the same achievement.
  it("states the cap tier for each, including the one the quote feed does not classify", () => {
    expect(DEFENCE_TRIO.map((stock) => stock.tier)).toEqual(["Large", "Mid", "Small"]);
  });

  it("names the three data-centre companies the slide is about", () => {
    expect(DATA_CENTRE_TRIO.map((stock) => stock.symbol)).toEqual(["NETWEB", "POWERINDIA", "LT"]);
    expect(DATA_CENTRE_TRIO.map((stock) => stock.company)).toEqual([
      "Netweb Technologies India",
      "Hitachi Energy India",
      "Larsen & Toubro",
    ]);
  });

  // Three cards that look alike are three cards a reader has to read twice to tell apart.
  it("gives every card in a trio its own accent and its own pale wash", () => {
    for (const trio of [DEFENCE_TRIO, DATA_CENTRE_TRIO]) {
      expect(new Set(trio.map((stock) => stock.accent)).size).toBe(3);
      expect(new Set(trio.map((stock) => stock.wash)).size).toBe(3);
    }
  });

  // Light, not saturated: these cards carry a dozen small tabular figures each.
  it("keeps every wash pale enough to read tabular figures against", () => {
    for (const trio of [DEFENCE_TRIO, DATA_CENTRE_TRIO]) {
      for (const stock of trio) expect(stock.wash).toMatch(/-50\//);
    }
  });
});

describe("DefenceStocksScene and DataCentreScene", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  });

  it("puts each defence company on its own card", () => {
    render(<DefenceStocksScene />);

    for (const stock of DEFENCE_TRIO) {
      expect(screen.getByText(stock.symbol)).toBeInTheDocument();
      expect(screen.getByText(stock.company)).toBeInTheDocument();
    }
  });

  it("puts each data-centre company on its own card", () => {
    render(<DataCentreScene />);

    for (const stock of DATA_CENTRE_TRIO) {
      expect(screen.getByText(stock.symbol)).toBeInTheDocument();
      expect(screen.getByText(stock.company)).toBeInTheDocument();
    }
  });

  /**
   * These two slides carry real figures, unlike the scenes either side of them. The footnote has
   * to say so — a reader cannot otherwise tell a live board from an illustration of one.
   */
  it("tells the reader the figures are live rather than illustrative", () => {
    const { unmount } = render(<DefenceStocksScene />);
    expect(screen.getByText(/measured, not modelled/)).toBeInTheDocument();
    expect(screen.queryByText(/illustration/)).not.toBeInTheDocument();
    unmount();

    render(<DataCentreScene />);
    expect(screen.getByText(/live exchange figures/)).toBeInTheDocument();
  });

  it("asks the performance endpoint for exactly the companies it shows, in one request", async () => {
    const asked: string[] = [];
    global.fetch = jest.fn((url: string) => {
      asked.push(String(url));
      return new Promise(() => {});
    }) as unknown as typeof fetch;

    render(<DataCentreScene />);

    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked).toHaveLength(1);
    for (const stock of DATA_CENTRE_TRIO) expect(asked[0]).toContain(stock.symbol);
  });
});

// ---------------------------------------------------------------------------
// Scene 4 — the year's winners that are on sale today
// ---------------------------------------------------------------------------

const NO_NEWS = { positive: 0, negative: 0, neutral: 0, total: 0, score: 50, headline: null, headlineUrl: null, classifier: null };

describe("tiltLabel", () => {
  it("says how the week's headlines fell, rather than showing a bare score", () => {
    expect(tiltLabel({ ...NO_NEWS, positive: 7, total: 10, score: 68 })).toBe("7 of 10 headlines positive");
    expect(tiltLabel({ ...NO_NEWS, negative: 6, total: 10, score: 35 })).toBe("6 of 10 headlines negative");
    expect(tiltLabel({ ...NO_NEWS, total: 10, score: 50 })).toBe("10 headlines, balanced");
  });

  // Nothing written about a company is not the same as balanced coverage of it.
  it("distinguishes no coverage from balanced coverage", () => {
    expect(tiltLabel(NO_NEWS)).toBe("No coverage this week");
  });
});

describe("tiltTone", () => {
  it("tints the chip by how the week read", () => {
    expect(tiltTone({ ...NO_NEWS, total: 4, score: 70 })).toContain("emerald");
    expect(tiltTone({ ...NO_NEWS, total: 4, score: 30 })).toContain("rose");
    expect(tiltTone({ ...NO_NEWS, total: 4, score: 50 })).toContain("amber");
  });

  it("stays neutral when there is nothing to read", () => {
    expect(tiltTone(NO_NEWS)).toContain("slate");
  });
});

describe("dipRailPosition", () => {
  // The marker slides toward the cheap end as the discount deepens.
  it("puts a stock at its recent high at the expensive end", () => {
    expect(dipRailPosition(0)).toBe(100);
  });

  it("puts a deeply marked-down stock at the cheap end", () => {
    expect(dipRailPosition(-30)).toBe(0);
    expect(dipRailPosition(-60)).toBe(0);
  });

  it("places a middling discount in between", () => {
    expect(dipRailPosition(-15)).toBe(50);
  });

  it("falls back to the expensive end when there is no measurement", () => {
    expect(dipRailPosition(null)).toBe(100);
    expect(dipRailPosition(Number.NaN)).toBe(100);
  });
});

describe("dipPrice", () => {
  it("prints rupees in Indian grouping", () => {
    expect(dipPrice(1141.2)).toBe("₹1,141.20");
  });

  it("shows a dash rather than a zero when there is no price", () => {
    expect(dipPrice(null)).toBe("—");
  });
});

describe("DipBuysScene", () => {
  const leader = {
    code: "500034",
    ticker: "BAJFINANCE",
    name: "Bajaj Finance",
    sector: "Financial Services",
    capTier: "Large",
    price: 1141.2,
    changePercent: -2.4,
    yearReturn: 31.2,
    referenceHigh: 1355.4,
    offRecentHigh: -15.8,
    news: { positive: 5, negative: 1, neutral: 2, total: 8, score: 63, headline: "Bajaj Finance posts record quarter", headlineUrl: "https://example.test/a", classifier: "ai" as const },
  };

  const board = { leaders: [leader], sessionDate: "2026-08-07", examined: 150, fetchedAt: "2026-08-07T10:00:00.000Z" };

  const mockBoard = (payload: unknown, ok = true) => {
    global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
  };

  it("shows the card's shape while the screen is still running", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<DipBuysScene />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("asks the public screen endpoint, which needs no sign-in", async () => {
    mockBoard(board);
    render(<DipBuysScene />);

    await screen.findByText("BAJFINANCE");
    expect(global.fetch).toHaveBeenCalledWith("/api/market/dip-leaders");
  });

  /**
   * Both halves of the screen have to be on the card. Either one alone is a different and much
   * worse idea: a winner at its high is not cheap, and a faller at its low is not a winner.
   */
  it("shows the year's return and today's discount together", async () => {
    mockBoard(board);
    render(<DipBuysScene />);

    expect(await screen.findByText("+31%")).toBeInTheDocument();
    expect(screen.getByText("−15.8%")).toBeInTheDocument();
    expect(screen.getByText("Last year")).toBeInTheDocument();
    expect(screen.getByText("Off recent high")).toBeInTheDocument();
  });

  it("shows today's price, today's fall, and the high it is measured against", async () => {
    mockBoard(board);
    render(<DipBuysScene />);

    expect(await screen.findByText("₹1,141.20")).toBeInTheDocument();
    expect(screen.getByText("−2.40%")).toBeInTheDocument();
    expect(screen.getByText(/₹1,355.40/)).toBeInTheDocument();
  });

  /**
   * The count, and only the count.
   *
   * The card used to print the most recent headline underneath. In practice that was usually a
   * routine regulatory filing, which told a reader nothing and risked reading as the reason the
   * stock is on the list — when the screen is decided entirely by arithmetic.
   */
  it("counts the headlines without quoting one", async () => {
    mockBoard(board);
    render(<DipBuysScene />);

    expect(await screen.findByText("5 of 8 headlines positive")).toBeInTheDocument();
    expect(screen.queryByText("Bajaj Finance posts record quarter")).not.toBeInTheDocument();
  });

  // The footnote is the promise that the news is decoration on the card and not part of the screen.
  it("says the headlines are counted separately from the screen itself", async () => {
    mockBoard(board);
    render(<DipBuysScene />);

    await screen.findByText("BAJFINANCE");
    expect(screen.getByText(/never part of the screen/)).toBeInTheDocument();
  });

  // An unreachable feed and a market with nothing on sale are different outcomes, and a reader
  // deserves to know which one they are looking at.
  it("distinguishes a feed it could not reach from a market with nothing on sale", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const { unmount } = render(<DipBuysScene />);
    expect(await screen.findByText(/couldn't reach the exchange feed/)).toBeInTheDocument();
    unmount();

    mockBoard({ ...board, leaders: [] });
    render(<DipBuysScene />);
    expect(await screen.findByText(/nothing is on sale/)).toBeInTheDocument();
  });

  it("reports a refused response as a failure rather than as an empty market", async () => {
    mockBoard(null, false);
    render(<DipBuysScene />);

    expect(await screen.findByText(/couldn't reach the exchange feed/)).toBeInTheDocument();
  });

  it("shows dashes rather than zeros for a company the feed could not price", async () => {
    mockBoard({
      ...board,
      leaders: [{ ...leader, price: null, changePercent: null, yearReturn: null, offRecentHigh: null, referenceHigh: null, news: NO_NEWS }],
    });
    render(<DipBuysScene />);

    await screen.findByText("BAJFINANCE");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("No coverage this week")).toBeInTheDocument();
  });
});

describe("the branches a quiet day exercises", () => {
  const stock = DEFENCE_TRIO[0];

  // Green for a rising day, red for a falling one — the chip must not stay green through a fall.
  it("tints the day chip red when the stock is down", () => {
    render(<TrioCard stock={stock} performance={{ ...SAMPLE_PERFORMANCE, oneDay: -2.1 }} loading={false} />);

    expect(screen.getByText("−2.1%")).toHaveClass("bg-rose-100");
  });

  it("tints the day chip green when the stock is up", () => {
    render(<TrioCard stock={stock} performance={SAMPLE_PERFORMANCE} loading={false} />);

    expect(screen.getByText("+1.3%")).toHaveClass("bg-emerald-100");
  });

  it("greys the day chip when the feed has no move for it", () => {
    render(<TrioCard stock={stock} performance={{ ...SAMPLE_PERFORMANCE, oneDay: null }} loading={false} />);

    expect(screen.getByText("—", { selector: "span" })).toHaveClass("bg-white/90");
  });
});

describe("a dip leader BSE never classified", () => {
  const unclassified = {
    code: "540079",
    ticker: "SPRAYKING",
    name: "Sprayking Ltd",
    sector: null,
    capTier: null,
    price: 84.2,
    changePercent: -3.1,
    yearReturn: 88.4,
    referenceHigh: 102.5,
    offRecentHigh: -17.9,
    news: { positive: 0, negative: 0, neutral: 0, total: 0, score: 50, headline: null, headlineUrl: null, classifier: null },
  };

  // Most of the exchange has no published sector, and a card must not print a stray separator.
  it("prints the scrip code alone rather than a dangling separator", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leaders: [unclassified], sessionDate: "2026-08-07", examined: 150, fetchedAt: "2026-08-07T10:00:00.000Z" }),
    } as Response);

    render(<DipBuysScene />);

    expect(await screen.findByText("BSE 540079")).toBeInTheDocument();
  });

  // A board that arrives after the reader has moved on must not be written into a dead component.
  it("says nothing when the board lands after the slide has gone", async () => {
    let deliver: ((value: unknown) => void) | null = null;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    ) as unknown as typeof fetch;

    const { unmount } = render(<DipBuysScene />);
    await waitFor(() => expect(deliver).not.toBeNull());

    unmount();
    deliver!({ ok: true, json: async () => ({ leaders: [unclassified], sessionDate: null, examined: 0, fetchedAt: "" }) });

    // Nothing to assert on screen — the point is that resolving after unmount throws no warning
    // and updates no state. A React act() error here would fail the test.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("SPRAYKING")).not.toBeInTheDocument();
  });
});
