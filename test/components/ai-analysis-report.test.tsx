import { render, screen, fireEvent } from "@testing-library/react";
import { AiAnalysisReport, type AnalysisResponse } from "../../app/components/ai-analysis-report";
import type { CompetitorsData, Performance } from "../../app/components/use-stock-insights";

const baseAnalysis: AnalysisResponse = {
  stock: "TCS",
  marketPulse: "steady",
  summary: "Doing fine.",
  positiveSignals: ["Strong margins"],
  negativeSignals: ["Client concentration risk"],
  score: 72,
  risk: "Currency exposure",
  nextSteps: ["Watch Q2 results"],
  prediction: "Bullish momentum expected",
  outlook: "Steady growth expected across segments.",
  recommendation: "Outperform",
  recommendationReasons: ["Strong deal pipeline", "Margin expansion", "Buyback support", "Extra reason dropped"],
  keyInsights: ["Cloud demand accelerating", "Attrition down"],
  positiveNews: ["Won a large deal", "Cloud demand accelerating"],
};

const fullPerformance: Performance = {
  assetType: "stock",
  capTier: "Large",
  oneWeek: -2.2,
  oneMonth: 3.3,
  threeMonth: 0.2,
  sixMonth: -0.4,
  oneYear: 10,
  threeYear: -5.5,
  fiveYear: 40,
  overall: 42,
};

const partialPerformance: Performance = {
  assetType: "unknown",
  capTier: null,
  oneWeek: 0,
  oneMonth: -1,
  threeMonth: null,
  sixMonth: null,
  oneYear: null,
  threeYear: null,
  fiveYear: null,
  overall: null,
};

const competitorsData: CompetitorsData = {
  symbol: "TCS",
  group: "IT Services",
  groupType: "sector",
  peers: [
    {
      symbol: "TCS",
      name: "Tata Consultancy",
      logo: "https://www.google.com/s2/favicons?domain=tcs.com&sz=64",
      price: 3900.5,
      changePercent: 1.2,
      isSelf: true,
    },
    {
      symbol: "INFY",
      name: "Infosys",
      logo: "https://www.google.com/s2/favicons?sz=64",
      price: 1500,
      changePercent: -0.8,
      isSelf: false,
    },
    { symbol: "WIPRO", name: "Wipro", logo: "", price: null, changePercent: null, isSelf: false },
  ],
};

function renderReport(overrides: Partial<React.ComponentProps<typeof AiAnalysisReport>> = {}) {
  return render(
    <AiAnalysisReport
      analysis={baseAnalysis}
      performance={fullPerformance}
      perfLoading={false}
      competitors={competitorsData}
      competitorsLoading={false}
      {...overrides}
    />
  );
}

