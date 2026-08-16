// The hero, behind its own Suspense boundary and its own deadline.
//
// The bug this covers is not a rendering one. The three reads the slider needs were awaited at the
// top of `Home`, so until all three came back the visitor got `app/loading.tsx` and nothing else —
// not the header, not the boards, not the footer. What is checked here is that neither half of the
// fix can be quietly undone: that the hero really is behind a boundary, and that a read which never
// answers is abandoned rather than waited on.

import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  HERO_DEADLINE_MS,
  HERO_PERFORMANCE_SYMBOLS,
  HeroFallback,
  HeroPayload,
  StreamedHero,
  withDeadline,
} from "../../app/components/streamed-hero";

jest.mock("../../app/lib/hero-trios", () => ({
  topYearGainerTrio: jest.fn(),
  investorFavouriteTrio: jest.fn(),
  // The fourth read the hero makes: the week's strongest large caps, which feed the rail and tape
  // that frame every slide. Added to `HeroPayload` after this mock was first written, and a mocked
  // module replaces the whole thing — so leaving it out made the real export unreachable and the
  // component threw "topWeeklyGainers is not a function" before any assertion could run.
  topWeeklyGainers: jest.fn(),
}));

jest.mock("../../app/lib/stock-performance", () => ({
  getCachedPerformanceSummaries: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked modules, for arranging return values.
const trios = require("../../app/lib/hero-trios") as {
  topYearGainerTrio: jest.Mock;
  investorFavouriteTrio: jest.Mock;
  topWeeklyGainers: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- as above.
const performance = require("../../app/lib/stock-performance") as {
  getCachedPerformanceSummaries: jest.Mock;
};

function trioOf(symbols: [string, string, string], sector: string) {
  return symbols.map((symbol) => ({
    symbol,
    company: `${symbol} Ltd`,
    blurb: `Why ${symbol} is on this board.`,
    accent: "border-emerald-300",
    wash: "bg-emerald-50/70",
    tier: "Large" as const,
    sector,
  }));
}

const GAINERS = trioOf(["STLTECH", "HFCL", "SKYGOLD"], "Telecom - Equipment");
const FAVOURITES = trioOf(["SUZLON", "IREDA", "YESBANK"], "Electric Utilities");

beforeEach(() => {
  performance.getCachedPerformanceSummaries.mockResolvedValue([]);
  trios.topYearGainerTrio.mockResolvedValue(GAINERS);
  trios.investorFavouriteTrio.mockResolvedValue(FAVOURITES);
  trios.topWeeklyGainers.mockResolvedValue([]);
  // The scenes fetch live figures on mount; left unstubbed they reject against jsdom and push a
  // state update through outside act(), which is noise rather than a finding.
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("withDeadline", () => {
  it("gives the real answer when it arrives in time", async () => {
    await expect(withDeadline(Promise.resolve("answer"), "fallback", 50)).resolves.toBe("answer");
  });

  it("gives the fallback when the read rejects", async () => {
    // A rejection must not propagate: these three run under one Promise.all, and a throw here would
    // take the whole hero down rather than costing one slide its companies.
    await expect(withDeadline(Promise.reject(new Error("feed down")), "fallback", 50)).resolves.toBe("fallback");
  });

  it("stops waiting on a read that never answers", async () => {
    jest.useFakeTimers();
    try {
      const settled = withDeadline(new Promise<string>(() => {}), "fallback", 4000);
      jest.advanceTimersByTime(4000);
      await expect(settled).resolves.toBe("fallback");
    } finally {
      jest.useRealTimers();
    }
  });

  it("waits four seconds unless told otherwise", async () => {
    expect(HERO_DEADLINE_MS).toBe(4000);

    jest.useFakeTimers();
    try {
      const settled = withDeadline(new Promise<string>(() => {}), "fallback");
      jest.advanceTimersByTime(HERO_DEADLINE_MS);
      await expect(settled).resolves.toBe("fallback");
    } finally {
      jest.useRealTimers();
    }
  });

  it("clears its timer once the read answers, so a resolved read leaves nothing pending", async () => {
    jest.useFakeTimers();
    try {
      const clear = jest.spyOn(global, "clearTimeout");
      await withDeadline(Promise.resolve("answer"), "fallback", 4000);
      expect(clear).toHaveBeenCalled();
      clear.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("HeroFallback", () => {
  /**
   * The fallback stands in the layout while the reads settle. If it were shorter than the carousel
   * the whole page below it would jump the moment the hero arrived, which is the thing a fallback
   * exists to prevent.
   */
  it("holds the carousel's frame at the carousel's heights", () => {
    const { container } = render(<HeroFallback />);
    const frame = container.querySelector("div")!;

    expect(frame.className).toContain("min-h-[1040px]");
    expect(frame.className).toContain("sm:min-h-[720px]");
    expect(frame.className).toContain("lg:min-h-[590px]");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});

describe("HeroPayload", () => {
  it("prefetches the six companies the two fixed slides name", async () => {
    render(await HeroPayload());

    expect(performance.getCachedPerformanceSummaries).toHaveBeenCalledWith(HERO_PERFORMANCE_SYMBOLS);
    expect(HERO_PERFORMANCE_SYMBOLS).toEqual(["HAL", "MAZDOCK", "PARAS", "NETWEB", "POWERINDIA", "LT"]);
  });

  it("hands both rankings to the carousel", async () => {
    const element = await HeroPayload();

    expect(element.props.yearGainers).toBe(GAINERS);
    expect(element.props.investorFavourites).toBe(FAVOURITES);
  });

  it("opens the slider on the data-centre slide", async () => {
    render(await HeroPayload());
    expect(screen.getByText("Compare three data-centre stocks by market performance")).toBeInTheDocument();
  });

  /**
   * One refusing feed costs its own slide and nothing else. Before this, a broker feed that hung
   * held the entire page — header, boards, pricing and footer — on `app/loading.tsx`.
   */
  it("still opens when a ranking cannot be built", async () => {
    trios.investorFavouriteTrio.mockRejectedValue(new Error("broker feed changed its HTML"));
    const element = await HeroPayload();

    expect(element.props.investorFavourites).toBeNull();
    expect(element.props.yearGainers).toBe(GAINERS);
  });

  it("still opens when the live figures cannot be read", async () => {
    performance.getCachedPerformanceSummaries.mockRejectedValue(new Error("quote feed down"));
    const element = await HeroPayload();

    expect(element.props.initialPerformance).toEqual([]);
  });
});

describe("StreamedHero", () => {
  it("puts the hero behind its own boundary, with the frame as the fallback", () => {
    const element = StreamedHero();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(HeroPayload);

    const { container } = render(element.props.fallback);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});
