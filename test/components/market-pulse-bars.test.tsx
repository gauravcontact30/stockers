import { render, screen } from "@testing-library/react";
import {
  MarketPulseBars,
  advanceDeclineRatio,
  advanceShare,
  breadthLabel,
  formatRatio,
} from "../../app/components/market-pulse-bars";

describe("advanceShare", () => {
  it("is the advancing share of the decisive moves, ignoring flat stocks", () => {
    expect(advanceShare({ advancing: 60, declining: 40 })).toBe(60);
    // The 900 flat names must not drag the reading toward 50%.
    expect(advanceShare({ advancing: 3, declining: 1 })).toBe(75);
  });

  it("is zero before anything has traded", () => {
    expect(advanceShare({ advancing: 0, declining: 0 })).toBe(0);
  });
});

describe("advanceDeclineRatio", () => {
  it("divides advances by declines", () => {
    expect(advanceDeclineRatio({ advancing: 150, declining: 100 })).toBe(1.5);
  });

  it("has no ratio on an untraded tape, and an unbounded one when nothing fell", () => {
    expect(advanceDeclineRatio({ advancing: 0, declining: 0 })).toBeNull();
    expect(advanceDeclineRatio({ advancing: 12, declining: 0 })).toBe(Infinity);
  });
});

describe("formatRatio", () => {
  it.each([
    [1.5, "1.50 : 1"],
    [null, "—"],
    [Infinity, "All up"],
  ])("formats %s", (ratio, expected) => {
    expect(formatRatio(ratio)).toBe(expected);
  });
});

describe("breadthLabel", () => {
  it.each([
    [85, "Broad rally"],
    [60, "Buyers ahead"],
    [50, "Evenly split"],
    [35, "Sellers ahead"],
    [10, "Broad selling"],
  ])("reads %i%% advancing as %s", (share, label) => {
    expect(breadthLabel(share).label).toBe(label);
  });
});

describe("MarketPulseBars", () => {
  it("states the split, the reading behind it and the ratio", () => {
    render(<MarketPulseBars advancing={150} declining={100} unchanged={20} live />);

    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("Buyers ahead")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("1.50 : 1")).toBeInTheDocument();
    expect(screen.getByText(/270 tracked/)).toBeInTheDocument();
    expect(screen.getByLabelText("150 stocks advancing, 100 declining, 20 unchanged")).toBeInTheDocument();
  });

  it("sizes the three segments by their share of the whole tape", () => {
    const { container } = render(<MarketPulseBars advancing={50} declining={30} unchanged={20} live />);

    const segments = [...container.querySelectorAll("span[style]")];
    expect(segments.map((segment) => (segment as HTMLElement).style.width)).toEqual(["50%", "20%", "30%"]);
  });

  it("omits a segment that has no stocks in it", () => {
    const { container } = render(<MarketPulseBars advancing={80} declining={20} unchanged={0} live />);

    const segments = [...container.querySelectorAll("span[style]")];
    expect(segments).toHaveLength(2);
  });

  it("goes grey and still once the market shuts", () => {
    const { container } = render(<MarketPulseBars advancing={150} declining={100} unchanged={20} live={false} />);

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(container.querySelectorAll("span[style]")).toHaveLength(0);
    expect(container.querySelector(".animate-pulse-bar")).toBeNull();
  });

  it("survives a tape where nothing has traded at all", () => {
    render(<MarketPulseBars advancing={0} declining={0} unchanged={0} live />);

    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("Broad selling")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
