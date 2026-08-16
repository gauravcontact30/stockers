// The landing page slider: four slides, in a fixed order.
//
//   1. Most gainers 1Y   chosen by measured one-year returns
//   2. Investor buying   chosen by what brokers publish as most bought
//   3. Data centres      three companies at three points in the build-out
//   4. Defence           aircraft, warships and components, at three sizes
//
// The first two carry fixed companies; the last two are rankings whose companies arrive as props
// resolved on the server. What is checked here is the wiring — the order, the props reaching the
// right scene, and the ranking slides degrading rather than throwing when a board is unavailable —
// plus the carousel mechanics that were always true.

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
  performanceFor("HAL", 4100),
  performanceFor("MAZDOCK", 2900),
  performanceFor("PARAS", 710),
  performanceFor("NETWEB", 2500),
  performanceFor("POWERINDIA", 18000),
  performanceFor("LT", 3600),
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

const GAINERS = trioOf(["STLTECH", "HFCL", "SKYGOLD"], "Telecom - Equipment");
const FAVOURITES = trioOf(["SUZLON", "IREDA", "YESBANK"], "Electric Utilities");
const TOP_WEEKLY = [
  {
    symbol: "BOSCHLTD",
    name: "Bosch Ltd",
    weekPercent: 12.05,
    sector: "Auto",
    direction: "gainer" as const,
    returnPercent: 12.05,
    returns: { oneWeek: 12.05, threeMonth: 18.2, sixMonth: 31.4 },
  },
];

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

  it("opens on the two rankings, then data centres and defence", () => {
    render(<HeroCarousel yearGainers={GAINERS} investorFavourites={FAVOURITES} />);

    expect(screen.getByText("The three biggest one-year runs on the board")).toBeInTheDocument();

    tick();
    expect(screen.getByText("The three names most bought through India's brokers")).toBeInTheDocument();

    tick();
    expect(screen.getByText("Compare three data-centre stocks by market performance")).toBeInTheDocument();

    tick();
    expect(screen.getByText("Compare three defence stocks by market performance")).toBeInTheDocument();
  });

  it("names the arrow controls with their destination slides", () => {
    render(<HeroCarousel />);

    expect(
      screen.getByRole("button", { name: "Previous slide: Defence: aircraft, warships and components compared" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next slide: Where investors are buying: the three most bought through brokers" }),
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

  it("renders the stock ribbon below the slider, outside the carousel frame", () => {
    const { container } = render(<HeroCarousel topWeekly={TOP_WEEKLY} />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;

    expect(within(frame as HTMLElement).queryByText("Bosch Ltd")).not.toBeInTheDocument();
    expect(screen.getAllByText("Bosch Ltd").length).toBeGreaterThan(0);
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
    const { container } = render(<HeroCarousel />);
    tick();
    tick();

    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => (image.getAttribute("alt") ?? "").endsWith(" logo"))).toBe(true);
  });

  it("mounts only the first scene, and the rest as the reader reaches them", () => {
    render(<HeroCarousel />);

    // Three of the four used to hydrate immediately for a reader looking at the first — work that
    // landed straight in the page's blocking time.
    expect(screen.getByText(/Reading the board/)).toBeInTheDocument();
    expect(screen.queryByText("The three names most bought through India's brokers")).not.toBeInTheDocument();

    tick();
    expect(screen.getByText("The three names most bought through India's brokers")).toBeInTheDocument();
  });

  it("keeps a scene mounted once seen, so the crossfade has something to fade out of", () => {
    render(<HeroCarousel />);
    tick();

    expect(screen.getAllByText(/Reading the board/).length).toBeGreaterThan(0);
    expect(screen.getByText("The three names most bought through India's brokers")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // What each card carries
  // ---------------------------------------------------------------------------

  it("gives every company its own mark and the sector the exchange files it under", () => {
    const { container } = render(<HeroCarousel initialPerformance={PERFORMANCES} />);

    tick();
    tick();

    // The data-centre trio, on the third slide.
    for (const symbol of ["NETWEB", "POWERINDIA", "LT"]) {
      expect(screen.getByAltText(new RegExp(String.raw`\(${symbol}\) logo$`))).toBeInTheDocument();
    }

    // The sector pill draws its family's own glyph beside the name, so a sector is never text alone.
    const pill = container.querySelector('[title="Civil Construction"]')!;
    expect(pill).toBeInTheDocument();
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("hands the defence trio its cached server figures, before any client fetch resolves", () => {
    render(<HeroCarousel initialPerformance={PERFORMANCES} />);
    tick();
    tick();
    tick();

    expect(screen.getByText("₹4,100.00")).toBeInTheDocument();
    expect(screen.queryAllByText("Updating from live feed")).toHaveLength(0);
  });

  it("hands the data-centre trio its cached server figures", () => {
    render(<HeroCarousel initialPerformance={PERFORMANCES} />);
    tick();
    tick();

    expect(screen.getByText("₹18,000.00")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The two rankings
  // ---------------------------------------------------------------------------

  it("shows the companies the one-year ranking resolved to", () => {
    const { container } = render(<HeroCarousel yearGainers={GAINERS} />);

    const slide = panes(container)[0];
    for (const symbol of ["STLTECH", "HFCL", "SKYGOLD"]) {
      expect(within(slide as HTMLElement).getByText(symbol)).toBeInTheDocument();
    }
  });

  it("shows the companies the broker ranking resolved to, and attributes the placing", () => {
    const { container } = render(<HeroCarousel investorFavourites={FAVOURITES} />);
    tick();

    const slide = panes(container)[1];
    expect(within(slide as HTMLElement).getByText("SUZLON")).toBeInTheDocument();
    // Attributed, not asserted: this is what the brokers publish, not what we measured.
    expect(screen.getByText(/the brokers' own published most-bought lists/)).toBeInTheDocument();
  });

  it("says it is reading rather than throwing when a ranking could not be built", () => {
    // A broker feed that changed its HTML must cost one slide its companies, not take the hero down.
    render(<HeroCarousel yearGainers={null} investorFavourites={null} />);
    tick();
    tick();

    expect(screen.getAllByText(/Reading the board/).length).toBeGreaterThan(0);
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
