import { render, screen, fireEvent } from "@testing-library/react";
import { AiReportModal } from "../../app/components/ai-report-modal";
import type { AnalysisResponse } from "../../app/components/ai-analysis-report";
import type { CompetitorsData, Performance } from "../../app/components/use-stock-insights";

jest.mock("../../app/components/use-stock-insights", () => ({
  usePerformance: jest.fn(),
  useCompetitors: jest.fn(),
}));

import { usePerformance, useCompetitors } from "../../app/components/use-stock-insights";

const mockUsePerformance = usePerformance as jest.Mock;
const mockUseCompetitors = useCompetitors as jest.Mock;

const baseAnalysis: AnalysisResponse = {
  stock: "TCS",
  marketPulse: "steady",
  summary: "Doing fine.",
  positiveSignals: ["Strong margins"],
  negativeSignals: ["Client concentration risk"],
  score: 81,
  risk: "Currency exposure",
  nextSteps: ["Watch Q2 results"],
  recommendation: "Outperform",
  source: "ai",
};

const allKnownPerformance: Performance = {
  assetType: "stock",
  capTier: "Mid",
  oneWeek: 1,
  oneMonth: 2,
  threeMonth: 3,
  sixMonth: -4,
  oneYear: 5,
  threeYear: -6,
  fiveYear: 7,
  overall: 8,
};

const allPositivePerformance: Performance = {
  assetType: "stock",
  capTier: "Large",
  oneWeek: 1,
  oneMonth: 2,
  threeMonth: 3,
  sixMonth: 4,
  oneYear: 5,
  threeYear: 6,
  fiveYear: 7,
  overall: 8,
};

const allNegativePerformance: Performance = {
  assetType: "stock",
  capTier: "Small",
  oneWeek: -1,
  oneMonth: -2,
  threeMonth: -3,
  sixMonth: -4,
  oneYear: -5,
  threeYear: -6,
  fiveYear: -7,
  overall: -8,
};

const negativeOverallPerformance: Performance = {
  ...allKnownPerformance,
  overall: -3,
};

const allNullPerformance: Performance = {
  assetType: "unknown",
  capTier: null,
  oneWeek: null,
  oneMonth: null,
  threeMonth: null,
  sixMonth: null,
  oneYear: null,
  threeYear: null,
  fiveYear: null,
  overall: null,
};

function makeCompetitors(peers: CompetitorsData["peers"]): CompetitorsData {
  return { symbol: "TCS", group: "IT Services", groupType: "sector", peers };
}

const peersSelfFirst = makeCompetitors([
  { symbol: "TCS", name: "Tata Consultancy", logo: "", price: 3900, changePercent: 1.2, isSelf: true },
  { symbol: "INFY", name: "Infosys", logo: "", price: 1500, changePercent: -0.8, isSelf: false },
  { symbol: "WIPRO", name: "Wipro", logo: "", price: 290, changePercent: 0.5, isSelf: false },
]);

const peersSelfLast = makeCompetitors([
  { symbol: "INFY", name: "Infosys", logo: "", price: 1500, changePercent: -0.8, isSelf: false },
  { symbol: "WIPRO", name: "Wipro", logo: "", price: 290, changePercent: 0.5, isSelf: false },
  { symbol: "TCS", name: "Tata Consultancy", logo: "", price: 3900, changePercent: 1.2, isSelf: true },
]);

const peersNoSelf = makeCompetitors([
  { symbol: "INFY", name: "Infosys", logo: "", price: 1500, changePercent: -0.8, isSelf: false },
  { symbol: "WIPRO", name: "Wipro", logo: "", price: 290, changePercent: 0.5, isSelf: false },
]);

function setInsights({
  performance = null,
  perfLoading = false,
  competitors = null,
  competitorsLoading = false,
}: {
  performance?: Performance | null;
  perfLoading?: boolean;
  competitors?: CompetitorsData | null;
  competitorsLoading?: boolean;
}) {
  mockUsePerformance.mockReturnValue({ performance, loading: perfLoading });
  mockUseCompetitors.mockReturnValue({ competitors, loading: competitorsLoading });
}

