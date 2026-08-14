// The live exchange scoreboard.
//
// Two claims to keep honest here, and they pull in opposite directions.
//
// The first is liveness. The card reads on mount, re-reads every second, and must never be able to
// sit on half-hour-old figures while presenting them as current — so a read that keeps failing has
// to show on the card rather than being swallowed, and a poll must be a real read rather than
// something the browser answers out of its own cache.
//
// The second is that nothing may be invented. The SENSEX strip is a genuine per-second print and
// moves with each one; the breadth and tier figures come from a settlement file that is published
// per session, so the only motion allowed on them is a transition between two *measured* values.
// And no poll at all while nobody is looking.

import { act, render, screen, within } from "@testing-library/react";
import { ExchangeTicker, agoLabel } from "../../app/components/exchange-ticker";

function breadth(advancing: number, declining: number, unchanged = 1) {
  return { advancing, declining, unchanged, traded: advancing + declining + unchanged };
}

function summary(advancing = 2100, declining = 1600) {
  return {
    listed: 4949,
    priced: 3800,
    totalMarketCapCr: 4_512_345,
    breadth: breadth(advancing, declining),
    byTier: {
      Large: { count: 100, breadth: breadth(60, 39), averageChangePercent: 0.82 },
      Mid: { count: 150, breadth: breadth(80, 69), averageChangePercent: -0.41 },
      Small: { count: 3550, breadth: breadth(1960, 1492), averageChangePercent: null },
    },
    sessionDate: "2026-08-14",
  };
}

