import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeroCarousel } from "../../app/components/hero-carousel";

describe("HeroCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the first slide as active with 4 navigation dots", () => {
    render(<HeroCarousel />);
    expect(screen.getByText("Every signal, gathered in one place")).toBeInTheDocument();
    const dots = screen.getAllByRole("button", { name: /Go to slide/ });
    expect(dots).toHaveLength(4);
    expect(dots[0].className).toContain("w-8 bg-emerald-400");
    expect(dots[1].className).toContain("w-2.5 bg-white/50");
  });

  it("shows the ticker tape on the trading-laptop slide", () => {
    render(<HeroCarousel />);
    expect(screen.getAllByText("NIFTY 50 ▲ 1.24%").length).toBeGreaterThan(0);
  });

  it("auto-advances to the next slide after 4 seconds", () => {
    render(<HeroCarousel />);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Every stock, priced and tracked live")).toBeInTheDocument();
  });

  it("wraps around from the last slide back to the first", () => {
    render(<HeroCarousel />);
    act(() => {
      jest.advanceTimersByTime(4000);
    }); // -> slide 1
    act(() => {
      jest.advanceTimersByTime(4000);
    }); // -> slide 2
    act(() => {
      jest.advanceTimersByTime(4000);
    }); // -> slide 3
    expect(screen.getByText("Where breaking news becomes a trading signal")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4000);
    }); // -> wraps back to slide 0
    expect(screen.getByText("Every signal, gathered in one place")).toBeInTheDocument();
  });

  it("navigates directly via a dot click and resets the auto-advance countdown", () => {
    render(<HeroCarousel />);
    const dots = screen.getAllByRole("button", { name: /Go to slide/ });
    fireEvent.click(dots[2]);
    expect(screen.getByText("Real BSE prices, decoded by AI")).toBeInTheDocument();
    expect(dots[2].className).toContain("w-8 bg-emerald-400");

    // The stale slide-0 timer should have been cleared by the effect's cleanup, so advancing
    // 4s from here moves exactly one slide forward (2 -> 3), not further.
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Where breaking news becomes a trading signal")).toBeInTheDocument();
  });

  it("renders the Start free and Explore dashboard CTAs", () => {
    render(<HeroCarousel />);
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Explore dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