describe("AiReportModal", () => {
  beforeEach(() => {
    setInsights({});
  });

  describe("loading and no-report states", () => {
    it("shows the spinner and 'Researching…' title/text when loading with no company name", () => {
      render(<AiReportModal open={true} onClose={jest.fn()} loading={true} analysis={null} />);
      // "Researching…" appears both as the header title (h4) and the spinner caption (p) —
      // scope to the spinner paragraph specifically to disambiguate.
      expect(screen.getByText("Researching…", { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Researching…" })).toBeInTheDocument();
    });

    it("appends the company name to the spinner text when provided", () => {
      render(
        <AiReportModal open={true} onClose={jest.fn()} loading={true} analysis={null} companyName="Tata Consultancy" />
      );
      expect(screen.getByText("Researching Tata Consultancy…", { selector: "p" })).toBeInTheDocument();
      // The company name sub-line under the title is independent of loading/analysis.
      expect(screen.getByText("Tata Consultancy")).toBeInTheDocument();
    });

    it("shows the 'Stock report' title and 'no report available' body when not loading and analysis is null", () => {
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={null} />);
      expect(screen.getByRole("heading", { name: "Stock report" })).toBeInTheDocument();
      expect(screen.getByText("No report available for this stock yet.")).toBeInTheDocument();
      // Default disclaimer footer branch (analysis is null).
      expect(
        screen.getByText(
          "Educational research only, not investment advice — always verify with your broker or a SEBI-registered advisor before trading."
        )
      ).toBeInTheDocument();
      // No recommendation badge without analysis.
      expect(screen.queryByText("Outperform")).not.toBeInTheDocument();
    });
  });

  describe("footer stats: best/weakest/overall periods", () => {
    it("renders skeletons for performance- and competitor-dependent stats while loading", () => {
      setInsights({ performance: null, perfLoading: true, competitors: null, competitorsLoading: true });
      const { baseElement } = render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(baseElement.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
      // AI score is never gated by loading.
      expect(screen.getByText("81/100")).toBeInTheDocument();
    });

    it("computes best/worst period, an em dash when performance is null, and a down tone for a negative worst", () => {
      setInsights({ performance: allKnownPerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);

      // Best is fiveYear (7) -> "+7.0%"; worst is threeYear (-6) -> "-6.0%". The real (unmocked)
      // AiAnalysisReport body also renders these same per-period values in its Returns strip,
      // so assert presence via getAllByText rather than assuming a single match.
      expect(screen.getAllByText("+7.0%").length).toBeGreaterThan(0);
      expect(screen.getAllByText("-6.0%").length).toBeGreaterThan(0);
      expect(screen.getAllByText("5Y").length).toBeGreaterThan(0);
      expect(screen.getAllByText("3Y").length).toBeGreaterThan(0);

      // Overall is 8 -> positive/up tone.
      expect(screen.getAllByText("+8.0%").length).toBeGreaterThan(0);
    });

    it("shows an em dash for best/weakest/overall when performance has no known numeric periods", () => {
      setInsights({ performance: allNullPerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      // Best, Weakest, and Overall all render "—" (3 occurrences).
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    });

    it("shows an em dash for best/weakest when performance itself is null", () => {
      setInsights({ performance: null, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    });

    it("gives the overall stat a down tone when it is negative", () => {
      setInsights({ performance: negativeOverallPerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("-3.0%").length).toBeGreaterThan(0);
    });

    it("signs the worst period with a '+' and leaves its tone undefined when it is non-negative", () => {
      setInsights({ performance: allPositivePerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      // Worst (min) of an all-positive set is still >= 0 -> "+1.0%", and best (max) is "+8.0%".
      expect(screen.getAllByText("+1.0%").length).toBeGreaterThan(0);
      expect(screen.getAllByText("+8.0%").length).toBeGreaterThan(0);
    });

    it("signs the best period without a '+' when it is negative", () => {
      setInsights({ performance: allNegativePerformance, perfLoading: false, competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      // Best (max) of an all-negative set is still negative -> "-1.0%" (no leading "+").
      expect(screen.getAllByText("-1.0%").length).toBeGreaterThan(0);
      expect(screen.getAllByText("-8.0%").length).toBeGreaterThan(0);
    });
  });

  describe("footer stats: sector rank", () => {
    it("shows #1 of N when the stock is first among peers", () => {
      setInsights({ competitors: peersSelfFirst, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getByText("#1 of 3")).toBeInTheDocument();
      expect(screen.getByText("IT Services")).toBeInTheDocument();
    });

    it("shows #N of N when the stock is last among peers", () => {
      setInsights({ competitors: peersSelfLast, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getByText("#3 of 3")).toBeInTheDocument();
    });

    it("shows an em dash when no peer is marked as self", () => {
      setInsights({ competitors: peersNoSelf, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    });

    it("shows an em dash when there are no competitors at all", () => {
      setInsights({ competitors: null, competitorsLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("recommendation badge", () => {
    it.each([
      ["Avoid this one", "Avoid"],
      ["Please sell now", "Avoid"],
      ["Definitely not buy", "Avoid"],
      ["Hold steady", "Hold"],
      ["Strong outperform signal", "Outperform"],
      [undefined, "Outperform"],
    ])("maps recommendation %p to badge %p", (recommendation, label) => {
      // The real (unmocked) AiAnalysisReport body computes its own, separately-styled
      // recommendation badge from the same field, so "Outperform"/"Hold" can legitimately appear
      // twice (header + body) — assert presence via getAllByText rather than a single match.
      render(
        <AiReportModal
          open={true}
          onClose={jest.fn()}
          loading={false}
          analysis={{ ...baseAnalysis, recommendation }}
        />
      );
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  describe("cap tier / ETF badges in the header", () => {
    it("shows a cap tier badge for a known capTier", () => {
      setInsights({ performance: allKnownPerformance, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("Mid Cap").length).toBeGreaterThan(0);
    });

    it("shows a Large Cap badge (indigo style branch)", () => {
      setInsights({ performance: { ...allKnownPerformance, capTier: "Large" }, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("Large Cap").length).toBeGreaterThan(0);
    });

    it("shows a Small Cap badge (default style branch)", () => {
      setInsights({ performance: { ...allKnownPerformance, capTier: "Small" }, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("Small Cap").length).toBeGreaterThan(0);
    });

    it("shows no cap badge when performance is null", () => {
      setInsights({ performance: null, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.queryByText(/Cap$/)).not.toBeInTheDocument();
    });

    it("shows an ETF badge when assetType is etf", () => {
      setInsights({ performance: { ...allKnownPerformance, assetType: "etf" }, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.getAllByText("ETF").length).toBeGreaterThan(0);
    });

    it("shows no ETF badge for a plain stock", () => {
      setInsights({ performance: allKnownPerformance, perfLoading: false });
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);
      expect(screen.queryByText("ETF")).not.toBeInTheDocument();
    });
  });

  describe("source provenance line", () => {
    it("shows 'AI-generated' when source is ai", () => {
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={{ ...baseAnalysis, source: "ai" }} />);
      expect(screen.getByText(/AI-generated/)).toBeInTheDocument();
    });

    it("shows 'Heuristic demo' when source is not ai", () => {
      render(
        <AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={{ ...baseAnalysis, source: "demo" }} />
      );
      expect(screen.getByText(/Heuristic demo/)).toBeInTheDocument();
    });
  });

  describe("the company mark in the modal chrome", () => {
    it("asks the symbol store for the stock's own logo", () => {
      const { baseElement } = render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);

      expect(baseElement.querySelector('img[src="https://images.dhan.co/symbol/TCS.png"]')).not.toBeNull();
      // The host that no longer serves logos is never asked, here or anywhere else.
      expect(baseElement.querySelector('img[src*="clearbit"]')).toBeNull();
    });

    it("falls back to the display-name initial when there is no stock to look up", () => {
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={null} companyName="Tata Consultancy" />);
      expect(screen.getByText("T")).toBeInTheDocument();
    });

    it("falls back to '?' when there is neither a stock nor any display name", () => {
      render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={null} />);
      expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("draws a monogram once every real source has failed", () => {
      const { baseElement } = render(<AiReportModal open={true} onClose={jest.fn()} loading={false} analysis={baseAnalysis} />);

      let image = baseElement.querySelector('img[alt$="(TCS) logo"]');
      while (image) {
        fireEvent.error(image);
        image = baseElement.querySelector('img[alt$="(TCS) logo"]');
      }

      expect(screen.getAllByText("TCS").length).toBeGreaterThan(0);
    });
  });

  it("closes when the close button is clicked", () => {
    const onClose = jest.fn();
    render(<AiReportModal open={true} onClose={onClose} loading={false} analysis={baseAnalysis} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<AiReportModal open={false} onClose={jest.fn()} loading={false} analysis={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
