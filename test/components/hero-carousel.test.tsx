// The landing page slider: four slides, in a fixed order, and every one of them a ranking.
//
//   1. Defence          the three strongest one-year returns among India's listed defence names
//   2. Retail           the same, over chains, quick commerce and restaurant groups
//   3. Most gainers 3Y  the three biggest three-year runs on the board
//   4. Investors        the three the week's buyers have crowded into, from broker lists and the tape
//
// No slide names its own companies any more: all four arrive as props resolved on the server. What
// is checked here is the wiring — the order, the props reaching the right scene, and a slide
// degrading rather than throwing when its ranking is unavailable — plus the carousel mechanics that
// were always true.

import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { HeroCarousel } from "../../app/components/hero-carousel";
import type { Trio } from "../../app/components/hero-scenes";
import type { StockPerformance } from "../../app/components/use-stock-performance";

const SLIDE_MS = 6000;

function tick() {
  act(() => {
    jest.advanceTimersByTime(SLIDE_MS);
  });
}

function panes(container: HTMLElement) {
  const frame = container.querySelector('[aria-roledescription="carousel"]')!;
  return Array.from(frame.children).filter((pane) => pane.hasAttribute("aria-hidden"));
}

function activePaneIndex(container: HTMLElement) {
  return panes(container).findIndex((pane) => pane.getAttribute("aria-hidden") === "false");
}

function performanceFor(symbol: string, price: number): StockPerformance {
  return {
    symbol,
    name: `${symbol} Ltd`,
    assetType: "stock",
    capTier: "Large",
    currency: "INR",
    price,
    previousClose: price - 1,
    change: 1,
    oneDay: 1,
    oneWeek: 2,
    oneMonth: 3,
    threeMonth: 4,
    sixMonth: 5,
    oneYear: 6,
    threeYear: 7,
    fiveYear: 8,
    overall: 9,
    overallSince: "2020-01-01",
    live: true,
    asOf: "2026-08-07T10:00:00.000Z",
    source: "Yahoo Finance",
  };
}

const PERFORMANCES = [
  performanceFor("BEL", 4100),
  performanceFor("HAL", 2900),
  performanceFor("MAZDOCK", 3300),
  performanceFor("DMART", 4200),
  performanceFor("TRENT", 5600),
  performanceFor("ETERNAL", 320),
];

function trioOf(symbols: [string, string, string], sector: string): Trio {
  const accents = ["border-emerald-300", "border-sky-300", "border-amber-300"];
  const washes = ["bg-emerald-50/70", "bg-sky-50/70", "bg-amber-50/70"];

  return symbols.map((symbol, index) => ({
    symbol,
    company: `${symbol} Ltd`,
    blurb: `Why ${symbol} is on this board.`,
    accent: accents[index],
    wash: washes[index],
    tier: "Large" as const,
    sector,
  })) as unknown as Trio;
}

const DEFENCE = trioOf(["BEL", "HAL", "MAZDOCK"], "Capital Goods & Industrials");
const RETAIL = trioOf(["DMART", "TRENT", "ETERNAL"], "Retail");
const THREE_YEAR_GAINERS = trioOf(["STLTECH", "HFCL", "SKYGOLD"], "Telecom - Equipment");

/** The investor slide is the only one whose cards carry the week's buying evidence. */
const BUYING = [
  { symbol: "RELIANCE", brokerRank: 1, brokers: ["Groww"], weekPercent: 4.2, trades: 240_000, turnoverCr: 380 },
  { symbol: "ITC", brokerRank: 5, brokers: ["Groww"], weekPercent: -1.4, trades: 96_000, turnoverCr: 210 },
  { symbol: "SBIN", brokerRank: null, brokers: [], weekPercent: null, trades: null, turnoverCr: null },
].map((row, index) => ({
  symbol: row.symbol,
  company: `${row.symbol} Ltd`,
  blurb: `${row.symbol} is widely bought.`,
  accent: ["border-emerald-300", "border-sky-300", "border-amber-300"][index],
  wash: ["bg-emerald-50/70", "bg-sky-50/70", "bg-amber-50/70"][index],
  tier: "Large" as const,
  sector: "Energy & Petrochemicals",
  flow: {
    brokerRank: row.brokerRank,
    brokers: row.brokers,
    weekPercent: row.weekPercent,
    trades: row.trades,
    turnoverCr: row.turnoverCr,
  },
})) as unknown as Trio;

const ALL = {
  defence: DEFENCE,
  retail: RETAIL,
  threeYearGainers: THREE_YEAR_GAINERS,
  investorBuying: BUYING,
};

