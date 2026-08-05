import { render, screen, within } from "@testing-library/react";
import {
  MarketIndices,
  formatChangePercent,
  formatLevel,
  formatPoints,
  rangePosition,
  type IndexQuote,
} from "../../app/components/market-indices";

function indexQuote(overrides: Partial<IndexQuote> = {}): IndexQuote {
  return {
    symbol: "NIFTY50",
    name: "NIFTY 50",
    exchange: "NSE",
    description: "50 large caps across sectors",
    price: 24624.65,
    previousClose: 24614.9,
    change: 9.75,
    changePercent: 0.0396,
    dayHigh: 24677.6,
    dayLow: 24497.95,
    live: true,
    asOf: "2026-08-05T10:01:16.000Z",
    ...overrides,
  };
}

describe("formatLevel", () => {
  // An index level is a point value, not a price — a ₹ sign here would be flatly wrong.
  it("groups digits in the Indian style with two decimals and no currency sign", () => {
    expect(formatLevel(24624.65)).toBe("24,624.65");
    expect(formatLevel(78581)).toBe("78,581.00");
  });

  it.each([[null], [Number.NaN], [Number.POSITIVE_INFINITY]])("renders %s as an em dash", (value) => {
    expect(formatLevel(value as number | null)).toBe("—");
  });
});

describe("formatPoints", () => {
  // Always signed: a flat tape must read "+0.00", never a bare absolute that hides direction.
  it("always carries a sign", () => {
    expect(formatPoints(152.05)).toBe("+152.05");
    expect(formatPoints(-167.25)).toBe("-167.25");
    expect(formatPoints(0)).toBe("+0.00");
  });

  it("renders a missing move as an em dash", () => {
    expect(formatPoints(null)).toBe("—");
    expect(formatPoints(Number.NaN)).toBe("—");
  });
});

describe("formatChangePercent", () => {
  it("always carries a sign and two decimals", () => {
    expect(formatChangePercent(0.0396)).toBe("+0.04%");
    expect(formatChangePercent(-0.29)).toBe("-0.29%");
  });

  it("renders a missing percentage as an em dash", () => {
    expect(formatChangePercent(null)).toBe("—");
    expect(formatChangePercent(Number.NaN)).toBe("—");
  });
});

describe("rangePosition", () => {
  it("maps the level onto its position between the day's low and high", () => {
    expect(rangePosition(50, 0, 100)).toBe(50);
    expect(rangePosition(25, 0, 100)).toBe(25);
  });

  // Yahoo's last trade occasionally lands a hair outside the high/low it reports in the same
  // payload, which would push the marker off the end of the track.
  it("clamps a level that sits outside the reported range", () => {
    expect(rangePosition(120, 0, 100)).toBe(100);
    expect(rangePosition(-5, 0, 100)).toBe(0);
  });

  it("returns null when any leg of the range is missing", () => {
    expect(rangePosition(null, 0, 100)).toBeNull();
    expect(rangePosition(50, null, 100)).toBeNull();
    expect(rangePosition(50, 0, null)).toBeNull();
  });

  // Moments after the open the high and low are still the same tick; there is no range to draw.
  it("returns null when the high has not separated from the low", () => {
    expect(rangePosition(50, 50, 50)).toBeNull();
  });
});

describe("MarketIndices", () => {
  it("renders each benchmark with its level, points move, percentage move and day metrics", () => {
    render(<MarketIndices indices={[indexQuote()]} live />);

    const card = screen.getByLabelText("NIFTY 50, 24,624.65, +0.04%");
    expect(within(card).getByText("NIFTY 50")).toBeInTheDocument();
    expect(within(card).getByText("NSE")).toBeInTheDocument();
    expect(within(card).getByText("50 large caps across sectors")).toBeInTheDocument();
    expect(within(card).getByText("24,624.65")).toBeInTheDocument();
    expect(within(card).getByText("+0.04%")).toBeInTheDocument();
    expect(within(card).getByText("24,614.90")).toBeInTheDocument();
    expect(within(card).getByText("24,677.60")).toBeInTheDocument();
    expect(within(card).getByText("24,497.95")).toBeInTheDocument();
    expect(within(card).getByText("+9.75")).toBeInTheDocument();

    expect(screen.getByText("Benchmark indices")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Position in today's range")).toBeInTheDocument();
  });

  it("renders all three benchmarks together", () => {
    render(
      <MarketIndices
        live
        indices={[
          indexQuote(),
          indexQuote({ symbol: "SENSEX", name: "SENSEX", exchange: "BSE", price: 78581, change: 152.05, changePercent: 0.19 }),
          indexQuote({ symbol: "BANKNIFTY", name: "Bank NIFTY", price: 57739.95, change: -167.25, changePercent: -0.29 }),
        ]}
      />,
    );

    expect(screen.getByText("NIFTY 50")).toBeInTheDocument();
    expect(screen.getByText("SENSEX")).toBeInTheDocument();
    expect(screen.getByText("Bank NIFTY")).toBeInTheDocument();
    // A falling index is styled and marked separately from a rising one.
    expect(screen.getByText("-0.29%")).toBeInTheDocument();
    expect(screen.getByText("-167.25")).toBeInTheDocument();
  });

  it("hides the live marker while the market is shut", () => {
    render(<MarketIndices indices={[indexQuote()]} live={false} />);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.getByText("24,624.65")).toBeInTheDocument();
  });

  // A feed that came back empty must not render a card claiming a level it does not have.
  it("renders em dashes rather than zeros when the feed returned nothing", () => {
    render(
      <MarketIndices
        live
        indices={[indexQuote({ price: null, previousClose: null, change: null, changePercent: null, dayHigh: null, dayLow: null })]}
      />,
    );

    expect(screen.getByLabelText("NIFTY 50, —, —")).toBeInTheDocument();
    // Level, points move, percentage move, prev close, day low and day high.
    expect(screen.getAllByText("—")).toHaveLength(6);
    expect(screen.queryByText("Position in today's range")).not.toBeInTheDocument();
  });

  it("drops the whole block when the payload carries no indices", () => {
    const { container: missing } = render(<MarketIndices indices={undefined} live />);
    expect(missing).toBeEmptyDOMElement();

    const { container: empty } = render(<MarketIndices indices={[]} live />);
    expect(empty).toBeEmptyDOMElement();
  });
});
