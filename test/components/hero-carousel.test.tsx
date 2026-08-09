import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeroCarousel } from "../../app/components/hero-carousel";

const SLIDE_MS = 6000;

function tick() {
  act(() => {
    jest.advanceTimersByTime(SLIDE_MS);
  });
}

const dots = () => screen.getAllByRole("button", { name: /Go to slide/ });
const activeDot = () => dots().findIndex((dot) => dot.getAttribute("aria-current") === "true");
// The button is the 44px touch target; the dot drawn inside it is what carries the active styling.
const dotMark = (index: number) => dots()[index].querySelector("span")!;

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
    render(<HeroCarousel />);
    expect(dots()).toHaveLength(4);
    expect(activeDot()).toBe(0);
    expect(dotMark(0).className).toContain("w-8 bg-emerald-500");
    expect(dotMark(1).className).toContain("w-2.5 bg-slate-400/50");
  });

  // Nothing is laid over the scenes, and the marketing copy that used to sit under them is gone
  // too — the scenes make the pitch themselves.
  it("puts no copy over or under the scene beyond the calls to action", () => {
    const { container } = render(<HeroCarousel />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;

    expect(frame.querySelector("h1")).toBeNull();
    expect(frame.querySelector("a")).toBeNull();
    expect(screen.queryByText(/Real BSE prices, and an AI that says what it expects next/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The arithmetic makes the call/)).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Explore dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  // The page still needs one h1 even with the visible headline cut.
  it("keeps a single heading for screen readers", () => {
    render(<HeroCarousel />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Stockers.AI");
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
    expect(screen.getByText("Aircraft, warships and optics, compared")).toBeInTheDocument();
    expect(screen.getByText("Three ways to own the build-out")).toBeInTheDocument();
    expect(screen.getByText("Best of the year, cheapest today")).toBeInTheDocument();
  });

  // Only the visible slide is exposed to a screen reader.
  it("hides the inactive slides from assistive technology", () => {
    const { container } = render(<HeroCarousel />);
    const frame = container.querySelector('[aria-roledescription="carousel"]')!;
    const panes = Array.from(frame.children);
    expect(panes).toHaveLength(4);
    expect(panes.filter((pane) => pane.getAttribute("aria-hidden") === "true")).toHaveLength(3);
  });

  it("plays on its own, one slide every six seconds", () => {
    render(<HeroCarousel />);
    tick();
    expect(activeDot()).toBe(1);
    tick();
    expect(activeDot()).toBe(2);
    tick();
    expect(activeDot()).toBe(3);
  });

  it("wraps around from the last slide back to the first", () => {
    render(<HeroCarousel />);
    tick();
    tick();
    tick();
    tick();
    expect(activeDot()).toBe(0);
  });

  it("navigates directly via a dot click and resets the auto-advance countdown", () => {
    render(<HeroCarousel />);
    fireEvent.click(dots()[2]);
    expect(activeDot()).toBe(2);

    // The stale slide-0 timer should have been cleared by the effect's cleanup, so advancing
    // one interval from here moves exactly one slide forward (2 -> 3), not further.
    tick();
    expect(activeDot()).toBe(3);
  });

  it("names each slide on its dot so the control is not four unlabelled circles", () => {
    render(<HeroCarousel />);
    expect(screen.getByRole("button", { name: "Go to slide 1: Today's top performers by theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to slide 4: How the AI works, and what it likes cheap today" })).toBeInTheDocument();
  });
});
