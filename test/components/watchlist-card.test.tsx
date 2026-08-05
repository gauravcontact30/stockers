import { render, screen } from "@testing-library/react";
import { WatchlistCard } from "../../app/components/watchlist-card";

describe("WatchlistCard", () => {
  it("renders the heading and every watchlist row", () => {
    render(<WatchlistCard />);
    expect(screen.getByText("AI suggested positions")).toBeInTheDocument();
    expect(screen.getByText("Updated today")).toBeInTheDocument();

    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Bullish")).toBeInTheDocument();
    expect(screen.getByText("+2.4%")).toBeInTheDocument();

    expect(screen.getByText("HDFCBANK")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.getByText("-0.3%")).toBeInTheDocument();
  });
});
