// The ribbon under the landing slider, which claims one thing: these are the stocks Indian
// investors are buying today, in order. So this suite is mostly about what it must never do —
// invent a row when the board is empty, and empty itself when a poll fails.

import { act, render, screen, waitFor } from "@testing-library/react";
import { MostBoughtRibbon } from "../../app/components/most-bought-ribbon";
import type { MostBoughtBoard, MostBoughtRow } from "../../app/lib/most-bought";

function row(overrides: Partial<MostBoughtRow> & Pick<MostBoughtRow, "buyRank" | "symbol" | "name">): MostBoughtRow {
  return {
    buyScore: 90 - overrides.buyRank,
    bseCode: `50000${overrides.buyRank}`,
    sector: "Auto",
    capTier: "Large",
    price: 1200,
    previousClose: 1180,
    change: 20,
    changePercent: 1.7,
    volume: 90_000,
    trades: 24_000,
    turnoverCr: 380,
    turnoverShare: 1.4,
    averageTradeValue: 15_000,
    brokerRank: 3,
    brokerNames: ["Groww"],
    signals: ["broker-list", "crowded-tape"],
    live: true,
    asOf: "2026-08-17T05:00:00.000Z",
    ...overrides,
  };
}

function board(rows: MostBoughtRow[], overrides: Partial<MostBoughtBoard> = {}): MostBoughtBoard {
  return {
    rows,
    sessionDate: "2026-08-17",
    marketSession: "live",
    liveSession: true,
    asOf: "2026-08-17T05:00:00.000Z",
    ...overrides,
  };
}

const OPENING = board([
  row({ buyRank: 1, symbol: "BOSCHLTD", name: "Bosch Ltd" }),
  row({
    buyRank: 2,
    symbol: "IDEA",
    name: "Vodafone Idea Communications Enterprises Limited",
    brokerRank: null,
    brokerNames: [],
    trades: 51_000,
    live: false,
    changePercent: 0.4,
  }),
]);

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("MostBoughtRibbon", () => {
  it("shows the server's opening board with its buying ranks", () => {
    render(<MostBoughtRibbon initial={OPENING} />);

    expect(screen.getByText("Most bought today")).toBeInTheDocument();
    expect(screen.getAllByText("#1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bosch").length).toBeGreaterThan(0);
    // Rank, score and the broker placing are the three claims on the card.
    expect(screen.getAllByText("Buy score 89").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#3 on Groww").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
  });

  it("falls back to the trade count for a stock no broker lists, and truncates a long name", () => {
    render(<MostBoughtRibbon initial={OPENING} />);

    expect(screen.getAllByText("51,000 trades").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vodafone Idea Communi...").length).toBeGreaterThan(0);
  });

  it("holds its shape when the exchange gives it a row with holes in it", () => {
    const sparse = board([
      row({
        buyRank: 1,
        symbol: "NOTRADES",
        // A name that is nothing but the suffix leaves the ticker as the only thing to show.
        name: "Limited",
        trades: null,
        changePercent: null,
        brokerRank: null,
        brokerNames: [],
        live: false,
      }),
    ]);

    render(<MostBoughtRibbon initial={sparse} />);

    expect(screen.getAllByText("NOTRADES").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Trades -").length).toBeGreaterThan(0);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("says where the session stands rather than always claiming to be live", () => {
    render(<MostBoughtRibbon initial={board(OPENING.rows, { marketSession: "holiday", liveSession: false })} />);

    expect(screen.getByText("No BSE session today: the last completed session's buying ranks.")).toBeInTheDocument();
  });

  it("holds the space open, without inventing a row, when there is no board yet", () => {
    const { container } = render(<MostBoughtRibbon initial={board([])} />);

    // A reserved box rather than a collapsed one: rows arriving must not push the page down.
    expect(container.firstElementChild).toHaveClass("h-[136px]");
    expect(container.textContent).toBe("");
    expect(container.querySelector("img")).toBeNull();

    const missing = render(<MostBoughtRibbon />);
    expect(missing.container.textContent).toBe("");
  });

  it("re-ranks from the live board it polls for", async () => {
    const next = board([row({ buyRank: 1, symbol: "TATAMOTORS", name: "Tata Motors Ltd", changePercent: -0.5, trades: 40_000 })]);
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(next) })) as unknown as typeof fetch;

    render(<MostBoughtRibbon initial={OPENING} />);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(screen.getAllByText("Tata Motors").length).toBeGreaterThan(0));
    expect(screen.queryByText("Bosch")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/market/most-bought", { cache: "no-store" });
  });

  it("drops a poll that lands after the ribbon has gone", async () => {
    let settleOk: (value: unknown) => void = () => {};
    let settleFail: (reason: Error) => void = () => {};
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => { settleOk = resolve; }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { settleFail = reject; })) as unknown as typeof fetch;

    const first = render(<MostBoughtRibbon initial={OPENING} />);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    first.unmount();
    // Resolving after unmount must not push state into a component that no longer exists.
    await act(async () => {
      settleOk({ ok: true, json: () => Promise.resolve(board([row({ buyRank: 1, symbol: "LATE", name: "Late Ltd" })])) });
    });

    const second = render(<MostBoughtRibbon initial={OPENING} />);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    second.unmount();
    await act(async () => {
      settleFail(new Error("network"));
    });

    expect(screen.queryByText("Late")).not.toBeInTheDocument();
  });

  it("does not poll while the tab is in the background", async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(OPENING) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);

    render(<MostBoughtRibbon initial={OPENING} />);
    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Coming back to the tab refreshes at once rather than waiting out the interval.
    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it("keeps the last real board when a poll fails or comes back empty", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 503 })) as unknown as typeof fetch;

    render(<MostBoughtRibbon initial={OPENING} />);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getAllByText("Bosch").length).toBeGreaterThan(0);

    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(board([])) })) as unknown as typeof fetch;
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getAllByText("Bosch").length).toBeGreaterThan(0);
  });
});

