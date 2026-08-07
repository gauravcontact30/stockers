import { render, screen, within } from "@testing-library/react";
import {
  CompareScene,
  DIP_PICKS,
  LILAC,
  MINT,
  SAND,
  SKY,
  DipBuysScene,
  MARKET_THEMES,
  PIPELINE,
  REPORT_CARDS,
  TickerTape,
  TopGainersScene,
  TripleReportScene,
  bandPosition,
  signed,
  strongestMove,
  leaderSymbol,
  tallyCompare,
  themeAverage,
  verdictStyle,
  type CompareMetric,
} from "../../app/components/hero-scenes";

describe("signed", () => {
  it("always carries the sign, so a gain never reads as a bare number", () => {
    expect(signed(2.5)).toBe("+2.50%");
    expect(signed(-2.5)).toBe("−2.50%");
    expect(signed(0)).toBe("+0.00%");
  });

  it("honours the requested precision", () => {
    expect(signed(31.24, 1)).toBe("+31.2%");
  });
});

describe("the palettes", () => {
  // The point of four palettes is that no two slides look alike.
  it("gives each slide its own light background, card and tape", () => {
    const palettes = [MINT, SKY, LILAC, SAND];
    expect(new Set(palettes.map((palette) => palette.key)).size).toBe(4);
    expect(new Set(palettes.map((palette) => palette.bg)).size).toBe(4);
    expect(new Set(palettes.map((palette) => palette.tape)).size).toBe(4);
  });

  it("keeps every palette light", () => {
    for (const palette of [MINT, SKY, LILAC, SAND]) {
      expect(palette.bg).toContain("-50");
      expect(palette.title).toBe("text-slate-900");
    }
  });
});

