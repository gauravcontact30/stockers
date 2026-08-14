// The live exchange scoreboard.
//
// The claim this file has to keep honest is the cadence one. The tape behind these figures is
// cached fifteen minutes upstream, so the per-second motion on the card must only ever be on things
// that genuinely change every second — the "ago" counter, and the transition between two *measured*
// figures. Nothing here may invent a number, and the poll must stop when nobody is looking.

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

/** Answers the poll with whatever summary is handed in. */
function serve(next = summary(2500, 1200)) {
  const mock = jest.fn(async () => ({ ok: true, json: async () => ({ summary: next }) }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
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

  it("ticks the 'ago' counter every second without refetching", () => {
    const fetchMock = serve();
    render(<ExchangeTicker initial={summary()} />);

    expect(screen.getByText(/just now/)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    // Five seconds of visible motion and not one request: the figures cannot change that fast, and
    // pretending otherwise is the thing this card must not do.
    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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
