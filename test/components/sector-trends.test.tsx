import { render, screen, within } from "@testing-library/react";
import {
  SectorTrends,
  barWidth,
  breadthShare,
  formatLevel,
  sectorBrief,
  type SectorTrend,
} from "../../app/components/sector-trends";

function sector(overrides: Partial<SectorTrend> = {}): SectorTrend {
  return {
    symbol: "NIFTY METAL",
    name: "NIFTY METAL",
    last: 13256.35,
    change: 224.05,
    changePercent: 1.72,
    advances: 13,
    declines: 1,
    unchanged: 1,
    peRatio: 16.86,
    changePercent30d: 5.22,
    changePercent365d: 41.99,
    yearHigh: 13931.35,
    yearLow: 9127.25,
    ...overrides,
  };
}

const laggard = sector({
  symbol: "NIFTY MEDIA",
  name: "NIFTY MEDIA",
  last: 1500.2,
  change: -24.1,
  changePercent: -1.58,
  advances: 3,
  declines: 7,
  changePercent30d: -2.4,
  changePercent365d: -12.5,
});

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("formatLevel", () => {
  it("renders an index level without a rupee sign", () => {
    expect(formatLevel(13256.35)).toBe("13,256.35");
  });

  it("renders a missing level as an em dash", () => {
    expect(formatLevel(null)).toBe("—");
    expect(formatLevel(Number.NaN)).toBe("—");
  });
});

describe("barWidth", () => {
  it("scales a move against the strongest move on the board", () => {
    expect(barWidth(1.72, 1.72)).toBe(100);
    expect(barWidth(-0.86, 1.72)).toBe(50);
  });

  it("returns zero when there is nothing to scale against", () => {
    expect(barWidth(1, 0)).toBe(0);
    expect(barWidth(null, 2)).toBe(0);
    expect(barWidth(Number.NaN, 2)).toBe(0);
  });

  it("clamps a move larger than the reference", () => {
    expect(barWidth(5, 2)).toBe(100);
  });
});

describe("breadthShare", () => {
  it("returns the advancing share of decisive stocks", () => {
    expect(breadthShare(13, 7)).toBe(65);
  });

  it("returns null when breadth is unknown or nothing moved", () => {
    expect(breadthShare(null, 7)).toBeNull();
    expect(breadthShare(13, null)).toBeNull();
    expect(breadthShare(0, 0)).toBeNull();
  });
});

/**
 * The leading sector's name appears twice — once in the highlight card, once in the list — so
 * tests reach for the list row explicitly rather than assuming a single match.
 */
async function findRow(name: string) {
  const matches = await screen.findAllByText(name);
  return matches.map((element) => element.closest("li")).find((row): row is HTMLLIElement => row !== null)!;
}

describe("SectorTrends", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<SectorTrends />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("renders every sector with its level, move, breadth and longer-run performance", async () => {
    mockFeed({ sectors: [sector(), laggard], live: true });
    render(<SectorTrends />);

    const row = await findRow("NIFTY METAL");
    expect(within(row).getByText("13,256.35")).toBeInTheDocument();
    expect(within(row).getByText("+1.72%")).toBeInTheDocument();
    expect(within(row).getByText("224.05 pts")).toBeInTheDocument();
    expect(within(row).getByText("13")).toBeInTheDocument();
    expect(within(row).getByText("+5.22%")).toBeInTheDocument();
    expect(within(row).getByText("+41.99%")).toBeInTheDocument();
    expect(within(row).getByText(/93%/)).toBeInTheDocument();

    expect(screen.getByText("2 sectoral indices")).toBeInTheDocument();
  });

  // The board is pre-sorted strongest to weakest, so the ends are the leader and the laggard.
  it("highlights the leading and lagging sectors", async () => {
    mockFeed({ sectors: [sector(), laggard], live: true });
    render(<SectorTrends />);

    const leaderCard = (await screen.findByText("Leading sector")).closest("div")!;
    expect(within(leaderCard).getByText("NIFTY METAL")).toBeInTheDocument();
    expect(within(leaderCard).getByText("+1.72%")).toBeInTheDocument();

    const laggardCard = screen.getByText("Lagging sector").closest("div")!;
    expect(within(laggardCard).getByText("NIFTY MEDIA")).toBeInTheDocument();
    expect(within(laggardCard).getByText("-1.58%")).toBeInTheDocument();
  });

  it("omits the breadth line when the index publishes no advance/decline split", async () => {
    mockFeed({ sectors: [sector({ advances: null, declines: null })], live: true });
    render(<SectorTrends />);

    const row = await findRow("NIFTY METAL");
    expect(within(row).queryByText(/of the index's stocks are advancing/)).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("handles a sector with no reported move at all", async () => {
    mockFeed({ sectors: [sector({ changePercent: null, change: null })], live: true });
    render(<SectorTrends />);

    const row = await findRow("NIFTY METAL");
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the empty state when NSE has published nothing yet", async () => {
    mockFeed({ sectors: [], live: false });
    render(<SectorTrends />);
    expect(await screen.findByText(/hasn't published sectoral index levels yet/)).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<SectorTrends />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });
});

describe("sectorBrief", () => {
  const rows = [
    sector({ symbol: "NIFTY IT", name: "NIFTY IT", changePercent: 2.4, changePercent30d: 5.1, changePercent365d: 12 }),
    sector({ symbol: "NIFTY FMCG", name: "NIFTY FMCG", changePercent: 0.2 }),
    sector({ symbol: "NIFTY PSU BANK", name: "NIFTY PSU BANK", changePercent: -1.6 }),
  ];

  it("counts how broad the rotation was and names both ends of it", () => {
    const brief = sectorBrief(rows)!;

    expect(brief.facts).toContainEqual({ label: "Sectors advancing", value: "2 of 3" });
    expect(brief.facts).toContainEqual({ label: "Leading sector", value: "NIFTY IT +2.40%" });
    expect(brief.facts).toContainEqual({ label: "Lagging sector", value: "NIFTY PSU BANK -1.60%" });
    expect(brief.facts).toContainEqual({ label: "Spread, best to worst", value: "4.00 pts" });
  });

  it("carries each leading index with its month and year alongside", () => {
    expect(sectorBrief(rows)!.highlights[0]).toBe("NIFTY IT: +2.40% today, +5.10% over a month, +12.00% over a year");
  });

  it("has nothing to read before NSE publishes", () => {
    expect(sectorBrief([])).toBeNull();
  });
});
