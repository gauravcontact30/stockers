// The cap-tier mark.
//
// The icon is a scale rather than three unrelated glyphs — one bar for small, two for mid, three
// for large — so the tests check the fill, not the shape. And an unknown tier renders nothing at
// all: a pill reading "Unknown" would be a label for an absence.

import { render, screen } from "@testing-library/react";
import { CapTierBadge, CapTierIcon } from "../../app/components/cap-tier-badge";

/** The bars drawn at full strength, which is what encodes the tier. */
function filledBars(container: HTMLElement): number {
  return [...container.querySelectorAll("rect")].filter((bar) => bar.getAttribute("opacity") === "1").length;
}

describe("CapTierIcon", () => {
  it("fills one bar for small, two for mid and three for large", () => {
    const { container: small } = render(<CapTierIcon tier="small" />);
    const { container: mid } = render(<CapTierIcon tier="mid" />);
    const { container: large } = render(<CapTierIcon tier="large" />);

    expect(filledBars(small)).toBe(1);
    expect(filledBars(mid)).toBe(2);
    expect(filledBars(large)).toBe(3);
  });

  it("always draws all three bars, so the icon is a scale rather than three shapes", () => {
    const { container } = render(<CapTierIcon tier="small" />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });
});

describe("CapTierBadge", () => {
  it("names the tier, however the source cased it", () => {
    render(<CapTierBadge raw="Large" />);
    expect(screen.getByTitle("Large cap")).toHaveTextContent("Large");
  });

  it("reads the movers API's lower case and the exchange's title case alike", () => {
    const { rerender } = render(<CapTierBadge raw="mid" />);
    expect(screen.getByTitle("Mid cap")).toBeInTheDocument();

    rerender(<CapTierBadge raw="  SMALL  " />);
    expect(screen.getByTitle("Small cap")).toBeInTheDocument();
  });

  it("renders nothing for a scrip the universe has not ranked", () => {
    const { container } = render(<CapTierBadge raw={null} />);
    expect(container).toBeEmptyDOMElement();

    const { container: unknown } = render(<CapTierBadge raw="micro" />);
    expect(unknown).toBeEmptyDOMElement();
  });
});