describe("TickerTape", () => {
  // The row is duplicated so the marquee can loop without a visible seam.
  it("renders every ticker twice", () => {
    render(<TickerTape palette={MINT} />);
    expect(screen.getAllByText("S&P BSE SENSEX ▲ 0.98%")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scene 1 — top performers by theme
// ---------------------------------------------------------------------------

describe("strongestMove", () => {
  it("finds the single strongest move across every theme", () => {
    expect(strongestMove(MARKET_THEMES)).toBe(7.35);
  });

  // Bars are drawn as a share of this, so an empty board must not hand back a divisor of NaN.
  it("returns zero when there is nothing to rank", () => {
    expect(strongestMove([])).toBe(0);
  });
});

describe("themeAverage", () => {
  it("averages a theme's three movers", () => {
    expect(themeAverage(MARKET_THEMES[1])).toBeCloseTo((4.26 + 2.91 + 2.14) / 3);
  });
});

describe("TopGainersScene", () => {
  it("shows all three themes, each with its three strongest scrips", () => {
    render(<TopGainersScene />);

    expect(screen.getByText("Data centres")).toBeInTheDocument();
    expect(screen.getByText("Banking")).toBeInTheDocument();
    expect(screen.getByText("Development & infra")).toBeInTheDocument();

    for (const theme of MARKET_THEMES) {
      expect(theme.stocks).toHaveLength(3);
      for (const stock of theme.stocks) {
        expect(screen.getByText(stock.symbol)).toBeInTheDocument();
      }
    }
  });

  it("ranks each theme 1-3 and prints the average alongside the leader", () => {
    render(<TopGainersScene />);

    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.getByText("+7.35%")).toBeInTheDocument();
    expect(screen.getByText("avg +4.87%")).toBeInTheDocument();
  });

  // Real companies with illustrative figures have to say which is which.
  it("says the figures are an illustration and the codes are not", () => {
    render(<TopGainersScene />);
    expect(screen.getByText(/Companies and BSE scrip codes are real/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scene 2 — two stocks compared
// ---------------------------------------------------------------------------

describe("tallyCompare", () => {
  const rows = (winners: CompareMetric["winner"][]): CompareMetric[] =>
    winners.map((winner, i) => ({ label: `m${i}`, plain: `what m${i} measures`, left: "1", right: "2", winner }));

  it("counts the rows each side won", () => {
    expect(tallyCompare(rows(["left", "left", "right"]))).toEqual({ left: 2, right: 1, leader: "left" });
  });

  it("names the right-hand stock when it wins more rows", () => {
    expect(tallyCompare(rows(["left", "right", "right"])).leader).toBe("right");
  });

  // A tie goes to the left-hand side rather than flickering: the reader picked that one first.
  it("settles a tie on the left-hand stock", () => {
    expect(tallyCompare(rows(["left", "right"])).leader).toBe("left");
  });
});

describe("CompareScene", () => {
  it("puts both stocks head to head on the same five measures", () => {
    render(<CompareScene />);

    expect(screen.getByText("HDFCBANK")).toBeInTheDocument();
    expect(screen.getByText("ICICIBANK")).toBeInTheDocument();
    // Each row names what it measures in words, not in desk shorthand.
    for (const label of [
      "Return over 1 month",
      "Return over 6 months",
      "Return over 1 year",
      "Price vs earnings",
      "Shares actually delivered",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Five things we measured")).toBeInTheDocument();
    expect(screen.getByText("4 – 1")).toBeInTheDocument();
    expect(screen.getByText("HDFCBANK wins more of them")).toBeInTheDocument();
  });

  it("badges the side the measured rows favour", () => {
    render(<CompareScene />);
    expect(screen.getByText("Stronger")).toBeInTheDocument();
  });

  // The ladder shows the contest being decided row by row, not just the total.
  it("points each rung at whichever side that measure favours", () => {
    render(<CompareScene />);
    expect(screen.getAllByLabelText("favours left")).toHaveLength(4);
    expect(screen.getAllByLabelText("favours right")).toHaveLength(1);
  });

  // A ratio nobody has explained is not information; every row says what it means.
  it("explains each measure in plain words", () => {
    render(<CompareScene />);
    expect(screen.getByText(/How many years of profit the price costs/)).toBeInTheDocument();
    expect(screen.getByText(/real buying, not intraday churn/)).toBeInTheDocument();
  });

  it("states a verdict and the key points for each side", () => {
    render(<CompareScene />);

    expect(screen.getByText("Buy")).toBeInTheDocument();
    expect(screen.getByText("Hold")).toBeInTheDocument();
    // Pros and cons live in their own boxes rather than one mixed list.
    expect(screen.getAllByText("For")).toHaveLength(2);
    expect(screen.getAllByText("Against")).toHaveLength(2);
    expect(screen.getByText("Best one-year return of the pair")).toBeInTheDocument();
    expect(screen.getByText("Trails over six months and a year")).toBeInTheDocument();
  });

  // The point of the panel is that the model is not the one choosing.
  it("says the rows decide the winner, not the model", () => {
    render(<CompareScene />);
    expect(screen.getByText(/The five rows decide the winner; the AI only writes up what they say/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scene 3 — the three-stock report
// ---------------------------------------------------------------------------

describe("verdictStyle", () => {
  it("gives buy, hold and sell three distinct palettes", () => {
    const palettes = (["Buy", "Hold", "Sell"] as const).map((verdict) => verdictStyle(verdict).ring);
    expect(new Set(palettes).size).toBe(3);
  });

  it("colours a buy green, a hold amber and a sell red", () => {
    expect(verdictStyle("Buy").badge).toContain("emerald");
    expect(verdictStyle("Hold").badge).toContain("amber");
    expect(verdictStyle("Sell").badge).toContain("rose");
  });
});

describe("TripleReportScene", () => {
  it("reports one of each stance, so the scoring is visibly capable of saying sell", () => {
    render(<TripleReportScene />);

    expect(REPORT_CARDS.map((card) => card.verdict).sort()).toEqual(["Buy", "Hold", "Sell"]);
    expect(screen.getByText("Buy")).toBeInTheDocument();
    expect(screen.getByText("Hold")).toBeInTheDocument();
    expect(screen.getByText("Sell")).toBeInTheDocument();
  });

  it("shows each stock, its score and the three return windows behind it", () => {
    render(<TripleReportScene />);

    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getAllByText("1M")).toHaveLength(3);
    // A negative window renders signed and in the losing colour.
    expect(screen.getByText("−11.6%")).toBeInTheDocument();
    expect(screen.getByText("+19.2%")).toBeInTheDocument();
  });

  it("gives a reason for each stance rather than a bare label", () => {
    render(<TripleReportScene />);
    for (const card of REPORT_CARDS) {
      expect(screen.getByText(card.because)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Scene 4 — how it works, and what is cheap today
// ---------------------------------------------------------------------------

describe("bandPosition", () => {
  it("reads a pullback as how much of the 52-week high is left in the price", () => {
    expect(bandPosition(15.8)).toBeCloseTo(84.2);
    expect(bandPosition(0)).toBe(100);
  });

  // A bar can never run past its track, however the figures arrive.
  it("clamps to the track at both ends", () => {
    expect(bandPosition(140)).toBe(0);
    expect(bandPosition(-10)).toBe(100);
  });
});

describe("DipBuysScene", () => {
  it("spells out the four steps of the analysis, in order", () => {
    render(<DipBuysScene />);

    expect(PIPELINE).toHaveLength(4);
    for (const stage of PIPELINE) {
      expect(screen.getByText(stage.step)).toBeInTheDocument();
    }
    expect(screen.getByText(/Arithmetic picks buy, hold or sell/)).toBeInTheDocument();
  });

  it("lists three picks with both halves of the case: the year behind them and the discount now", () => {
    render(<DipBuysScene />);

    expect(DIP_PICKS).toHaveLength(3);
    expect(screen.getByText("BAJFINANCE")).toBeInTheDocument();
    expect(screen.getByText("+31.2% over a year")).toBeInTheDocument();
    expect(screen.getByText("−15.8% off its high")).toBeInTheDocument();
    // The ladder runs from today's price to the 52-week high.
    expect(screen.getByText("₹1,141.20")).toBeInTheDocument();
    expect(screen.getByText("₹1,355.40")).toBeInTheDocument();
  });

  it("tags each pick for today or tomorrow", () => {
    render(<DipBuysScene />);
    expect(screen.getAllByText("Buy Today")).toHaveLength(2);
    expect(screen.getByText("Buy Tomorrow")).toBeInTheDocument();
  });

  // Every pick must clear both bars, or the list is just "stocks that fell".
  it("only picks companies that are up on the year and below their high", () => {
    for (const pick of DIP_PICKS) {
      expect(pick.year).toBeGreaterThan(0);
      expect(pick.offHigh).toBeGreaterThan(0);
    }
  });

  it("says a pullback is not a discount on its own", () => {
    render(<DipBuysScene />);
    expect(screen.getByText(/A pullback is not a discount on its own/)).toBeInTheDocument();
  });
});

describe("every scene", () => {
  it("carries the same BSE index rail", () => {
    for (const Scene of [TopGainersScene, CompareScene, TripleReportScene, DipBuysScene]) {
      const { container, unmount } = render(<Scene />);
      expect(within(container).getByText("S&P BSE SENSEX")).toBeInTheDocument();
      expect(within(container).getByText("BSE BANKEX")).toBeInTheDocument();
      unmount();
    }
  });

  /**
   * Everything a scene draws sits inside one padded card, inset from a padded frame — so no
   * content can end up flush against the edge of the slide at any width.
   */
  it("keeps its content inside a padded card, inset from the frame", () => {
    for (const Scene of [TopGainersScene, CompareScene, TripleReportScene, DipBuysScene]) {
      const { container, unmount } = render(<Scene />);

      // Each slide sets its own inset — a roomy scene sits further in, a dense one closer to
      // the edge — but every one of them has some.
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toMatch(/(^| )p-\d/);

      const card = frame.querySelector(":scope > .rounded-3xl") as HTMLElement;
      expect(card).not.toBeNull();
      expect(card.className).toContain("p-3");
      // The rail, the heading, the body, the footnote and the tape all hang off the card.
      expect(within(card).getByText("BSE BANKEX")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("leaderSymbol", () => {
  // Both answers matter: whichever way the five measures fall, the card has to name the right one.
  it("names whichever contender took more of the measures", () => {
    expect(leaderSymbol({ left: 3, right: 2, leader: "left" })).toBe("HDFCBANK");
    expect(leaderSymbol({ left: 2, right: 3, leader: "right" })).toBe("ICICIBANK");
  });
});
