import { render, screen } from "@testing-library/react";
import { PortfolioCard } from "../../app/components/portfolio-card";

describe("PortfolioCard", () => {
  it("renders the heading and every holding row", () => {
    render(<PortfolioCard />);
    expect(screen.getByText("AI guided position mix")).toBeInTheDocument();
    expect(screen.getByText("Risk balanced")).toBeInTheDocument();

    expect(screen.getByText("Reliance")).toBeInTheDocument();
    expect(screen.getByText("HDFC Bank")).toBeInTheDocument();
    expect(screen.getByText("Infosys")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();

    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getAllByText(/Outlook:/)).toHaveLength(4);
  });
});