const MOST_BOUGHT = {
  rows: [
    {
      buyRank: 1,
      buyScore: 88,
      symbol: "BOSCHLTD",
      name: "Bosch Ltd",
      bseCode: "500530",
      sector: "Auto",
      capTier: "Large" as const,
      price: 32000,
      previousClose: 31500,
      change: 500,
      changePercent: 1.6,
      volume: 12000,
      trades: 24000,
      turnoverCr: 380,
      turnoverShare: 1.4,
      averageTradeValue: 15000,
      brokerRank: 3,
      brokerNames: ["Groww"],
      signals: ["broker-list" as const, "crowded-tape" as const],
      live: true,
      asOf: "2026-08-17T05:00:00.000Z",
    },
  ],
  sessionDate: "2026-08-17",
  marketSession: "live" as const,
  liveSession: true,
  freshness: "live" as const,
  liveRows: 1,
  dataDay: "2026-08-17",
  nextUpdateAt: "2026-08-17T05:00:30.000Z",
  refreshMs: 30_000,
  asOf: "2026-08-17T05:00:00.000Z",
};

describe("HeroCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // The trio slides fetch live figures. Left unstubbed they reject against jsdom and push a
    // state update through outside act(), which is noise rather than a finding.
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts on the first of four slides", () => {
    const { container } = render(<HeroCarousel />);
    expect(activePaneIndex(container)).toBe(0);
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Go to slide/ })).not.toBeInTheDocument();
  });

  it("opens on the two sectors, then the three-year gainers and the buying board", () => {
    render(<HeroCarousel {...ALL} />);

    expect(screen.getByText("The three strongest defence stocks")).toBeInTheDocument();

    tick();
    expect(screen.getByText("The three strongest retail stocks")).toBeInTheDocument();

    tick();
    expect(screen.getByText("The three biggest three-year runs on the board")).toBeInTheDocument();

    tick();
    expect(screen.getByText("The three stocks investors are putting money into this week")).toBeInTheDocument();
  });

  it("names the arrow controls with their destination slides", () => {
    render(<HeroCarousel />);

    expect(
      screen.getByRole("button", {
        name: "Previous slide: Where investors are buying: the three most bought this week",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next slide: Retail: the sector's three strongest stocks" }),
    ).toBeInTheDocument();
  });

  // Nothing is laid over the scenes: no headline, no marketing ribbon under the frame.
  it("puts no headline or CTA ribbon over the scene", () => {
    const { container } = render(<HeroCarousel />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;

    expect(frame.querySelector("h1")).toBeNull();
    expect(screen.queryByRole("link", { name: "Start free" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Explore dashboard" })).not.toBeInTheDocument();
  });

  it("renders the most-bought ribbon below the slider, outside the carousel frame", () => {
    const { container } = render(<HeroCarousel mostBought={MOST_BOUGHT} />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;

    expect(within(frame as HTMLElement).queryByText("Bosch")).not.toBeInTheDocument();
    expect(screen.getAllByText("Bosch").length).toBeGreaterThan(0);
    // The buying rank is the point of the ribbon, so it is on the card itself.
    expect(screen.getAllByText("#1").length).toBeGreaterThan(0);
  });

  // The page still needs one h1 even with the visible headline cut.
  it("keeps a single heading for screen readers", () => {
    render(<HeroCarousel />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("StockersAI");
    expect(heading.className).toContain("sr-only");
  });

  /**
   * The scene artwork is drawn, not downloaded — that is why the hero stays sharp on a wide
   * display. The only images in the frame are the company marks, which are small logos rather than
   * scene artwork, and each falls back to a drawn monogram.
   */
  it("draws the scene artwork inline, with no artwork image to download", () => {
    const { container } = render(<HeroCarousel {...ALL} />);
    tick();
    tick();

    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => (image.getAttribute("alt") ?? "").endsWith(" logo"))).toBe(true);
  });

  it("mounts only the first scene, and the rest as the reader reaches them", () => {
    render(<HeroCarousel {...ALL} />);

    // Three of the four used to hydrate immediately for a reader looking at the first — work that
    // landed straight in the page's blocking time.
    expect(screen.queryByText("The three strongest retail stocks")).not.toBeInTheDocument();

    tick();
    expect(screen.getByText("The three strongest retail stocks")).toBeInTheDocument();
  });

  it("keeps a scene mounted once seen, so the crossfade has something to fade out of", () => {
    render(<HeroCarousel {...ALL} />);
    tick();

    expect(screen.getByText("The three strongest defence stocks")).toBeInTheDocument();
    expect(screen.getByText("The three strongest retail stocks")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // What each card carries
  // ---------------------------------------------------------------------------

  it("gives every company its own mark and the sector the exchange files it under", () => {
    const { container } = render(<HeroCarousel {...ALL} initialPerformance={PERFORMANCES} />);

    for (const symbol of ["BEL", "HAL", "MAZDOCK"]) {
      expect(screen.getByAltText(new RegExp(String.raw`\(${symbol}\) logo$`))).toBeInTheDocument();
    }

    // The sector pill draws its family's own glyph beside the name, so a sector is never text alone.
    const pill = container.querySelector('[title="Capital Goods & Industrials"]')!;
    expect(pill).toBeInTheDocument();
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("hands each trio its cached server figures, before any client fetch resolves", () => {
    render(<HeroCarousel {...ALL} initialPerformance={PERFORMANCES} />);

    expect(screen.getByText("₹4,100.00")).toBeInTheDocument();
    expect(screen.queryAllByText("Updating from live feed")).toHaveLength(0);

    tick();
    expect(screen.getByText("₹5,600.00")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The four rankings
  // ---------------------------------------------------------------------------

  it("shows the companies each sector ranking resolved to", () => {
    const { container } = render(<HeroCarousel {...ALL} />);

    const first = panes(container)[0] as HTMLElement;
    for (const symbol of ["BEL", "HAL", "MAZDOCK"]) {
      expect(within(first).getByText(symbol)).toBeInTheDocument();
    }

    tick();
    const second = panes(container)[1] as HTMLElement;
    for (const symbol of ["DMART", "TRENT", "ETERNAL"]) {
      expect(within(second).getByText(symbol)).toBeInTheDocument();
    }
  });

  it("shows the companies the three-year ranking resolved to, over the long windows", () => {
    const { container } = render(<HeroCarousel {...ALL} />);
    tick();
    tick();

    const slide = panes(container)[2] as HTMLElement;
    for (const symbol of ["STLTECH", "HFCL", "SKYGOLD"]) {
      expect(within(slide).getByText(symbol)).toBeInTheDocument();
    }
    // Three years, so the card reports the long windows rather than a single week.
    expect(within(slide).getAllByText("Overall")).toHaveLength(3);
    expect(within(slide).queryByText("1W")).not.toBeInTheDocument();
  });

  it("draws the week's buying evidence on the investor slide, and attributes it", () => {
    const { container } = render(<HeroCarousel {...ALL} />);
    tick();
    tick();
    tick();

    const slide = panes(container)[3] as HTMLElement;
    // The broker's own name labels its placing, so "#1 on Groww" never reads as "#1 on the tape".
    expect(within(slide).getAllByText("Groww")).toHaveLength(2);
    expect(within(slide).getByText("#1")).toBeInTheDocument();
    expect(within(slide).getByText("2.40 L")).toBeInTheDocument();
    expect(within(slide).getByText("₹380 Cr")).toBeInTheDocument();
    // A company no broker lists, and whose week could not be measured, draws dashes rather than
    // zeroes — and keeps its cells, so the three cards stay the same shape.
    expect(within(slide).getAllByText("Brokers")).toHaveLength(1);
    expect(within(slide).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    // The blurb gives way to the strip, because the strip is why the company is on the board.
    expect(within(slide).queryByText("RELIANCE is widely bought.")).not.toBeInTheDocument();
    // Attributed, not asserted: no venue publishes a net buy figure, and the footnote says what
    // stands in for one.
    expect(screen.getByText(/brokers' own published most-bought lists/)).toBeInTheDocument();
  });

  it("says it is reading rather than throwing when a ranking could not be built", () => {
    // A returns file that could not be read costs one slide its companies, not the whole hero.
    render(<HeroCarousel defence={null} retail={null} threeYearGainers={null} investorBuying={null} />);
    tick();
    tick();
    tick();

    expect(screen.getAllByText(/Reading the board/)).toHaveLength(4);
  });

  // ---------------------------------------------------------------------------
  // Mechanics
  // ---------------------------------------------------------------------------

  it("plays on its own, one slide every six seconds", () => {
    const { container } = render(<HeroCarousel />);
    tick();
    expect(activePaneIndex(container)).toBe(1);
    tick();
    expect(activePaneIndex(container)).toBe(2);
    tick();
    expect(activePaneIndex(container)).toBe(3);
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
  });

  it("wraps around from the last slide back to the first", () => {
    const { container } = render(<HeroCarousel />);
    tick();
    tick();
    tick();
    tick();
    expect(activePaneIndex(container)).toBe(0);
  });

  it("navigates with side arrows and resets the auto-advance countdown", () => {
    const { container } = render(<HeroCarousel />);
    fireEvent.click(screen.getByRole("button", { name: /Next slide/ }));
    expect(activePaneIndex(container)).toBe(1);

    // The stale slide-0 timer should have been cleared by the effect's cleanup, so advancing one
    // interval from here moves exactly one slide forward (1 -> 2), not further.
    tick();
    expect(activePaneIndex(container)).toBe(2);
  });

  it("wraps backward with the previous arrow", () => {
    const { container } = render(<HeroCarousel />);
    fireEvent.click(screen.getByRole("button", { name: /Previous slide/ }));
    expect(activePaneIndex(container)).toBe(3);
  });

  it("hides the inactive slides from assistive technology, and from the tab order", () => {
    const { container } = render(<HeroCarousel />);
    const all = panes(container);

    expect(all).toHaveLength(4);
    expect(all.filter((pane) => pane.getAttribute("aria-hidden") === "true")).toHaveLength(3);
    expect(all.filter((pane) => pane.hasAttribute("inert"))).toHaveLength(3);
    expect(all[0].hasAttribute("inert")).toBe(false);
  });
});
