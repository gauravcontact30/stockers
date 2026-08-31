// The hero, behind its own Suspense boundary and its own deadline.
//
// The bug this covers is not a rendering one. The reads the slider needs were awaited at the top of
// `Home`, so until they all came back the visitor got `app/loading.tsx` and nothing else — not the
// header, not the boards, not the footer. What is checked here is that neither half of the fix can
// be quietly undone: that the hero really is behind a boundary, and that a read which never answers
// is abandoned rather than waited on.
//
// The second thing it covers is newer. Every slide is a ranking now, so the companies to price are
// only known once the rankings are in — the prefetch is a second round over whatever they named,
// not a fixed list of six.

import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  HERO_DEADLINE_MS,
  HeroFallback,
  HeroPayload,
  StreamedHero,
  heroPerformanceSymbols,
  withDeadline,
} from "../../app/components/streamed-hero";
import type { DynamicTrio } from "../../app/lib/hero-trios";

jest.mock("../../app/lib/hero-trios", () => ({
  agriculturalTrio: jest.fn(),
  financialTrio: jest.fn(),
  threeMonthGainerTrio: jest.fn(),
  healthcareInvestorTrio: jest.fn(),
  // The strips that frame every slide read this one. A mocked module replaces the whole thing, so
  // leaving an export out makes the real one unreachable and the component throws before any
  // assertion can run.
  topWeeklyGainers: jest.fn(),
}));

jest.mock("../../app/lib/stock-performance", () => ({
  getCachedPerformanceSummaries: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked modules, for arranging return values.
const trios = require("../../app/lib/hero-trios") as {
  agriculturalTrio: jest.Mock;
  financialTrio: jest.Mock;
  threeMonthGainerTrio: jest.Mock;
  healthcareInvestorTrio: jest.Mock;
  topWeeklyGainers: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- as above.
const performance = require("../../app/lib/stock-performance") as {
  getCachedPerformanceSummaries: jest.Mock;
};

function trioOf(symbols: [string, string, string], sector: string): DynamicTrio {
  return symbols.map((symbol) => ({
    symbol,
    company: `${symbol} Ltd`,
    blurb: `Why ${symbol} is on this board.`,
    accent: "border-emerald-300",
    wash: "bg-emerald-50/70",
    tier: "Large" as const,
    sector,
  })) as unknown as DynamicTrio;
}

const AGRICULTURE = trioOf(["UPL", "PIIND", "SUMICHEM"], "Chemicals");
const FINANCIAL = trioOf(["HDFCBANK", "ICICIBANK", "SBIN"], "Financial Services");
const THREE_MONTH_GAINERS = trioOf(["STLTECH", "HFCL", "SKYGOLD"], "Telecom - Equipment");
const BUYING = trioOf(["RELIANCE", "ITC", "SBIN"], "Energy & Petrochemicals");

beforeEach(() => {
  performance.getCachedPerformanceSummaries.mockResolvedValue([]);
  trios.agriculturalTrio.mockResolvedValue(AGRICULTURE);
  trios.financialTrio.mockResolvedValue(FINANCIAL);
  trios.threeMonthGainerTrio.mockResolvedValue(THREE_MONTH_GAINERS);
  trios.healthcareInvestorTrio.mockResolvedValue(BUYING);
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
    // A rejection must not propagate: these run under one Promise.all, and a throw here would take
    // the whole hero down rather than costing one slide its companies.
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

describe("heroPerformanceSymbols", () => {
  it("gathers every company the rankings named", () => {
    expect(heroPerformanceSymbols([AGRICULTURE, FINANCIAL])).toEqual([
      "UPL",
      "PIIND",
      "SUMICHEM",
      "HDFCBANK",
      "ICICIBANK",
      "SBIN",
    ]);
  });

  it("asks for a company topping two boards only once", () => {
    expect(heroPerformanceSymbols([AGRICULTURE, AGRICULTURE])).toEqual(["UPL", "PIIND", "SUMICHEM"]);
  });

  it("skips a ranking that could not be built", () => {
    expect(heroPerformanceSymbols([null, THREE_MONTH_GAINERS, null])).toEqual(["STLTECH", "HFCL", "SKYGOLD"]);
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

    expect(frame.className).toContain("min-h-[850px]");
    expect(frame.className).toContain("sm:min-h-[590px]");
    expect(frame.className).toContain("lg:min-h-[470px]");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});

describe("HeroPayload", () => {
  it("prefetches the companies the four rankings named, and only those", async () => {
    render(await HeroPayload());

    expect(performance.getCachedPerformanceSummaries).toHaveBeenCalledWith([
      "UPL",
      "PIIND",
      "SUMICHEM",
      "HDFCBANK",
      "ICICIBANK",
      "SBIN",
      "STLTECH",
      "HFCL",
      "SKYGOLD",
      "RELIANCE",
      "ITC",
    ]);
  });

  it("hands all four rankings to the carousel", async () => {
    const element = await HeroPayload();

    expect(element.props.agriculture).toBe(AGRICULTURE);
    expect(element.props.financial).toBe(FINANCIAL);
    expect(element.props.threeMonthGainers).toBe(THREE_MONTH_GAINERS);
    expect(element.props.healthcareInvesting).toBe(BUYING);
  });

  it("opens the slider on the agriculture slide", async () => {
    render(await HeroPayload());
    expect(screen.getByText("Top 3 agricultural stocks")).toBeInTheDocument();
  });

  /**
   * One refusing feed costs its own slide and nothing else. Before this, a feed that hung held the
   * entire page — header, boards, pricing and footer — on `app/loading.tsx`.
   */
  it("still opens when a ranking cannot be built", async () => {
    trios.healthcareInvestorTrio.mockRejectedValue(new Error("the broker list refused"));
    const element = await HeroPayload();

    expect(element.props.healthcareInvesting).toBeNull();
    expect(element.props.agriculture).toBe(AGRICULTURE);
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