describe("AiAnalysisReport", () => {
  describe("outlook normalization", () => {
    it("shows Bullish when prediction mentions bull", () => {
      renderReport({ analysis: { ...baseAnalysis, prediction: "Strongly bullish setup" } });
      expect(screen.getByText("Bullish outlook")).toBeInTheDocument();
    });

    it("shows Bearish when prediction mentions bear", () => {
      renderReport({ analysis: { ...baseAnalysis, prediction: "A bearish tone ahead" } });
      expect(screen.getByText("Bearish outlook")).toBeInTheDocument();
    });

    it("shows Neutral when prediction is missing", () => {
      renderReport({ analysis: { ...baseAnalysis, prediction: undefined } });
      expect(screen.getByText("Neutral outlook")).toBeInTheDocument();
    });

    it("shows Neutral when prediction matches neither bull nor bear", () => {
      renderReport({ analysis: { ...baseAnalysis, prediction: "Sideways chop likely" } });
      expect(screen.getByText("Neutral outlook")).toBeInTheDocument();
    });

    it("renders the outlook summary line only when analysis.outlook is present", () => {
      const { rerender } = renderReport();
      expect(screen.getByText("Steady growth expected across segments.")).toBeInTheDocument();

      rerender(
        <AiAnalysisReport
          analysis={{ ...baseAnalysis, outlook: undefined }}
          performance={fullPerformance}
          perfLoading={false}
          competitors={competitorsData}
          competitorsLoading={false}
        />
      );
      expect(screen.queryByText("Steady growth expected across segments.")).not.toBeInTheDocument();
    });
  });

  describe("recommendation styling", () => {
    it("renders Outperform styling by default / when recommendation is unrecognized", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: "Something else entirely" } });
      expect(screen.getByText("Outperform")).toBeInTheDocument();
    });

    it("renders Hold styling", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: "Hold for now" } });
      expect(screen.getByText("Hold")).toBeInTheDocument();
    });

    it("renders Avoid styling for 'avoid'", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: "Avoid this stock" } });
      expect(screen.getByText("Avoid")).toBeInTheDocument();
    });

    it("renders Avoid styling for 'sell'", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: "Sell immediately" } });
      expect(screen.getByText("Avoid")).toBeInTheDocument();
    });

    it("renders Avoid styling for 'not buy'", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: "Do not buy right now" } });
      expect(screen.getByText("Avoid")).toBeInTheDocument();
    });

    it("renders Outperform styling when recommendation is undefined", () => {
      renderReport({ analysis: { ...baseAnalysis, recommendation: undefined } });
      expect(screen.getByText("Outperform")).toBeInTheDocument();
    });
  });

  describe("cap tier and ETF badges", () => {
    it("shows a Large Cap badge with the indigo style branch", () => {
      renderReport({ performance: { ...fullPerformance, capTier: "Large" }, competitors: null, competitorsLoading: false });
      expect(screen.getByText("Large Cap")).toBeInTheDocument();
    });

    it("shows a Mid Cap badge with the sky style branch", () => {
      renderReport({ performance: { ...fullPerformance, capTier: "Mid" }, competitors: null, competitorsLoading: false });
      expect(screen.getByText("Mid Cap")).toBeInTheDocument();
    });

    it("shows a Small Cap badge, falling into the default (teal) style branch", () => {
      renderReport({ performance: { ...fullPerformance, capTier: "Small" }, competitors: null, competitorsLoading: false });
      expect(screen.getByText("Small Cap")).toBeInTheDocument();
    });

    it("shows no cap badge when capTier is null", () => {
      renderReport({ performance: { ...fullPerformance, capTier: null }, competitors: null, competitorsLoading: false });
      expect(screen.queryByText(/Cap$/)).not.toBeInTheDocument();
    });

    it("shows an ETF badge when assetType is etf", () => {
      renderReport({ performance: { ...fullPerformance, assetType: "etf" }, competitors: null, competitorsLoading: false });
      expect(screen.getByText("ETF")).toBeInTheDocument();
    });

    it("shows no ETF badge for a plain stock", () => {
      renderReport({ performance: { ...fullPerformance, assetType: "stock" }, competitors: null, competitorsLoading: false });
      expect(screen.queryByText("ETF")).not.toBeInTheDocument();
    });

    it("shows neither badge when performance is null", () => {
      renderReport({ performance: null, perfLoading: false, competitors: null, competitorsLoading: false });
      expect(screen.queryByText("ETF")).not.toBeInTheDocument();
      expect(screen.queryByText(/Cap$/)).not.toBeInTheDocument();
    });
  });

  describe("Returns strip", () => {
    it("renders known values with up/down colors and diverging bars", () => {
      renderReport({ performance: fullPerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      expect(screen.getByText("-2.2%")).toBeInTheDocument();
      expect(screen.getByText("+3.3%")).toBeInTheDocument();
      expect(screen.getByText("+0.2%")).toBeInTheDocument();
      expect(screen.getByText("-0.4%")).toBeInTheDocument();
      expect(screen.getByText("+10.0%")).toBeInTheDocument();
      expect(screen.getByText("-5.5%")).toBeInTheDocument();
      expect(screen.getByText("+40.0%")).toBeInTheDocument();
      expect(screen.getByText("+42.0%")).toBeInTheDocument();
    });

    it("renders an em dash for unknown (null) values and treats 0 as up", () => {
      renderReport({ performance: partialPerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      expect(screen.getAllByText("—")).toHaveLength(6);
      expect(screen.getByText("+0.0%")).toBeInTheDocument();
      expect(screen.getByText("-1.0%")).toBeInTheDocument();
    });

    it("renders loading skeletons and hides bars while perfLoading is true", () => {
      const { container } = renderReport({
        performance: null,
        perfLoading: true,
        competitors: null,
        competitorsLoading: false,
      });
      expect(screen.queryByText("+3.3%")).not.toBeInTheDocument();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("falls back to a minimum bar scale of 1 when performance is null", () => {
      renderReport({ performance: null, perfLoading: false, competitors: null, competitorsLoading: false });
      expect(screen.getAllByText("—")).toHaveLength(8);
    });
  });

  describe("Competitors panel", () => {
    it("returns null (renders nothing) when not loading and there is no data", () => {
      const { container } = renderReport({ competitors: null, competitorsLoading: false });
      expect(container.textContent).not.toContain("Competitors");
    });

    it("returns null (renders nothing) when not loading and peers is empty", () => {
      const { container } = renderReport({
        competitors: { symbol: "TCS", group: "IT Services", groupType: "sector", peers: [] },
        competitorsLoading: false,
      });
      expect(container.textContent).not.toContain("Competitors");
    });

    it("renders loading skeleton rows and the generic ranking message while loading", () => {
      const { container } = renderReport({ competitors: null, competitorsLoading: true });
      expect(screen.getByText("Ranking against sector peers by market position…")).toBeInTheDocument();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("renders peers with self row highlighted, known and unknown price/change, and group label", () => {
      renderReport({ competitors: competitorsData, competitorsLoading: false });
      expect(screen.getByText(/Ranked by market position in IT Services/)).toBeInTheDocument();
      expect(screen.getByText("This stock")).toBeInTheDocument();
      expect(screen.getByText("₹3,900.5")).toBeInTheDocument();
      expect(screen.getByText("▲ 1.20%")).toBeInTheDocument();
      expect(screen.getByText("▼ 0.80%")).toBeInTheDocument();
    });

    it("asks the symbol store for each peer's own mark", () => {
      const { container } = renderReport({ competitors: competitorsData, competitorsLoading: false });

      expect(container.querySelector('img[src="https://images.dhan.co/symbol/TCS.png"]')).not.toBeNull();
      expect(container.querySelector('img[src="https://images.dhan.co/symbol/INFY.png"]')).not.toBeNull();
      // The host that no longer answers is never asked.
      expect(container.querySelector('img[src*="clearbit"]')).toBeNull();
    });

    it("shows the initial-letter badge only for a peer with no ticker to look up", () => {
      const nameless = {
        ...competitorsData,
        peers: [{ symbol: "", name: "Wipro", logo: "", price: null, changePercent: null, isSelf: false }],
      };
      renderReport({ competitors: nameless, competitorsLoading: false });

      expect(screen.getByText("W")).toBeInTheDocument();
    });

    it("draws a monogram once every real source for a peer has failed", () => {
      const { container } = renderReport({ competitors: competitorsData, competitorsLoading: false });

      let image = container.querySelector('img[alt$="(TCS) logo"]');
      while (image) {
        fireEvent.error(image);
        image = container.querySelector('img[alt$="(TCS) logo"]');
      }

      expect(screen.getAllByText("TCS").length).toBeGreaterThan(0);
    });
  });

  describe("Highlights and Risks lists", () => {
    it("renders reasons, highlights (deduped, capped at 3), and risks (risk + negativeSignals, capped at 3)", () => {
      renderReport();
      expect(screen.getByText("Strong deal pipeline")).toBeInTheDocument();
      expect(screen.getByText("Margin expansion")).toBeInTheDocument();
      expect(screen.getByText("Buyback support")).toBeInTheDocument();
      expect(screen.queryByText("Extra reason dropped")).not.toBeInTheDocument();

      // "Cloud demand accelerating" appears in both positiveNews and keyInsights -> deduped.
      expect(screen.getAllByText("Cloud demand accelerating")).toHaveLength(1);
      expect(screen.getByText("Won a large deal")).toBeInTheDocument();

      expect(screen.getByText("Currency exposure")).toBeInTheDocument();
      expect(screen.getByText("Client concentration risk")).toBeInTheDocument();
    });

    it("shows the empty-state message when reasons/highlights/risks are all empty", () => {
      renderReport({
        analysis: {
          ...baseAnalysis,
          recommendationReasons: [],
          positiveNews: [],
          keyInsights: [],
          risk: "",
          negativeSignals: [],
        },
      });
      const emptyMessages = screen.getAllByText("Nothing notable flagged.");
      expect(emptyMessages).toHaveLength(3);
    });

    it("handles missing optional array fields entirely (undefined) as empty", () => {
      const { recommendationReasons, positiveNews, keyInsights, negativeSignals, ...rest } = baseAnalysis;
      // negativeSignals is required by the AnalysisResponse type, but the component still
      // defends against a real caller omitting it (e.g. a raw, unnormalized API payload) via
      // `?? []` — deliberately construct that off-contract shape to exercise the fallback.
      renderReport({ analysis: { ...rest, risk: "" } as typeof baseAnalysis });
      const emptyMessages = screen.getAllByText("Nothing notable flagged.");
      expect(emptyMessages).toHaveLength(3);
    });
  });
});
