import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeadToHead, formatReturn, returnTone, verdictLine } from "../../app/components/head-to-head";
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
      oneMonth: 2,
      oneYear: 20,
      score: 10 + index,
    })),
    score,
  };
}

function match(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    human: side(["TCS", "INFY", "ITC", "SBIN", "WIPRO"], 60),
    ai: side(["HAL", "LT", "PARAS", "NETWEB", "MAZDOCK"], 71),
    winner: "ai",
    margin: 11,
    aiSource: "ai",
    ...overrides,
  };
}

/** Fills all five slots, which is what unlocks the button. */
async function pickFive(person: ReturnType<typeof userEvent.setup>, symbols = ["TCS", "INFY", "ITC", "SBIN", "WIPRO"]) {
  const fields = screen.getAllByLabelText("Search a company");
  for (const [index, symbol] of symbols.entries()) {
    await person.type(fields[index], symbol);
  }
}

function serve(payload: unknown, ok = true): jest.Mock {
  const mock = jest.fn(async () => ({ ok, json: async () => payload }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
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
  it("will not play until five companies are picked", async () => {
    const person = userEvent.setup();
    render(<HeadToHead />);

    expect(screen.getByRole("button", { name: "Play the AI" })).toBeDisabled();
    expect(screen.getByText("5 more to pick.")).toBeInTheDocument();

    await person.type(screen.getAllByLabelText("Search a company")[0], "TCS");
    expect(screen.getByText("4 more to pick.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play the AI" })).toBeDisabled();
  });

  it("fills a slot from the dropdown as well as from typing", async () => {
    const person = userEvent.setup();
    render(<HeadToHead />);

    await person.click(screen.getAllByRole("button", { name: "choose HAL" })[0]);

    expect(screen.getAllByLabelText("Search a company")[0]).toHaveValue("HAL");
    expect(screen.getByText("4 more to pick.")).toBeInTheDocument();
  });

  it("keeps a company already picked out of the other four boxes", async () => {
    const person = userEvent.setup();
    render(<HeadToHead />);

    await person.type(screen.getAllByLabelText("Search a company")[0], "TCS");

    // Slot one does not exclude itself; every other slot excludes it.
    const excluded = screen.getAllByTestId("excluded").map((node) => node.textContent);
    expect(excluded[0]).toBe("");
    expect(excluded[1]).toBe("TCS");
  });

  it("plays the match and shows both sides with the verdict between them", async () => {
    const person = userEvent.setup();
    const fetchMock = serve(match());

    render(<HeadToHead />);
    await pickFive(person);

    expect(screen.getByRole("button", { name: "Play the AI" })).toBeEnabled();
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText("The AI wins by 11")).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/head-to-head");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ symbols: ["TCS", "INFY", "ITC", "SBIN", "WIPRO"] });

    // Two separate cards, each carrying its own five and its own score.
    const yours = screen.getByRole("region", { name: "You" });
    const theirs = screen.getByRole("region", { name: "The AI" });
    expect(within(yours).getByText("TCS")).toBeInTheDocument();
    expect(within(yours).getByText("60")).toBeInTheDocument();
    expect(within(theirs).getByText("HAL")).toBeInTheDocument();
    expect(within(theirs).getByText("71")).toBeInTheDocument();
    expect(within(yours).queryByText("HAL")).not.toBeInTheDocument();
  });

  it("lets the human win, and says so", async () => {
    const person = userEvent.setup();
    serve(match({ winner: "human", margin: 6, human: side(["TCS", "INFY", "ITC", "SBIN", "WIPRO"], 77) }));

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText("You win by 6")).toBeInTheDocument();
  });

  it("says when the AI's picks came from the fallback ranking", async () => {
    const person = userEvent.setup();
    serve(match({ aiSource: "heuristic" }));

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText(/fallback ranking/)).toBeInTheDocument();
  });

  it("drops a stale verdict the moment the line-up is edited", async () => {
    const person = userEvent.setup();
    serve(match());

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));
    expect(await screen.findByText("The AI wins by 11")).toBeInTheDocument();

    // A result for five stocks that are no longer the five on screen would be a lie.
    await person.type(screen.getAllByLabelText("Search a company")[0], "X");
    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();
  });

  it("clears everything on start over", async () => {
    const person = userEvent.setup();
    serve(match());

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));
    await screen.findByText("The AI wins by 11");

    await person.click(screen.getByRole("button", { name: "Start over" }));

    expect(screen.queryByText("The AI wins by 11")).not.toBeInTheDocument();
    expect(screen.getByText("5 more to pick.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Search a company")[0]).toHaveValue("");
  });

  it("shows the reason the server gave for refusing a match", async () => {
    const person = userEvent.setup();
    serve({ error: "Pick 5 different companies to play." }, false);

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText("Pick 5 different companies to play.")).toBeInTheDocument();
  });

  it("falls back to its own wording when a refusal carries no reason", async () => {
    const person = userEvent.setup();
    serve({}, false);

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText("Couldn't play that match.")).toBeInTheDocument();
  });

  it("reports a market feed it could not reach", async () => {
    const person = userEvent.setup();
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(await screen.findByText("Couldn't reach the market data for this match.")).toBeInTheDocument();
  });

  it("says it is working while the match is in flight", async () => {
    const person = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () => new Promise((resolve) => {
        release = resolve;
      }),
    ) as unknown as typeof fetch;

    render(<HeadToHead />);
    await pickFive(person);
    await person.click(screen.getByRole("button", { name: "Play the AI" }));

    expect(screen.getByRole("button", { name: "Scoring the match..." })).toBeDisabled();

    release({ ok: true, json: async () => match() });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Scoring the match..." })).not.toBeInTheDocument());
  });
});
