import { render, screen } from "@testing-library/react";
import { MarketPulseBars } from "../../app/components/market-pulse-bars";

function barFills(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[style*='height']"));
}

describe("MarketPulseBars", () => {
  it("sizes each bar to the real advance/decline share", () => {
    const { container } = render(<MarketPulseBars advancing={75} declining={25} unchanged={4} live />);

    const [up, down] = barFills(container);
    expect(up.style.height).toBe("75%");
    expect(down.style.height).toBe("25%");

    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("4 flat")).toBeInTheDocument();
  });

  it("labels the pair for screen readers", () => {
    render(<MarketPulseBars advancing={12} declining={8} unchanged={0} live />);
    expect(screen.getByLabelText("12 stocks advancing, 8 declining")).toBeInTheDocument();
  });

  // While the market is shut the bars must read as inert, not as a live feed showing calm.
  it("greys out and stops animating when the market is closed", () => {
    const { container } = render(<MarketPulseBars advancing={75} declining={25} unchanged={0} live={false} />);

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse-bar")).toHaveLength(0);
    expect(container.querySelectorAll(".bg-emerald-500")).toHaveLength(0);
    expect(container.querySelectorAll(".bg-rose-500")).toHaveLength(0);
    expect(container.querySelectorAll(".bg-slate-300").length).toBeGreaterThan(0);
  });

  it("animates both bars in their own colours while live", () => {
    const { container } = render(<MarketPulseBars advancing={5} declining={5} unchanged={0} live />);

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse-bar")).toHaveLength(2);
    expect(container.querySelectorAll(".bg-emerald-500")).toHaveLength(1);
    expect(container.querySelectorAll(".bg-rose-500")).toHaveLength(1);
  });

  // A genuinely empty bar still gets a sliver of height so it reads as "none advancing" rather
  // than disappearing, which would look like missing data.
  it("keeps a zero bar visible at a minimum height", () => {
    const { container } = render(<MarketPulseBars advancing={0} declining={40} unchanged={0} live />);
    const [up, down] = barFills(container);
    expect(up.style.height).toBe("2%");
    expect(down.style.height).toBe("100%");
  });

  it("draws both bars at the floor when nothing has traded yet", () => {
    const { container } = render(<MarketPulseBars advancing={0} declining={0} unchanged={0} live />);
    for (const fill of barFills(container)) expect(fill.style.height).toBe("2%");
  });

  it("applies the caller's classes", () => {
    const { container } = render(<MarketPulseBars advancing={1} declining={1} unchanged={0} live className="test-bars" />);
    expect(container.querySelector(".test-bars")).toBeInTheDocument();
  });
});
