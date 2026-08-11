import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeroCarousel } from "../../app/components/hero-carousel";
import type { StockPerformance } from "../../app/components/use-stock-performance";

const SLIDE_MS = 6000;

function tick() {
  act(() => {
    jest.advanceTimersByTime(SLIDE_MS);
  });
}

function activePaneIndex(container: HTMLElement) {
  const frame = container.querySelector('[aria-roledescription="carousel"]')!;
  const panes = Array.from(frame.children).filter((pane) => pane.hasAttribute("aria-hidden"));
  return panes.findIndex((pane) => pane.getAttribute("aria-hidden") === "false");
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

describe("HeroCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Two of the four slides carry live figures. Left unstubbed they reject against jsdom and
    // push a state update through outside act(), which is noise rather than a finding.
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

  // Nothing is laid over the scenes, and the marketing copy that used to sit under them is gone
  // too — the scenes make the pitch themselves.
  it("puts no copy or CTA ribbon over or under the scene", () => {
    const { container } = render(<HeroCarousel />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;

    expect(frame.querySelector("h1")).toBeNull();
    expect(frame.querySelector("a")).toBeNull();
    expect(screen.queryByText(/Real BSE prices, and an AI that says what it expects next/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The arithmetic makes the call/)).not.toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Start free" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Explore dashboard" })).not.toBeInTheDocument();
  });

  // The page still needs one h1 even with the visible headline cut.
  it("keeps a single heading for screen readers", () => {
    render(<HeroCarousel />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("StockersAI");
    expect(heading).toHaveTextContent("AI stock research for Indian investors");
    expect(heading.className).toContain("sr-only");
  });

  // Every scene is drawn live rather than loaded as an image.
  /**
   * The scene artwork is drawn, not downloaded — that is why the hero stays sharp on a wide
   * display. The only images in the frame are the company marks on the two live-figure slides,
   * which are 32px logos rather than scene artwork, and each falls back to a drawn monogram.
   */
  it("draws the scene artwork inline, with no artwork image to download", () => {
    const { container } = render(<HeroCarousel />);

    const images = Array.from(container.querySelectorAll("img"));
    expect(images.every((image) => (image.getAttribute("alt") ?? "").endsWith(" logo"))).toBe(true);

    // The scenes themselves are DOM and CSS, so there is real content in the frame that arrived
    // with the page rather than over the network.
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;
    expect(frame.querySelectorAll("div").length).toBeGreaterThan(20);
  });

  // One scene per question the product answers, in the order a reader meets them.
  it("mounts all four scenes: movers, defence, data centres and the winners on sale", () => {
    render(<HeroCarousel />);
    expect(screen.getByText("Today's top performers")).toBeInTheDocument();
    expect(screen.getByText("Compare three defence stocks by market performance")).toBeInTheDocument();
    expect(screen.getByText("Compare three data-centre stocks by market performance")).toBeInTheDocument();
    expect(screen.getByText("Best of the year, cheapest today")).toBeInTheDocument();
  });

  it("passes cached server figures into slides two, three and four before client fetch resolves", () => {
    render(
      <HeroCarousel
        initialPerformance={[
          performanceFor("HAL", 4100),
          performanceFor("MAZDOCK", 2900),
          performanceFor("PARAS", 710),
          performanceFor("NETWEB", 2500),
          performanceFor("POWERINDIA", 18000),
          performanceFor("LT", 3600),
        ]}
        initialDipLeaders={{
          leaders: [
            {
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
              news: { positive: 5, negative: 1, neutral: 2, total: 8, score: 63, headline: null, headlineUrl: null, classifier: "ai" },
            },
          ],
          sessionDate: "2026-08-07",
          examined: 150,
          fetchedAt: "2026-08-07T10:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("₹4,100.00")).toBeInTheDocument();
    expect(screen.getByText("₹18,000.00")).toBeInTheDocument();
    expect(screen.getByText("BAJFINANCE")).toBeInTheDocument();
    expect(screen.queryAllByText("Updating from live feed")).toHaveLength(0);
  });

  // Only the visible slide is exposed to a screen reader.
  it("hides the inactive slides from assistive technology", () => {
    const { container } = render(<HeroCarousel />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;
    const panes = Array.from(frame.children).filter((pane) => pane.hasAttribute("aria-hidden"));
    expect(panes).toHaveLength(4);
    expect(panes.filter((pane) => pane.getAttribute("aria-hidden") === "true")).toHaveLength(3);
  });

  it("plays on its own, one slide every six seconds", () => {
    const { container } = render(<HeroCarousel />);
    tick();
    expect(activePaneIndex(container)).toBe(1);
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    tick();
    expect(activePaneIndex(container)).toBe(2);
    expect(screen.getByText("3 / 4")).toBeInTheDocument();
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
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });

  it("navigates with side arrows and resets the auto-advance countdown", () => {
    const { container } = render(<HeroCarousel />);
    fireEvent.click(screen.getByRole("button", { name: /Next slide/ }));
    expect(activePaneIndex(container)).toBe(1);
    expect(screen.getByText("2 / 4")).toBeInTheDocument();

    // The stale slide-0 timer should have been cleared by the effect's cleanup, so advancing
    // one interval from here moves exactly one slide forward (1 -> 2), not further.
    tick();
    expect(activePaneIndex(container)).toBe(2);
  });

  it("wraps backward with the previous arrow", () => {
    const { container } = render(<HeroCarousel />);
    fireEvent.click(screen.getByRole("button", { name: /Previous slide/ }));
    expect(activePaneIndex(container)).toBe(3);
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
  });

  it("names the arrow controls with their destination slides", () => {
    render(<HeroCarousel />);
    expect(screen.getByRole("button", { name: "Previous slide: How the AI works, and what it likes cheap today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next slide: HAL, Mazagon Dock and Paras Defence compared" })).toBeInTheDocument();
  });
});
