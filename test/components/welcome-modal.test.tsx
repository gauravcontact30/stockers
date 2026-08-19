// The first-visit greeting.
//
// Three things have to hold, and they are the three ways a welcome dialog goes wrong.
//
// It must not appear immediately — a modal on arrival is an interruption, not a welcome, and the
// five-second wait is the whole reason this is tolerable. It must not appear twice: a browser that
// has been greeted is greeted, whether or not the reader formally dismissed it. And it must not
// cost anything for the great majority of arrivals who leave before it fires, which means nothing
// is fetched until the timer does.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WELCOME_DELAY_MS, WELCOME_SEEN_KEY, WelcomeModal, hasBeenWelcomed, sessionLine } from "../../app/components/welcome-modal";

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
    tips: ["Trade 9:15 to 3:30.", "Use limit orders.", "Size before you buy."],
    tipsSource: "ai",
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

beforeEach(() => {
  window.localStorage.clear();
  serve();
});

afterEach(() => {
  jest.useRealTimers();
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

describe("the first-visit welcome", () => {
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

  it("greets a new browser with two measured stocks and today's tips", async () => {
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(fetchMock).toHaveBeenCalledWith("/api/welcome", expect.anything());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Thank you for stopping by")).toBeInTheDocument();
    expect(within(dialog).getByText("RRKABEL")).toBeInTheDocument();
    expect(within(dialog).getByText("BOSCHLTD")).toBeInTheDocument();
    // Both halves of the screen: six months of gains, and a price at the bottom of the week.
    expect(within(dialog).getAllByText("+128.50%")).toHaveLength(2);
    expect(within(dialog).getAllByText("-2.40%")).toHaveLength(2);
    expect(within(dialog).getAllByText("₹2,775.00")).toHaveLength(2);
    expect(within(dialog).getByText("AI tips for today's BSE")).toBeInTheDocument();
    expect(within(dialog).getByText("Use limit orders.")).toBeInTheDocument();
    expect(within(dialog).getByText(/The BSE is trading right now/)).toBeInTheDocument();
  });

  it.each([
    ["pre-open", /The BSE opens at 9:15 AM IST/],
    ["closed", /The BSE has closed for the day/],
    ["holiday", /The BSE is shut today/],
  ])("says what the exchange is doing when the session is %s", async (marketSession, line) => {
    serve(brief({ marketSession }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it("names the tips as written ones when no model composed them", async () => {
    serve(brief({ tipsSource: "written", model: null }));
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByText("Tips for trading the BSE")).toBeInTheDocument();
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
    expect(within(dialog).getByText("Reading today's session…")).toBeInTheDocument();
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

  // The flag goes down when the dialog opens, not when it is dismissed: a reader who closes the
  // tab mid-greeting has still been greeted.
  it("greets a browser once and then never again", async () => {
    jest.useFakeTimers();
    const first = render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(window.localStorage.getItem(WELCOME_SEEN_KEY)).not.toBeNull();
    first.unmount();

    fetchMock.mockClear();
    render(<WelcomeModal />);
    await act(async () => {
      jest.advanceTimersByTime(WELCOME_DELAY_MS * 2);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when storage cannot be read at all", async () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await act(async () => {
      jest.advanceTimersByTime(WELCOME_DELAY_MS * 2);
    });

    // Not being able to remember that somebody was greeted means greeting them on every page load,
    // which is worse than never greeting them.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    getItem.mockRestore();
  });

  it("still greets when storage refuses the write", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    setItem.mockRestore();
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
    expect(window.localStorage.getItem(WELCOME_SEEN_KEY)).toBeNull();
  });
});

// The two answers the dialog is built on, asked directly — the component only ever reaches one
// branch of each per render, and both have a case that only shows up on an unusual day.
describe("the greeting's own two questions", () => {
  it("reads the flag, and treats a storage it cannot reach as already greeted", () => {
    expect(hasBeenWelcomed()).toBe(false);
    window.localStorage.setItem(WELCOME_SEEN_KEY, "2026-08-19T00:00:00.000Z");
    expect(hasBeenWelcomed()).toBe(true);

    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(hasBeenWelcomed()).toBe(true);
    getItem.mockRestore();
  });

  it.each([
    ["live", /trading right now/],
    ["pre-open", /opens at 9:15 AM IST/],
    ["closed", /has closed for the day/],
    ["holiday", /is shut today/],
  ])("says what the exchange is doing when it is %s", (marketSession, line) => {
    expect(sessionLine(brief({ marketSession }) as never)).toMatch(line);
  });
});

/**
 * The way back in.
 *
 * The flag is one-way by design, which makes the greeting impossible to look at twice — including
 * for the person who asked for it. `?welcome=1` is the explicit override, and it must not change
 * who gets greeted without asking.
 */
describe("?welcome=1", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("greets a browser that has already been greeted", async () => {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "2026-08-19T00:00:00.000Z");
    window.history.replaceState(null, "", "/?welcome=1");

    expect(hasBeenWelcomed()).toBe(false);

    jest.useFakeTimers();
    render(<WelcomeModal />);
    await waitForTheGreeting();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("is the only value that overrides the flag", () => {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "2026-08-19T00:00:00.000Z");
    window.history.replaceState(null, "", "/?welcome=yes");

    expect(hasBeenWelcomed()).toBe(true);
  });
});
