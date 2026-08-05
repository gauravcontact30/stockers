import { render, screen } from "@testing-library/react";
import { AnalyticsPanel } from "../../app/components/analytics-panel";

describe("AnalyticsPanel", () => {
  it("renders the heading and a bar for each week", () => {
    render(<AnalyticsPanel />);
    expect(screen.getByText("Signal strength by week")).toBeInTheDocument();
    expect(screen.getByText("Trend view")).toBeInTheDocument();

    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByText(`W${i}`)).toBeInTheDocument();
    }
  });
});
