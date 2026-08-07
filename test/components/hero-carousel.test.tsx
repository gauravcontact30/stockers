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

describe("HeroCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts on the first of four slides", () => {
    render(<HeroCarousel />);
    expect(dots()).toHaveLength(4);
    expect(activeDot()).toBe(0);
    expect(dots()[0].className).toContain("w-8 bg-emerald-500");
    expect(dots()[1].className).toContain("w-2.5 bg-slate-400/50");
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
  it("draws the scenes inline, with no image to download", () => {
    const { container } = render(<HeroCarousel />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  // One scene per question the product answers, in the order a reader meets them.
  it("mounts all four scenes: movers, a pair, a three-stock report and the predictions", () => {
    render(<HeroCarousel />);
    expect(screen.getByText("Today's top performers")).toBeInTheDocument();
    expect(screen.getByText("Compare with AI")).toBeInTheDocument();
    expect(screen.getByText("AI comparison report")).toBeInTheDocument();
    expect(screen.getByText("How the analysis works")).toBeInTheDocument();
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
