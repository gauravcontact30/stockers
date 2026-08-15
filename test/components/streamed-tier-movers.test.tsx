import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  StreamedTierMovers,
  TierMoversFallback,
  TierMoversPayload,
} from "../../app/components/streamed-tier-movers";
import { buildMoversUrl } from "../../app/lib/market-urls";

jest.mock("../../app/lib/bse-market", () => ({
  getBseMovers: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked module, for arranging return values.
const bseMarket = require("../../app/lib/bse-market") as { getBseMovers: jest.Mock };

const row = (ticker: string, name: string, returnPercent: number) => ({
  code: "500325",
  ticker,
  name,
  group: "A",
  capTier: "Large",
  rank: 1,
  marketCapCr: 1_900_000,
  sector: "Energy",
  industry: "Refineries",
  price: 1432.5,
  change: 18.2,
  changePercent: 1.29,
  dayHigh: 1440,
  dayLow: 1410,
  volume: 4_200_000,
  turnoverCr: 601.2,
  returnPercent,
});

const page = (ticker: string, name: string, returnPercent: number) => ({
  rows: [row(ticker, name, returnPercent)],
  period: "1d",
  periodFrom: "2026-08-06",
  total: 1,
  page: 1,
  pages: 1,
  pageSize: 5,
  sessionDate: "2026-08-07",
});

const gainers = page("RELIANCE", "Reliance Industries", 4.2);
const losers = page("ITC", "ITC Limited", -3.1);

beforeEach(() => {
  bseMarket.getBseMovers.mockImplementation(({ direction }: { direction: string }) =>
    Promise.resolve(direction === "gainers" ? gainers : losers),
  );
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("TierMoversFallback", () => {
  it("holds both cards' chrome so the streamed-in board doesn't shift the page", () => {
    const { container } = render(<TierMoversFallback />);

    // One heading bar plus five skeleton rows, per card, for two cards.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(12);
  });
});

describe("TierMoversPayload", () => {
  /**
   * The board opens on the large-cap tier and shows both sides at once, so this section needs two
   * payloads rather than one. They are asked for together — a section that awaited them in turn
   * would be as slow as the sum of both feeds rather than the slower of the two.
   */
  it("asks for both sides of the opening tier, at the size the cards render", async () => {
    await TierMoversPayload();

    expect(bseMarket.getBseMovers).toHaveBeenCalledTimes(2);
    for (const direction of ["gainers", "losers"]) {
      expect(bseMarket.getBseMovers).toHaveBeenCalledWith({
        tier: "large",
        direction,
        period: "1d",
        page: 1,
        pageSize: 5,
      });
    }
  });

  /**
   * The payload is spent only when it answers the URL the client builds on its first render, so
   * this pairing is the whole contract between the two halves. A mismatch would cost the section
   * its prefetch silently rather than fail loudly.
   */
  it("labels each side with the URL that card asks for on its first render", async () => {
    const element = await TierMoversPayload();

    expect(element.props.prefetched.gainers.url).toBe(buildMoversUrl("large", "gainers", "1d", "", "0", 1, 5));
    expect(element.props.prefetched.losers.url).toBe(buildMoversUrl("large", "losers", "1d", "", "0", 1, 5));
    expect(element.props.prefetched.gainers.data).toBe(gainers);
    expect(element.props.prefetched.losers.data).toBe(losers);
  });

  it("renders both sides out of the server's payload, without fetching", async () => {
    render(await TierMoversPayload());

    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();
    expect(await screen.findByText("ITC")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the streamed boundary", () => {
  it("puts the tier board behind its own boundary, with the cards' chrome as the fallback", () => {
    const element = StreamedTierMovers();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(TierMoversPayload);

    const { container } = render(element.props.fallback);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(12);
  });
});
