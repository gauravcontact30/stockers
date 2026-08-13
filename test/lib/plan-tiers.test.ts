import { featuresForTier, featuresIntroducedAtTier } from "../../app/lib/plan-tiers";

describe("plan tier feature bundles", () => {
  it("keeps own-tier feature groups separate for admin grouping", () => {
    expect(featuresIntroducedAtTier("starter").map((feature) => feature.key)).toEqual([
      "market-pulse",
      "sectors",
      "dividends",
      "ipos",
      "etf-board",
      "news",
    ]);
    expect(featuresIntroducedAtTier("pro").map((feature) => feature.key)).toEqual([
      "top-picks",
      "buy-tomorrow",
      "dip-winners",
      "research",
      "compare",
      "portfolio",
    ]);
    expect(featuresIntroducedAtTier("elite").map((feature) => feature.key)).toEqual([
      "intel",
      "etf-research",
      "directory",
      "most-traded",
      "mtf",
      "stock-news",
    ]);
  });

  it("lists every AI feature a paid tier actually includes", () => {
    const starter = featuresForTier("starter").map((feature) => feature.key);
    const pro = featuresForTier("pro").map((feature) => feature.key);
    const elite = featuresForTier("elite").map((feature) => feature.key);

    expect(starter).toHaveLength(6);
    expect(pro).toEqual([...starter, "top-picks", "buy-tomorrow", "dip-winners", "research", "compare", "portfolio"]);
    expect(elite).toEqual([...pro, "intel", "etf-research", "directory", "most-traded", "mtf", "stock-news"]);
  });
});
