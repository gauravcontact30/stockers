import { act, render, screen } from "@testing-library/react";
import { MarketPulse, topMovers } from "../../app/components/market-pulse";
import type { CapMovers } from "../../app/components/market-movers";
import type { CapTier } from "../../app/lib/indian-stocks";

// The live poller only runs while the exchange is open, so the session is pinned here rather than
// left at the mercy of when the suite happens to run — otherwise which branch each test exercises
// would depend on the wall clock.
let mockSessionOpen = true;

jest.mock("../../app/components/market-clock", () => ({
  marketSession: () => ({ open: mockSessionOpen, label: mockSessionOpen ? "Open" : "Closed" }),
  useClockTick: () => 1,
  MarketClock: () => <div data-testid="market-clock" />,
}));

const index = (price: number | null, symbol = "NIFTY50") => ({
  symbol,
  name: "NIFTY 50",
  exchange: "NSE",
  description: "50 large caps across sectors",
  price,
  previousClose: 24600,
  change: price === null ? null : price - 24600,
  changePercent: 0.1,
  dayHigh: 24700,
  dayLow: 24500,
  live: true,
  asOf: "2026-08-06T04:00:00.000Z",
});

const pulse = {
  breadth: {
    totalTracked: 200,
    advancing: 120,
    declining: 70,
    unchanged: 10,
    averageChangePercent: 1.25,
    topSector: { name: "IT", averageChangePercent: 2.1 },
    bottomSector: { name: "Realty", averageChangePercent: -1.4 },
    topGainer: { symbol: "AAA", name: "Alpha Co", changePercent: 8.5 },
    topLoser: { symbol: "BBB", name: "Beta Co", changePercent: -6.2 },
    movers: {
      Large: { tracked: 60, gainers: [], losers: [] },
      Mid: { tracked: 90, gainers: [], losers: [] },
      Small: { tracked: 50, gainers: [], losers: [] },
    },
  },
  indices: [index(24600)],
  mood: "Risk-On",
  summary: "Advancers in control.",
  themes: [],
  sectorsToWatch: [],
  generatedAt: "2026-08-06T04:00:00.000Z",
  source: "ai",
  lastTradeAt: "2026-08-06T04:00:00.000Z",
  breadthAsOf: "2026-08-06T04:00:00.000Z",
};

/** Answers the slow pulse feed once and the fast index feed from a queue of levels. */
function mockFeeds(levels: (number | null)[]) {
  let poll = 0;
  global.fetch = jest.fn((url: string) => {
    if (String(url) === "/api/market/live") {
      const price = levels[Math.min(poll++, levels.length - 1)];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ indices: [index(price)], asOf: "now" }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(pulse) });
  }) as unknown as typeof fetch;
}

/** Lets the mounted effects settle, then advances through `polls` further 500ms ticks. */
async function tick(polls = 0) {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  for (let poll = 0; poll < polls; poll++) {
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("MarketPulse while the market is open", () => {
  beforeEach(() => {
    mockSessionOpen = true;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("replaces the pulse payload's levels with the fast feed's, twice a second", async () => {
    mockFeeds([24650, 24680]);
    render(<MarketPulse />);
    await tick();

    // The first live poll has already superseded the level that arrived with the pulse; 24,600
    // survives only as the previous close, never as the headline level.
    const level = await screen.findByText("24,650.00");
    expect(level).toHaveAttribute("data-tick");
    expect(screen.getByText("24,600.00").tagName).toBe("DD");

    await tick(1);
    expect(screen.getByText("24,680.00")).toBeInTheDocument();
    expect(screen.getByText("24,680.00")).toHaveAttribute("data-tick", "up");
  });

  it("keeps a sparkline of the levels it has seen, ignoring repeats", async () => {
    mockFeeds([24650, 24650, 24700]);
    render(<MarketPulse />);
    await tick();

    // One level so far: nothing to join into a line.
    expect(screen.queryByText("Ticks seen since this page opened")).not.toBeInTheDocument();

    // The second poll repeats the level, so it is not recorded as a tick.
    await tick(1);
    expect(screen.queryByText("Ticks seen since this page opened")).not.toBeInTheDocument();

    await tick(1);
    expect(screen.getByText("Ticks seen since this page opened")).toBeInTheDocument();
  });

  it("skips a poll that carries no level at all", async () => {
    mockFeeds([null]);
    render(<MarketPulse />);
    await tick(1);

    // No level, so the whole card reads as dashes rather than a stale number.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ticks seen since this page opened")).not.toBeInTheDocument();
  });

  it("holds the last good levels when a poll fails", async () => {
    let poll = 0;
    global.fetch = jest.fn((url: string) => {
      if (String(url) === "/api/market/live") {
        poll += 1;
        if (poll === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ indices: [index(24650)], asOf: "now" }) });
        if (poll === 2) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(pulse) });
    }) as unknown as typeof fetch;

    render(<MarketPulse />);
    await tick(2);

    expect(screen.getByText("24,650.00")).toBeInTheDocument();
  });
});

describe("MarketPulse while the market is shut", () => {
  beforeEach(() => {
    mockSessionOpen = false;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("shows the levels that came with the pulse and never polls for more", async () => {
    mockFeeds([24650]);
    render(<MarketPulse />);
    await tick(4);

    // The payload's own level, not the live feed's — which was never asked for. It also appears
    // as the previous close, so the headline is picked out by its tick attribute.
    const [level] = screen.getAllByText("24,600.00").filter((node) => node.hasAttribute("data-tick"));
    expect(level).toHaveAttribute("data-tick", "flat");
    const polled = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(polled).not.toContain("/api/market/live");
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});

describe("topMovers", () => {
  const movers = {
    Large: {
      tracked: 1,
      gainers: [{ symbol: "BIGUP", name: "Big", sector: "Banking", capTier: "Large", price: 1, changePercent: 3 }],
      losers: [{ symbol: "BIGDOWN", name: "Big Down", sector: "Banking", capTier: "Large", price: 1, changePercent: -2 }],
    },
    Mid: {
      tracked: 1,
      gainers: [],
      losers: [{ symbol: "MIDDOWN", name: "Mid Down", sector: "Pharma", capTier: "Mid", price: 1, changePercent: -8 }],
    },
    Small: { tracked: 0, gainers: [], losers: [] },
  } as unknown as Record<CapTier, CapMovers>;

  it("ranks losers by the steepest fall, not by size", () => {
    expect(topMovers(movers, "losers", 2).map((row) => row.symbol)).toEqual(["MIDDOWN", "BIGDOWN"]);
  });

  it("caps the list at the requested count", () => {
    expect(topMovers(movers, "losers", 1).map((row) => row.symbol)).toEqual(["MIDDOWN"]);
  });
});
