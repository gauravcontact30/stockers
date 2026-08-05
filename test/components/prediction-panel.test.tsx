import { render, screen } from "@testing-library/react";
import { PredictionPanel } from "../../app/components/prediction-panel";

describe("PredictionPanel", () => {
  it("renders the outlook for the given symbol", () => {
    render(<PredictionPanel symbol="RELIANCE" />);
    expect(screen.getByText("RELIANCE outlook")).toBeInTheDocument();
    expect(screen.getByText("Bullish momentum outlook")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("₹2,350")).toBeInTheDocument();
    expect(screen.getByText("Resistance")).toBeInTheDocument();
    expect(screen.getByText("₹2,540")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
