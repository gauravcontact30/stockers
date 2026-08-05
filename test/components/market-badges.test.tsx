import { render, screen } from "@testing-library/react";
import { CapTierPill, LiveIndicator } from "../../app/components/market-badges";

describe("CapTierPill", () => {
  it.each([
    ["Large", "bg-indigo-100"],
    ["Mid", "bg-sky-100"],
    ["Small", "bg-teal-100"],
  ] as const)("renders the %s tier with its own color and label", (tier, expectedClass) => {
    render(<CapTierPill tier={tier} />);
    const pill = screen.getByText(`${tier} Cap`);
    expect(pill).toHaveClass(expectedClass);
  });

  it("appends a custom className when provided", () => {
    render(<CapTierPill tier="Large" className="extra-class" />);
    expect(screen.getByText("Large Cap")).toHaveClass("extra-class");
  });
});

describe("LiveIndicator", () => {
  it("renders the default 'Live' label", () => {
    render(<LiveIndicator />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<LiveIndicator label="Streaming" />);
    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });

  it("appends a custom className when provided", () => {
    render(<LiveIndicator className="justify-end" />);
    expect(screen.getByText("Live")).toHaveClass("justify-end");
  });
});
