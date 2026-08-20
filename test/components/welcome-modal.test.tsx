// The welcome greeting.
//
// Four things have to hold, and they are the four ways a welcome dialog goes wrong.
//
// It must not appear immediately — a modal on arrival is an interruption, not a welcome, and the
// five-second wait is the whole reason this is tolerable. It must appear on every visit, and it
// must not say the same thing twice: the two stocks are drawn from the qualified pool per arrival,
// skipping whichever pair the last arrival saw. It must stay up until the reader closes it. And it
// must not cost anything for the arrivals who leave before it fires, which means nothing is fetched
// until the timer does.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LAST_PICKS_KEY,
  WELCOME_DELAY_MS,
  WELCOME_HEADLINES,
  WelcomeModal,
  drawHeadline,
  drawPicks,
  lastPicks,
  sessionLine,
} from "../../app/components/welcome-modal";

function pick(symbol: string, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    name: `${symbol} Ltd`,
    sector: "Capital Goods",
    capTier: "Large",
    price: 2784.9,
    changePercent: -2.4,
    sixMonthReturn: 128.5,
    weekLow: 2775.0,
    aboveWeekLow: 0.36,
    ...overrides,
  };
}

function brief(overrides: Record<string, unknown> = {}) {
  return {
    picks: [pick("RRKABEL"), pick("BOSCHLTD")],
    tip: "Both are back at the week's low after a six-month run — place a limit near that low, not a market order at the open.",
    tipSource: "ai",
    model: "test/model",
    marketSession: "live",
    sessionDate: "2026-08-19",
    date: "2026-08-19",
    generatedAt: "2026-08-19T04:00:00.000Z",
    ...overrides,
  };
}

let fetchMock: jest.Mock;

function serve(payload: unknown = brief(), ok = true) {
  fetchMock = jest.fn(() => Promise.resolve({ ok, json: async () => payload }));
  global.fetch = fetchMock as unknown as typeof fetch;
}

/**
 * Fixes the draws for one visit: the greeting line first, then the two stock draws.
 *
 * Everything after the queue falls back to a real random, so a test that only cares about the
 * headline does not have to spell out the rest.
 */
function draws(...values: number[]) {
  const queue = [...values];
  return jest.spyOn(Math, "random").mockImplementation(() => queue.shift() ?? 0);
}

