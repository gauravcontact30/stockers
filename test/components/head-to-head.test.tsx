import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CELEBRATION_MS,
  COUNTDOWN_FROM,
  HeadToHead,
  formatReturn,
  returnTone,
  verdictLine,
} from "../../app/components/head-to-head";
import type { MatchResult } from "../../app/lib/head-to-head";

// The picker is its own component with its own suite and its own network call to
// /api/stocks/suggest. Stubbed to a plain input so these tests drive the contest rather than the
// search box — typing a ticker straight in is exactly what the real box allows anyway.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: ({
    value,
    onChange,
    onSelect,
    exclude,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (symbol: string) => void;
    exclude?: string[];
    placeholder?: string;
  }) => (
    <div>
      <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {/* Stands in for choosing a row out of the dropdown, which is the other way a slot fills. */}
      <button type="button" onClick={() => onSelect?.("HAL")}>
        choose HAL
      </button>
      {/* Surfaces what the real box would hide, so the no-duplicates rule is assertable. */}
      <span data-testid="excluded">{(exclude ?? []).filter(Boolean).join(",")}</span>
    </div>
  ),
}));

// The logo tile reaches four third-party hosts in turn and recovers from failures on a ref. None
// of that is what these tests are about; the symbol it was asked for is.
jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

const AI_PICKS = [
  { symbol: "HAL", name: "Hindustan Aeronautics Ltd" },
  { symbol: "LT", name: "Larsen & Toubro Ltd" },
  { symbol: "PARAS", name: "Paras Defence Ltd" },
  { symbol: "NETWEB", name: "Netweb Technologies Ltd" },
  { symbol: "MAZDOCK", name: "Mazagon Dock Ltd" },
];

/**
 * A scored side. Each pick gets its own score, distinct from the side total, so an assertion on
 * the headline number cannot accidentally match one of the five rows underneath it.
 */
function side(symbols: string[], score: number) {
  return {
    picks: symbols.map((symbol, index) => ({
      symbol,
      name: `${symbol} Ltd`,
      price: 100 + index,
      // Distinct per window, so an assertion on one cell of the matrix cannot pass by matching
      // another cell in the same row.
      oneDay: 0.5,
      oneWeek: 1,
      oneMonth: 2,
      threeMonth: 6,
      sixMonth: 11,
      oneYear: 20,
      threeYear: 55,
      fiveYear: 90,
      overall: 140,
      capTier: "Large",
      score: 10 + index,
    })),
    score,
  };
}

function match(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    human: side(["TCS", "INFY", "ITC", "SBIN", "WIPRO"], 60),
    ai: side(AI_PICKS.map((pick) => pick.symbol), 71),
    winner: "ai",
    margin: 11,
    aiSource: "ai",
    aiSkill: {
      key: "compounder",
      label: "Long-run compounder",
      blurb: "Ranked on what each company has actually compounded over the exchange's full history.",
    },
    ...overrides,
  };
}

/**
 * Answers the one call the card makes: the POST that plays the match. There is no fetch on mount —
 * the AI is not asked for a team until the human's five are locked in.
 */
