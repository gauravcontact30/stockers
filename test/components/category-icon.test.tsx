import { render, screen } from "@testing-library/react";
import { CategoryIcon, glyphFor } from "../../app/components/category-icon";

describe("glyphFor", () => {
  it("gives each industry its own mark", () => {
    // Two unrelated industries must not end up drawing the same thing.
    expect(glyphFor("Information Technology")).not.toBe(glyphFor("Power"));
    expect(glyphFor("Automobile and Auto Components")).not.toBe(glyphFor("Textiles"));
  });

  it("matches on a keyword, so a renamed category keeps its mark", () => {
    expect(glyphFor("Automobiles")).toBe(glyphFor("Automobile and Auto Components"));
    expect(glyphFor("Oil, Gas & Consumable Fuels")).toBe(glyphFor("Oil & Gas"));
  });

  it("prefers the more specific keyword where two could match", () => {
    // "Construction Materials" is bricks, not the crane that plain "Construction" gets.
    expect(glyphFor("Construction Materials")).not.toBe(glyphFor("Construction"));
  });

  it("falls back to a neutral mark rather than a wrong one", () => {
    const fallback = glyphFor("Something The Exchange Has Not Published Before");
    expect(fallback).toBe(glyphFor("Another Unknown Bucket"));
    expect(fallback).not.toBe(glyphFor("Healthcare"));
  });
});

describe("CategoryIcon", () => {
  it("draws an svg that inherits its colour, hidden from screen readers", () => {
    const { container } = render(<CategoryIcon category="Healthcare" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveClass("h-5", "w-5");
    expect(svg?.querySelector("[stroke='currentColor']")).toBeInTheDocument();
  });

  it("takes a size from its caller", () => {
    const { container } = render(<CategoryIcon category="Power" className="h-[18px] w-[18px]" />);
    expect(container.querySelector("svg")).toHaveClass("h-[18px]", "w-[18px]");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
