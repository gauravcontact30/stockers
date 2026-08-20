import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  BoardFallback,
  EMPTY_SECTOR_BOARD,
  MoversBoard,
  SECTOR_PREFETCH_DEADLINE_MS,
  SectorBoard,
  StreamedMoversBoard,
  StreamedSectorMovers,
  withBoardDeadline,
} from "../../app/components/streamed-boards";
// The page size is asserted through the constant rather than as a literal: the whole point of it
// living in one module is that the server prefetch and the client board cannot disagree, and a
// hard-coded 10 here would have to be found and changed by hand every time that number moves.
import { MOVERS_PAGE_SIZE, buildMoversUrl } from "../../app/lib/market-urls";

jest.mock("../../app/lib/bse-market", () => ({
  getBseMovers: jest.fn(),
  getBseSectorBoard: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked module, for arranging return values.
const bseMarket = require("../../app/lib/bse-market") as {
  getBseMovers: jest.Mock;
  getBseSectorBoard: jest.Mock;
};

const moverPage = {
  rows: [
    {
      code: "500325",
      ticker: "RELIANCE",
      name: "Reliance Industries",
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
      turnorCr: null,
      turnoverCr: 601.2,
      returnPercent: 412.6,
    },
  ],
  period: "1y",
  periodFrom: "2025-08-07",
  total: 1,
  page: 1,
  pages: 1,
  pageSize: MOVERS_PAGE_SIZE,
  sessionDate: "2026-08-07",
};

const sectorBoard = {
  sectors: [{ sector: "Energy", stocks: 42, gainers: 30, losers: 12, star: 4, red: 1, house: false }],
  unclassified: 0,
  classification: { done: 4900, total: 4900, ready: true },
  sessionDate: "2026-08-07",
};

beforeEach(() => {
  bseMarket.getBseMovers.mockResolvedValue(moverPage);
  bseMarket.getBseSectorBoard.mockResolvedValue(sectorBoard);
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("BoardFallback", () => {
  it("holds the board's chrome so the streamed-in board doesn't shift the page", () => {
    const { container } = render(<BoardFallback rows={3} height="h-16" />);

    expect(container.querySelector("section")).toBeInTheDocument();
    // Two header bars plus one per skeleton row.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});

describe("MoversBoard", () => {
  it("asks the data layer for the page the board opens on", async () => {
    render(await MoversBoard());

    expect(bseMarket.getBseMovers).toHaveBeenCalledWith({
      tier: "all",
      direction: "gainers",
      period: "1y",
      page: 1,
      pageSize: MOVERS_PAGE_SIZE,
    });
  });

  /**
   * The payload is only used when it answers the URL the client builds on its first render, so
   * this pairing is the whole contract between the two halves. If the server prefetched a
   * different page, the board would quietly fetch again and the prefetch would buy nothing.
   */
  it("labels the payload with the URL the client asks for on its first render", async () => {
    const element = await MoversBoard();

    expect(element.props.prefetched.url).toBe(buildMoversUrl("all", "gainers", "1y", "", "0", 1));
    expect(element.props.prefetched.data).toBe(moverPage);
  });

  it("renders the rows straight out of the server's payload, without fetching", async () => {
    render(await MoversBoard());

    expect(await screen.findByText("RELIANCE")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("SectorBoard", () => {
  it("hands the sector board over under the URL the client would have asked for", async () => {
    const element = await SectorBoard();

    expect(element.props.prefetched).toEqual({ url: "/api/market/bse/sectors", data: sectorBoard });
    expect(element.props.refreshNow).toBe(false);
  });

  /**
   * The category list is what the server prefetched, so it costs no request. Opening a category
   * still does: those are two more paged endpoints, and prefetching every category's gainers and
   * losers would be forty requests for a page nobody has scrolled to yet.
   */
  it("renders the categories without asking the sector endpoint again", async () => {
    render(await SectorBoard());

    expect(await screen.findAllByText(/Energy/)).not.toHaveLength(0);
    const asked = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(asked).not.toContain("/api/market/bse/sectors");
  });

  it("stops waiting on a cold sector classification and refreshes it in the browser", async () => {
    jest.useFakeTimers();
    try {
      bseMarket.getBseSectorBoard.mockReturnValue(new Promise(() => {}));

      const pending = SectorBoard();
      await Promise.resolve();
      jest.advanceTimersByTime(SECTOR_PREFETCH_DEADLINE_MS);
      const element = await pending;

      expect(element.props.prefetched).toEqual({ url: "/api/market/bse/sectors", data: EMPTY_SECTOR_BOARD });
      expect(element.props.refreshNow).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("withBoardDeadline", () => {
  it("uses the real board when it resolves in time", async () => {
    await expect(withBoardDeadline(Promise.resolve(sectorBoard), EMPTY_SECTOR_BOARD, 50)).resolves.toBe(sectorBoard);
  });

  it("uses the empty board when the prefetch rejects", async () => {
    await expect(withBoardDeadline(Promise.reject(new Error("BSE unavailable")), EMPTY_SECTOR_BOARD, 50)).resolves.toBe(
      EMPTY_SECTOR_BOARD,
    );
  });
});

// The point of the boundaries: the rest of the page is not held up by an exchange feed. Each board
// sits behind its own, with its own fallback, so a slow feed delays its board and nothing else.
describe("the streamed boundaries", () => {
  it("puts the movers board behind its own boundary, with the board's chrome as the fallback", () => {
    const element = StreamedMoversBoard();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(MoversBoard);

    const { container } = render(element.props.fallback);
    expect(container.querySelector("section")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(7);
  });

  it("puts the category board behind a boundary of its own", () => {
    const element = StreamedSectorMovers();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(SectorBoard);

    const { container } = render(element.props.fallback);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });
});