function serve({ post = match(), postOk = true }: { post?: unknown; postOk?: boolean } = {}) {
  const mock = jest.fn(async () => ({ ok: postOk, json: async () => post }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/**
 * Lets the in-flight request finish.
 *
 * Two flushes, not one: `play` awaits the fetch and then awaits `.json()`, so a single drained
 * microtask queue leaves the component one `await` short of having handled the response.
 */
async function settle() {
  await act(async () => {});
  await act(async () => {});
}

/** Runs the countdown out, one modelled second at a time. */
function runCountdown(seconds = COUNTDOWN_FROM) {
  for (let step = 0; step < seconds; step++) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

/** Fills all five slots, which is what unlocks the button. */
async function pickFive(person: ReturnType<typeof userEvent.setup>, symbols = ["TCS", "INFY", "ITC", "SBIN", "WIPRO"]) {
  const fields = screen.getAllByLabelText("Search a company");
  for (const [index, symbol] of symbols.entries()) {
    await person.type(fields[index], symbol);
  }
}

/**
 * Picks five and locks them in, which is what makes the AI answer.
 *
 * Waits for the locked state to appear rather than flushing a fixed number of microtasks: the
 * fixed count works until a test happens to leave one extra promise behind, and then fails in a
 * different test each run.
 */
async function lockIn(person: ReturnType<typeof userEvent.setup>) {
  await pickFive(person);
  await person.click(screen.getByRole("button", { name: "Lock Now" }));
  await screen.findByRole("button", { name: "Check Score" });
}

/** Locks in, checks the score, and runs the clock out to the verdict. */
async function playAMatch(person: ReturnType<typeof userEvent.setup>) {
  await lockIn(person);
  await person.click(screen.getByRole("button", { name: "Check Score" }));
  runCountdown();
}

describe("formatReturn", () => {
  it("signs a gain, leaves a loss signed, and dashes what is missing", () => {
    expect(formatReturn(12.34)).toBe("+12.3%");
    expect(formatReturn(-4)).toBe("-4.0%");
    expect(formatReturn(0)).toBe("0.0%");
    expect(formatReturn(null)).toBe("—");
    expect(formatReturn(Number.NaN)).toBe("—");
  });
});

describe("returnTone", () => {
  it("greens a gain, reddens a loss and leaves nothing-happened neutral", () => {
    expect(returnTone(5)).toContain("emerald");
    expect(returnTone(-5)).toContain("rose");
    expect(returnTone(0)).toContain("slate");
    expect(returnTone(null)).toContain("slate");
    expect(returnTone(Number.NaN)).toContain("slate");
  });
});

describe("verdictLine", () => {
  it("names the winner and the margin, and calls a tie a dead heat", () => {
    expect(verdictLine(match({ winner: "human", margin: 4 }))).toBe("You win by 4");
    expect(verdictLine(match({ winner: "ai", margin: 11 }))).toBe("The AI wins by 11");
    expect(verdictLine(match({ winner: "draw", margin: 0 }))).toBe("Dead heat — nothing in it");
  });
});

describe("HeadToHead", () => {
  let person: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.useFakeTimers();
    person = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    // Discarded rather than run out. `runOnlyPendingTimers` fires a still-ticking countdown
    // outside `act`, and that stray render leaks into whichever test happens to come next — which
    // showed up as one error-path test failing only in a full run and passing on its own.
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("keeps the AI's five blurred and unchosen until the score is checked", async () => {
    const fetchMock = serve();
    render(<HeadToHead />);
    await act(async () => {});

    // Five locked slots, blurred, holding nothing — and crucially no request has gone out, so
    // there is no line-up sitting in the browser for anyone to read ahead of the match.
    const slots = screen.getAllByLabelText(/^AI pick/);
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBeDisabled();
    expect(slots[0].className).toContain("blur-");
    expect(screen.getByText(/chosen when you lock yours in/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reveals the AI's five once the match is played, each with its mark and name", async () => {
    serve();
    render(<HeadToHead />);
    await playAMatch(person);

    const slot = screen.getAllByLabelText(/^AI pick/)[0];
    expect(slot.className).not.toContain("blur-");
    expect(within(slot).getByTestId("logo-HAL")).toBeInTheDocument();
    expect(within(slot).getByText("HAL")).toBeInTheDocument();
    expect(within(slot).getByText("HAL Ltd")).toBeInTheDocument();
    expect(screen.getByText(/Both line-ups are locked/)).toBeInTheDocument();
  });

  it("shows a bare ticker for an AI pick the catalogue has no name for", async () => {
    const unnamed = match();
    unnamed.ai.picks[0] = { ...unnamed.ai.picks[0], symbol: "NEWCO", name: null };
    serve({ post: unnamed });

    render(<HeadToHead />);
    await playAMatch(person);

    const slot = screen.getAllByLabelText(/^AI pick/)[0];
    expect(within(slot).getByText("NEWCO")).toBeInTheDocument();
    expect(within(slot).getByTestId("logo-NEWCO")).toBeInTheDocument();
  });

  it("locks both line-ups first, and only scores them when asked", async () => {
    const fetchMock = serve();
    render(<HeadToHead />);
    await lockIn(person);

    // Locking is what fetches, and it fetches once. Both hands are now on the table.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(screen.getAllByLabelText(/^AI pick/)[0]).getByText("HAL")).toBeInTheDocument();
    expect(within(screen.getAllByLabelText(/^Your pick/)[0]).getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText(/Both line-ups are locked/)).toBeInTheDocument();

    // The reader's own five are no longer editable, and no score has been shown.
    expect(screen.queryAllByLabelText("Search a company")).toHaveLength(0);
    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "The AI" })).not.toBeInTheDocument();

    // Checking the score starts the clock — and asks the server for nothing more.
    await person.click(screen.getByRole("button", { name: "Check Score" }));
    expect(screen.getByText("Scoring both sides")).toBeInTheDocument();
    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();

    runCountdown();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("The AI wins by 11")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "You" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "The AI" })).toBeInTheDocument();
  });

  it("flags a pick the price feed could not answer for, rather than passing 50 off as a result", async () => {
    const unpriced = match();
    unpriced.human.picks[0] = {
      ...unpriced.human.picks[0],
      oneDay: null,
      oneWeek: null,
      oneMonth: null,
      threeMonth: null,
      sixMonth: null,
      oneYear: null,
      threeYear: null,
      fiveYear: null,
      overall: null,
      score: 50,
    };
    serve({ post: unpriced });

    render(<HeadToHead />);
    await playAMatch(person);

    const yours = screen.getByRole("region", { name: "You" });
    expect(within(yours).getByText("No price history — scored neutral")).toBeInTheDocument();
    // The four priced rows still carry their live last-traded price.
    expect(within(yours).getByText("₹101.00")).toBeInTheDocument();
    // And only that row is flagged — the other four have real returns.
    expect(within(yours).getAllByText("No price history — scored neutral")).toHaveLength(1);
  });

  it("shows the workings behind each score, on both cards", async () => {
    serve();
    render(<HeadToHead />);
    await playAMatch(person);

    // The four windows momentumScore weighs, so a reader can see why one stock outscored another.
    for (const card of ["You", "The AI"]) {
      const region = screen.getByRole("region", { name: card });
      // Every window the exchange has, not just the four that are scored.
      for (const label of ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "ALL"]) {
        expect(within(region).getAllByText(new RegExp(`^${label}`)).length).toBe(5);
      }
      expect(within(region).getAllByText("+11.0%").length).toBe(5);
      expect(within(region).getAllByText("+20.0%").length).toBe(5);
    }
  });

  it("names the lens the AI picked with", async () => {
    serve();
    render(<HeadToHead />);
    await playAMatch(person);

    const theirs = screen.getByRole("region", { name: "The AI" });
    expect(within(theirs).getByText("Long-run compounder")).toBeInTheDocument();
    expect(within(theirs).getByText(/compounded over the exchange/)).toBeInTheDocument();
  });

  it("will not play until five companies are picked", async () => {
    serve();
    render(<HeadToHead />);

    expect(screen.getByRole("button", { name: "Lock Now" })).toBeDisabled();
    expect(screen.getByText("5 more to pick.")).toBeInTheDocument();

    await person.type(screen.getAllByLabelText("Search a company")[0], "TCS");
    expect(screen.getByText("4 more to pick.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Now" })).toBeDisabled();
  });

  it("fills a slot from the dropdown as well as from typing", async () => {
    serve();
    render(<HeadToHead />);

    await person.click(screen.getAllByRole("button", { name: "choose HAL" })[0]);

    expect(screen.getAllByLabelText("Search a company")[0]).toHaveValue("HAL");
    expect(screen.getByText("4 more to pick.")).toBeInTheDocument();
  });

  it("keeps a company already picked out of the other four boxes", async () => {
    serve();
    render(<HeadToHead />);

    await person.type(screen.getAllByLabelText("Search a company")[0], "TCS");

    const excluded = screen.getAllByTestId("excluded").map((node) => node.textContent);
    expect(excluded[0]).toBe("");
    expect(excluded[1]).toBe("TCS");
  });

  it("counts down from ten to zero before showing the verdict", async () => {
    serve();
    render(<HeadToHead />);
    await lockIn(person);

    await person.click(screen.getByRole("button", { name: "Check Score" }));

    // The count starts at ten and the verdict is withheld until it runs out.
    expect(screen.getByText(String(COUNTDOWN_FROM))).toBeInTheDocument();
    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();

    runCountdown(1);
    expect(screen.getByText("9")).toBeInTheDocument();
    runCountdown(1);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();

    runCountdown(8);
    expect(screen.getByText("The AI wins by 11")).toBeInTheDocument();
  });

  it("says it is working while the line-up is being locked", async () => {
    let release: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ) as unknown as typeof fetch;

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Lock Now" }));

    // The clock cannot outrun the market any more: the request is finished before "Check Score"
    // exists at all, so the countdown is pure theatre over a decided match.
    expect(screen.getByRole("button", { name: "Locking in..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check Score" })).not.toBeInTheDocument();

    await act(async () => {
      release({ ok: true, json: async () => match() });
    });

    expect(screen.getByRole("button", { name: "Check Score" })).toBeEnabled();
  });

  it("shows both sides, each stock with its logo, and celebrates for twenty seconds", async () => {
    const fetchMock = serve();
    render(<HeadToHead />);
    await playAMatch(person);

    // One call, and only one: the AI is asked for a team exactly once, when the score is checked.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/head-to-head");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ symbols: ["TCS", "INFY", "ITC", "SBIN", "WIPRO"] });

    const yours = screen.getByRole("region", { name: "You" });
    const theirs = screen.getByRole("region", { name: "The AI" });

    // Every row on both cards carries the company's own mark.
    expect(within(yours).getByTestId("logo-TCS")).toBeInTheDocument();
    expect(within(yours).getByText("60")).toBeInTheDocument();
    expect(within(theirs).getByTestId("logo-HAL")).toBeInTheDocument();
    expect(within(theirs).getByText("71")).toBeInTheDocument();
    expect(within(yours).queryByTestId("logo-HAL")).not.toBeInTheDocument();

    // Alight on both cards the moment the verdict lands...
    expect(yours.className).toContain("animate-celebrate-glow");
    expect(theirs.className).toContain("animate-celebrate-glow");

    act(() => {
      jest.advanceTimersByTime(CELEBRATION_MS);
    });

    // ...and out again after a minute, without touching the scores.
    expect(screen.getByRole("region", { name: "You" }).className).not.toContain("animate-celebrate-glow");
    expect(screen.getByText("The AI wins by 11")).toBeInTheDocument();
  });

  it("lets the human win, and says so", async () => {
    serve({ post: match({ winner: "human", margin: 6, human: side(["TCS", "INFY", "ITC", "SBIN", "WIPRO"], 77) }) });
    render(<HeadToHead />);
    await playAMatch(person);

    expect(screen.getByText("You win by 6")).toBeInTheDocument();
  });

  it("says when the AI's picks came from the fallback ranking", async () => {
    serve({ post: match({ aiSource: "heuristic" }) });
    render(<HeadToHead />);
    await playAMatch(person);

    expect(screen.getByText(/fallback ranking/)).toBeInTheDocument();
  });

  it("drops a stale verdict the moment the line-up is edited, before it is locked", async () => {
    serve();
    render(<HeadToHead />);
    await lockIn(person);

    // Editing is only possible before the lock — and reaching back to the search boxes means
    // starting over, which must take the AI's answer with it rather than leaving a team on screen
    // that was chosen against five stocks no longer picked.
    await person.click(screen.getByRole("button", { name: "Start over" }));
    await person.type(screen.getAllByLabelText("Search a company")[0], "X");

    expect(screen.queryByText(/Both line-ups are locked/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Now" })).toBeInTheDocument();
  });

  it("clears everything on start over", async () => {
    serve();
    render(<HeadToHead />);
    await playAMatch(person);
    expect(screen.getByText("The AI wins by 11")).toBeInTheDocument();

    await person.click(screen.getByRole("button", { name: "Start over" }));

    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();
    expect(screen.getByText("5 more to pick.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Search a company")[0]).toHaveValue("");
  });

  it("shows the reason the server gave for refusing the lock, and stays unlocked", async () => {
    serve({ post: { error: "Pick 5 different companies to play." }, postOk: false });
    render(<HeadToHead />);
    await pickFive(person);

    await person.click(screen.getByRole("button", { name: "Lock Now" }));
    expect(await screen.findByText("Pick 5 different companies to play.")).toBeInTheDocument();
    // Nothing was locked, so the reader still has their search boxes and can fix the line-up.
    expect(screen.getByRole("button", { name: "Lock Now" })).toBeEnabled();
    expect(screen.getAllByLabelText("Search a company")).toHaveLength(5);
  });

  it("falls back to its own wording when a refusal carries no reason", async () => {
    const fetchMock = serve({ post: {}, postOk: false });
    render(<HeadToHead />);
    await pickFive(person);

    await person.click(screen.getByRole("button", { name: "Lock Now" }));
    expect(await screen.findByText("Couldn't lock that line-up.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("reports a market feed it could not reach", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<HeadToHead />);
    await pickFive(person);

    await person.click(screen.getByRole("button", { name: "Lock Now" }));
    expect(await screen.findByText("Couldn't reach the market data for this match.")).toBeInTheDocument();
  });

  it("will not start a second fight while one is already running", async () => {
    serve();
    render(<HeadToHead />);
    await lockIn(person);

    await person.click(screen.getByRole("button", { name: "Check Score" }));

    expect(screen.getByRole("button", { name: "Fight on..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Scoring both sides")).toBeInTheDocument());
  });

  it("will not re-score a match that has already been scored", async () => {
    serve();
    render(<HeadToHead />);
    await playAMatch(person);

    // The verdict is in. The button stays, spent, rather than offering a second run at the same
    // locked pair — "Start over" is the way to another match.
    expect(screen.getByRole("button", { name: "Scored" })).toBeDisabled();
  });
});
