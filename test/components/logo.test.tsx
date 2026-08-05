import { render, screen } from "@testing-library/react";
import { Logo, LogoMark, Wordmark } from "../../app/components/logo";

describe("LogoMark", () => {
  it("renders with default props", () => {
    render(<LogoMark />);
    const svg = screen.getByRole("img", { name: "Stockers.AI" });
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });

  it("renders with custom size, className and gradientId", () => {
    render(<LogoMark size={64} className="extra-class" gradientId="custom-gradient" />);
    const svg = screen.getByRole("img", { name: "Stockers.AI" });
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveClass("extra-class");
    expect(svg.querySelector("rect")).toHaveAttribute("fill", "url(#custom-gradient)");
  });
});

describe("Wordmark", () => {
  it("renders with default className", () => {
    render(<Wordmark />);
    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.getByText(".AI")).toBeInTheDocument();
  });

  it("renders with a custom className", () => {
    render(<Wordmark className="text-3xl" />);
    expect(screen.getByText("Stockers").parentElement).toHaveClass("text-3xl");
  });
});

describe("Logo", () => {
  it("renders stacked with wordmark and tagline", () => {
    render(<Logo stacked showWordmark showTagline />);
    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.getByText("AI Market Research")).toBeInTheDocument();
  });

  it("renders stacked with wordmark but no tagline", () => {
    render(<Logo stacked showWordmark showTagline={false} />);
    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.queryByText("AI Market Research")).not.toBeInTheDocument();
  });

  it("renders stacked without a wordmark", () => {
    render(<Logo stacked showWordmark={false} />);
    expect(screen.queryByText("Stockers")).not.toBeInTheDocument();
  });

  it("renders inline (default) with wordmark and tagline", () => {
    render(<Logo showTagline gradientId="inline-gradient" />);
    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.getByText("AI Market Research")).toBeInTheDocument();
  });

  it("renders inline with default props (wordmark, no tagline)", () => {
    render(<Logo />);
    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.queryByText("AI Market Research")).not.toBeInTheDocument();
  });

  it("renders inline without a wordmark", () => {
    render(<Logo showWordmark={false} />);
    expect(screen.queryByText("Stockers")).not.toBeInTheDocument();
  });
});