/**
 * The calendar strip in the ribbon header.
 *
 * Every figure on this ribbon is quoted in IST, and the ribbon claims "today" — so it has to say
 * which day and second that is, and it has to be honest when the exchange is shut rather than
 * showing a live-looking board beside a Sunday date.
 */
describe("the IST clock strip", () => {
  // A fixed Tuesday inside the session: 18 Aug 2026, 11:30:45 IST.
  const TRADING_TUESDAY = new Date("2026-08-18T06:00:45.000Z");
  // A Saturday, when the BSE is shut for the weekend.
  const WEEKEND_SATURDAY = new Date("2026-08-15T06:00:45.000Z");

  // Fake timers are already installed for the whole file; these tests only pin the instant.
  function renderAtRest(at: Date, boardOverrides: Partial<MostBoughtBoard> = {}) {
    jest.setSystemTime(at);
    render(<MostBoughtRibbon initial={board([row({ buyRank: 1, symbol: "BOSCHLTD", name: "Bosch Ltd" })], boardOverrides)} />);
    // The clock renders a placeholder until it has subscribed and read a real timestamp. That
    // happens in an effect, so flushing effects is enough - advancing the timer would also move
    // the clock on, which is the next test's job rather than this one's.
    act(() => {
      jest.advanceTimersByTime(1);
    });
  }

  it("shows today's IST date and a seconds-resolution clock", () => {
    renderAtRest(TRADING_TUESDAY);

    expect(screen.getByText("Tuesday, 18 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("11:30:45 IST")).toBeInTheDocument();
    expect(screen.getByText("Open · live until 15:30 IST")).toBeInTheDocument();
  });

  it("ticks the clock forward once a second", () => {
    renderAtRest(TRADING_TUESDAY);
    expect(screen.getByText("11:30:45 IST")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.getByText("11:30:48 IST")).toBeInTheDocument();
  });

  it("names the weekend rather than implying the board is live", () => {
    renderAtRest(WEEKEND_SATURDAY, { marketSession: "closed", liveSession: false, sessionDate: "2026-08-14" });

    expect(screen.getByText("Saturday, 15 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText(/Weekend · BSE is shut on Saturday and Sunday/)).toBeInTheDocument();
    // And says which session the ranks actually came from, so "today" is not misread.
    expect(screen.getByText("Ranks from the 14 Aug 2026 session")).toBeInTheDocument();
  });

  it("reports an exchange holiday on the board's authority, not the date's", () => {
    // A perfectly ordinary Tuesday on which the exchange did not trade.
    renderAtRest(TRADING_TUESDAY, { marketSession: "holiday", liveSession: false, sessionDate: "2026-08-17" });

    expect(screen.getByText("Closed · exchange holiday")).toBeInTheDocument();
    expect(screen.getByText(/Exchange holiday · the BSE did not trade today/)).toBeInTheDocument();
    expect(screen.getByText("Ranks from the 17 Aug 2026 session")).toBeInTheDocument();
  });

  it("does not label a live session with a closure note or a past session date", () => {
    renderAtRest(TRADING_TUESDAY);

    expect(screen.queryByText(/Weekend ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Exchange holiday ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ranks from the/)).not.toBeInTheDocument();
  });
});