/** One live SENSEX print, in the shape `/api/market/live` answers with. */
function sensex(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "SENSEX",
    name: "SENSEX",
    exchange: "BSE",
    description: "30 blue chips on the BSE",
    price: 82_450.25,
    previousClose: 82_100.1,
    change: 350.15,
    changePercent: 0.43,
    dayHigh: 82_600,
    dayLow: 82_000,
    live: true,
    asOf: "2026-08-14T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Answers both feeds by the URL asked for.
 *
 * The card reads two different things on two different endpoints, and a mock that answered one
 * shape to both would let a component that fetched the wrong one still pass.
 */
function serve(next = summary(2500, 1200), quote: Record<string, unknown> | null = sensex()) {
  const mock = jest.fn(async (url: string) =>
    String(url).includes("/api/market/live")
      ? ({ ok: true, json: async () => ({ indices: quote ? [quote] : [] }) }) as unknown as Response
      : ({ ok: true, json: async () => ({ summary: next }) }) as unknown as Response,
  );
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** The calls the mock received for one of the two endpoints. */
function callsTo(mock: jest.Mock, path: string): unknown[][] {
  return mock.mock.calls.filter((call) => String(call[0]).includes(path));
}

/**
 * Renders the card and lets its first read actually go out.
 *
 * The reads are kicked off a microtask after mount, and Jest's fake timers fake `queueMicrotask`
 * along with everything else — so without nudging the clock the mount read is still queued when the
 * assertions run.
 */
async function mountTicker(initial = summary()) {
  await act(async () => {
    render(<ExchangeTicker initial={initial} />);
  });
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  // Both reads are two awaits deep — the response, then its body — so the queue is drained once
  // more. Left in flight they land during RTL's unmount and surface as an AggregateError from
  // cleanup rather than as anything to do with the assertion.
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Advances whole seconds, settling the requests each one starts.
 *
 * One at a time on purpose: the card allows one outstanding request per feed, so jumping the clock
 * three seconds in a single step would find the first read still in flight and skip the other two —
 * which is the card behaving correctly and the test measuring nothing.
 */
async function tickSeconds(count: number) {
  for (let second = 0; second < count; second++) {
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/**
 * The same, awaited.
 *
 * Becoming visible fires an immediate read, and that promise has to be allowed to settle inside
 * `act` — left in flight, it lands during RTL's unmount and surfaces as an AggregateError from
 * cleanup rather than as anything to do with the assertion.
 */
async function setVisibilityAsync(state: DocumentVisibilityState) {
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  setVisibility("visible");
  // requestAnimationFrame drives the count-up; under fake timers it needs to be one too.
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => window.setTimeout(() => cb(performance.now()), 16));
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id as unknown as number));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("agoLabel", () => {
  it("reads the way a person says it", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(1)).toBe("just now");
    expect(agoLabel(14)).toBe("14s ago");
    expect(agoLabel(59)).toBe("59s ago");
    expect(agoLabel(60)).toBe("1m ago");
    expect(agoLabel(185)).toBe("3m ago");
  });
});

describe("ExchangeTicker", () => {
  it("paints the figures the server resolved, without waiting for a poll", () => {
    serve();
    render(<ExchangeTicker initial={summary()} />);

    const strip = screen.getByRole("region", { name: "The exchange today" });
    expect(within(strip).getByText("4,949")).toBeInTheDocument();
    expect(within(strip).getByText("2,100 advancing")).toBeInTheDocument();
    expect(within(strip).getByText("1,600 declining")).toBeInTheDocument();
    expect(within(strip).getByText("₹45.12 lakh Cr")).toBeInTheDocument();
  });

  it("dashes a tier average the exchange did not report", () => {
    serve();
    render(<ExchangeTicker initial={summary()} />);

    // Small cap has no average in this fixture. A dash, not a zero — it is unknown, not flat.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("reads both feeds on mount rather than waiting for the first tick", async () => {
    // The same figures back, so nothing starts a count-up animation this test would have to wait
    // out before it could assert on the requests.
    const fetchMock = serve(summary());

    await mountTicker();

    // The page this card sits on is itself cached, so a reader can arrive at figures that are
    // already old. Waiting for a tick before the first read is what let the board sit half an hour
    // behind while the counter climbed.
    expect(callsTo(fetchMock, "/api/market/bse")).toHaveLength(1);
    expect(callsTo(fetchMock, "/api/market/live")).toHaveLength(1);
  });

  it("asks the server every time rather than letting the browser answer from its own cache", async () => {
    const fetchMock = serve(summary());

    await mountTicker();

    // The route answers with `max-age=30`. Without this a poll can be served out of the browser
    // cache without the server ever hearing about it, which is a poll that cannot discover anything.
    for (const call of fetchMock.mock.calls as unknown[][]) {
      expect(call[1]).toMatchObject({ cache: "no-store" });
    }
  });

  it("re-reads both feeds every second", async () => {
    const fetchMock = serve();

    await mountTicker();

    await tickSeconds(3);

    // The read on mount plus one per second.
    expect(callsTo(fetchMock, "/api/market/bse").length).toBeGreaterThanOrEqual(4);
    expect(callsTo(fetchMock, "/api/market/live").length).toBeGreaterThanOrEqual(4);
  });

  it("ticks the 'ago' counter every second", async () => {
    // Both feeds refused, so nothing resets the counter and the tick itself is what is under test.
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;

    await mountTicker();

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
  });

  it("shows the live SENSEX level, and moves it with the next print", async () => {
    const fetchMock = jest.fn(async (url: string) =>
      String(url).includes("/api/market/live")
        ? ({ ok: true, json: async () => ({ indices: [sensex()] }) }) as unknown as Response
        : ({ ok: true, json: async () => ({ summary: summary() }) }) as unknown as Response,
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await mountTicker();

    expect(screen.getByText("82,450.25")).toBeInTheDocument();
    expect(screen.getByText(/\+350\.15 \(\+0\.43%\)/)).toBeInTheDocument();

    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/api/market/live")
        ? ({ ok: true, json: async () => ({ indices: [sensex({ price: 82_500.5, change: 400.4, changePercent: 0.49 })] }) }) as unknown as Response
        : ({ ok: true, json: async () => ({ summary: summary() }) }) as unknown as Response,
    );

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    expect(screen.getByText("82,500.50")).toBeInTheDocument();
  });

  it("waits rather than inventing a level when the feed carries no SENSEX print", async () => {
    serve(summary(), null);

    await mountTicker();

    expect(screen.getByText("Reading the tape…")).toBeInTheDocument();
  });

  it("says it is reconnecting once reads have been failing long enough to matter", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await mountTicker();

    // A single dropped request is not worth a warning — a phone changing cells does that.
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();

    await tickSeconds(11);

    // Ten seconds of silence is, because by then the figures are no longer evidence of anything.
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
    // And the last figures the exchange actually gave are still on screen rather than blanked.
    expect(screen.getByText("2,100 advancing")).toBeInTheDocument();
  });

  it("re-reads the board on its own interval and shows the new figures", async () => {
    serve(summary(2500, 1200));
    render(<ExchangeTicker initial={summary()} />);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    // Let the count-up walk from the old figure to the new one.
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    const strip = screen.getByRole("region", { name: "The exchange today" });
    expect(within(strip).getByText("2,500 advancing")).toBeInTheDocument();
    // The counter restarted from the moment the new figures landed.
    expect(within(strip).getByText(/ago|just now/)).toBeInTheDocument();
  });

  it("stops polling while the tab is hidden", async () => {
    const fetchMock = serve();
    render(<ExchangeTicker initial={summary()} />);

    setVisibility("hidden");
    await act(async () => {
      jest.advanceTimersByTime(300_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("catches up the moment the tab comes back", async () => {
    const fetchMock = serve();
    render(<ExchangeTicker initial={summary()} />);

    setVisibility("hidden");
    expect(fetchMock).not.toHaveBeenCalled();

    // Returning restarts the poll and reads at once. Asserted after a flush rather than
    // synchronously: the immediate read is fire-and-forget by design, and racing it here only
    // tests the harness.
    await setVisibilityAsync("visible");
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("keeps the figures on screen when a poll fails", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<ExchangeTicker initial={summary()} />);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    // A dropped poll is not worth an error banner over a board that is already correct.
    expect(screen.getByText("2,100 advancing")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
  });

  it("ignores a response that carries no summary", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    render(<ExchangeTicker initial={summary()} />);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("2,100 advancing")).toBeInTheDocument();
  });

  it("ignores a refused response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    render(<ExchangeTicker initial={summary()} />);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("2,100 advancing")).toBeInTheDocument();
  });

  it("reports the share of traded companies that advanced", () => {
    serve();
    // 2100 up, 1600 down, 1 unchanged = 3701 traded; 2100/3701 is 57%.
    render(<ExchangeTicker initial={summary()} />);

    expect(screen.getByText("57% of traded")).toBeInTheDocument();
  });

  it("copes with a session in which nothing traded at all", () => {
    serve();
    const empty = summary();
    empty.breadth = { advancing: 0, declining: 0, unchanged: 0, traded: 0 };
    render(<ExchangeTicker initial={empty} />);

    // No division by zero, and no NaN on the card.
    expect(screen.getByText("0% of traded")).toBeInTheDocument();
  });
});