beforeEach(() => {
  window.localStorage.clear();
  serve();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Runs the five seconds out and lets the brief's promise chain settle. */
async function waitForTheGreeting() {
  await act(async () => {
    jest.advanceTimersByTime(WELCOME_DELAY_MS);
  });
  // The dialog's own enter transition is driven by animation frames.
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
}

/** Which of a session's qualifying tickers ended up on the cards. */
function shownSymbols(candidates: string[]): string[] {
  return candidates.filter((symbol) => screen.queryByText(symbol) !== null);
}

describe("the welcome", () => {
  it("stays out of the way for the first five seconds, and asks for nothing", async () => {
    jest.useFakeTimers();
    render(<WelcomeModal />);

    await act(async () => {
      jest.advanceTimersByTime(WELCOME_DELAY_MS - 500);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The majority of arrivals leave inside this window; none of them should have cost a request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("greets the visitor with two measured stocks and one tip about today", async () => {
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(fetchMock).toHaveBeenCalledWith("/api/welcome", expect.anything());

    const dialog = await screen.findByRole("dialog");
    expect(WELCOME_HEADLINES).toContain(within(dialog).getByRole("heading").textContent);
    expect(within(dialog).getByText("BSE live")).toBeInTheDocument();
    expect(within(dialog).getByText("RRKABEL")).toBeInTheDocument();
    expect(within(dialog).getByText("BOSCHLTD")).toBeInTheDocument();
    // Both halves of the screen: six months of gains, and a price at the bottom of the week.
    expect(within(dialog).getAllByText("+128.50%")).toHaveLength(2);
    expect(within(dialog).getAllByText("-2.40%")).toHaveLength(2);
    expect(within(dialog).getAllByText("₹2,775.00")).toHaveLength(2);

    // One tip, not a list.
    expect(within(dialog).getByText("AI tip for today's BSE")).toBeInTheDocument();
    expect(within(dialog).getByText(/place a limit near that low/)).toBeInTheDocument();
    expect(within(dialog).getByText(/The BSE is trading right now/)).toBeInTheDocument();
  });

  it.each([
    ["pre-open", /The BSE opens at 9:15 AM IST/, "Pre-open"],
    ["closed", /The BSE has closed for the day/, "Closed"],
    ["holiday", /The BSE is shut today/, "Holiday"],
  ])("says what the exchange is doing when the session is %s", async (marketSession, line, pill) => {
    serve(brief({ marketSession }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByText(pill)).toBeInTheDocument();
  });

  it("names the tip as a written one when no model composed it", async () => {
    serve(brief({ tipSource: "written", model: null }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByText("Tip for trading the BSE")).toBeInTheDocument();
  });

  // Strong over six months *and* at the week's low is an intersection; some sessions have nothing in it.
  it("says so rather than showing an empty panel when nothing cleared both screens", async () => {
    serve(brief({ picks: [] }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByText(/No stock cleared both halves of the screen today/)).toBeInTheDocument();
  });

  it("still greets when the brief cannot be reached", async () => {
    serve(null, false);
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Reading today's session…/)).toBeInTheDocument();
  });

  it("survives a request that rejects outright", async () => {
    fetchMock = jest.fn(() => Promise.reject(new Error("offline")));
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("renders a stock the feed could not price without inventing figures", async () => {
    serve(brief({ picks: [pick("RRKABEL", { price: null, changePercent: null, sixMonthReturn: null, weekLow: null, aboveWeekLow: null })] }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("—").length).toBeGreaterThan(0);
  });

  // The greeting is per visit, not per browser: a reader who has seen it before is greeted again
  // on the next arrival, and nothing is written down to stop that.
  it("greets again on the next visit", async () => {
    jest.useFakeTimers();
    const first = render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    first.unmount();

    fetchMock.mockClear();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/welcome", expect.anything());
  });

  // The point of sending the whole qualified pool: the second visit of the day is a different pair.
  it("deals two different stocks on the next visit", async () => {
    serve(brief({ picks: [pick("AAA"), pick("BBB"), pick("CCC"), pick("DDD")] }));
    draws(0, 0, 0);
    jest.useFakeTimers();
    const first = render(<WelcomeModal />);
    await waitForTheGreeting();

    const opening = shownSymbols(["AAA", "BBB", "CCC", "DDD"]);
    expect(opening).toHaveLength(2);
    expect([...JSON.parse(window.localStorage.getItem(LAST_PICKS_KEY) ?? "[]")].sort()).toEqual(opening);
    first.unmount();

    draws(0, 0, 0);
    render(<WelcomeModal />);
    await waitForTheGreeting();

    const second = shownSymbols(["AAA", "BBB", "CCC", "DDD"]);
    expect(second).toHaveLength(2);
    expect(second.some((symbol) => opening.includes(symbol))).toBe(false);
  });

  // A session with three qualifying names cannot deal two new ones twice. Repeating one beats
  // showing one.
  it("repeats a stock only when the pool is too small to avoid it", async () => {
    window.localStorage.setItem(LAST_PICKS_KEY, JSON.stringify(["AAA", "BBB"]));
    serve(brief({ picks: [pick("AAA"), pick("BBB"), pick("CCC")] }));
    draws(0, 0.9, 0.9);
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(shownSymbols(["AAA", "BBB", "CCC"])).toHaveLength(2);
  });

  // Private-mode browsers throw on localStorage. The greeting still deals a pair; it just cannot
  // promise the next one differs.
  it("greets a browser that refuses storage", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(shownSymbols(["RRKABEL", "BOSCHLTD"])).toHaveLength(2);
  });

  // Nothing closes the dialog but the reader: no timer takes it away while it is being read.
  it("stays open until the reader closes it", async () => {
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    await screen.findByRole("dialog");
    await act(async () => {
      jest.advanceTimersByTime(WELCOME_DELAY_MS * 10);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on the dismissal and on the call to action", async () => {
    jest.useFakeTimers();
    const person = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WelcomeModal />);
    await waitForTheGreeting();

    await screen.findByRole("dialog");
    await person.click(screen.getByRole("button", { name: "Maybe later" }));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes when the reader follows the market link", async () => {
    jest.useFakeTimers();
    const person = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WelcomeModal />);
    await waitForTheGreeting();

    await screen.findByRole("dialog");
    await person.click(screen.getByRole("link", { name: "Explore the live market" }));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("drops the pending request when the page is left before the timer fires", async () => {
    jest.useFakeTimers();
    const { unmount } = render(<WelcomeModal />);
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(WELCOME_DELAY_MS * 2);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The three answers the dialog is built on, asked directly — the component reaches one branch of
// each per render, and several of them only come up on an unusual session.
describe("the greeting's own questions", () => {
  it.each([
    ["live", /trading right now/],
    ["pre-open", /opens at 9:15 AM IST/],
    ["closed", /has closed for the day/],
    ["holiday", /is shut today/],
  ])("says what the exchange is doing when it is %s", (marketSession, line) => {
    expect(sessionLine(brief({ marketSession }) as never)).toMatch(line);
  });

  it("draws a greeting line from the written set", () => {
    draws(0.99);
    expect(drawHeadline()).toBe(WELCOME_HEADLINES[WELCOME_HEADLINES.length - 1]);
  });

  describe("the pair a visit is dealt", () => {
    const pool = [pick("AAA"), pick("BBB"), pick("CCC"), pick("DDD")];

    it("shows the whole pool when there is nothing to choose between", () => {
      expect(drawPicks([pick("AAA")], []).map((entry) => entry.symbol)).toEqual(["AAA"]);
      expect(drawPicks(pool.slice(0, 2), ["AAA"]).map((entry) => entry.symbol)).toEqual(["AAA", "BBB"]);
    });

    it("draws two distinct names, wrapping round the end of the pool", () => {
      draws(0.99, 0.99);
      expect(drawPicks(pool, []).map((entry) => entry.symbol)).toEqual(["DDD", "CCC"]);
    });

    it("leaves out the names the last visit saw", () => {
      draws(0, 0);
      expect(drawPicks(pool, ["AAA", "BBB"]).map((entry) => entry.symbol)).toEqual(["CCC", "DDD"]);
    });

    it("falls back to the whole pool when too few names are left to avoid a repeat", () => {
      draws(0, 0);
      expect(drawPicks(pool, ["AAA", "BBB", "CCC"]).map((entry) => entry.symbol)).toEqual(["AAA", "BBB"]);
    });
  });

  describe("what the last visit showed", () => {
    it("reads the remembered pair back", () => {
      window.localStorage.setItem(LAST_PICKS_KEY, JSON.stringify(["AAA", "BBB"]));
      expect(lastPicks()).toEqual(["AAA", "BBB"]);
    });

    it("is empty when nothing has been remembered yet", () => {
      expect(lastPicks()).toEqual([]);
    });

    it("keeps only the tickers out of a record that has been tampered with", () => {
      window.localStorage.setItem(LAST_PICKS_KEY, JSON.stringify(["AAA", 7, null]));
      expect(lastPicks()).toEqual(["AAA"]);
    });

    it("treats a record that is not a list as no memory at all", () => {
      window.localStorage.setItem(LAST_PICKS_KEY, JSON.stringify({ symbol: "AAA" }));
      expect(lastPicks()).toEqual([]);
    });

    it("treats a storage it cannot reach as no memory at all", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage disabled");
      });
      expect(lastPicks()).toEqual([]);
    });
  });
});
