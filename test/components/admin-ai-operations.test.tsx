// What the model has been doing, as the super admin sees it.
//
// The panel exists because the app hides model failures perfectly: every AI board still renders,
// composed from its own measured figures, so an OpenRouter outage is invisible everywhere else.
// What is tested here is therefore mostly *what it says* — the four verdict states have to be right
// individually, because that sentence is what decides whether somebody goes looking for a problem.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AdminAiOperations,
  REFRESH_MS,
  formatCount,
  formatMs,
  formatUsd,
  rateTone,
  verdictOf,
  type AiUsageState,
} from "../../app/components/admin-ai-operations";
import type { AiCallRecord, AiUsageSlice } from "../../app/lib/ai-usage-report";

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
}));

function slice(overrides: Partial<AiUsageSlice> = {}): AiUsageSlice {
  return {
    key: "board-read",
    label: "board-read",
    counts: { ok: 8, unusable: 1, failed: 1, unconfigured: 0, total: 10 },
    fallbackRate: 20,
    latency: { p50: 900, p95: 2_400, max: 3_000 },
    promptTokens: 4_000,
    completionTokens: 1_200,
    costUsd: 0.0042,
    costedCalls: 9,
    lastAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

function failure(overrides: Partial<AiCallRecord> = {}): AiCallRecord {
  return {
    id: "ai_1",
    at: "2026-08-15T10:00:00.000Z",
    day: "2026-08-15",
    feature: "intel-search",
    model: "openai/gpt-4.1-mini",
    outcome: "failed",
    status: 429,
    ms: 1_200,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    streamed: false,
    error: "OpenRouter responded with 429",
    ...overrides,
  };
}

function state(overrides: Partial<AiUsageState> = {}): AiUsageState {
  return {
    days: 7,
    today: "2026-08-15",
    counts: { ok: 90, unusable: 5, failed: 5, unconfigured: 0, total: 100 },
    fallbackRate: 10,
    latency: { p50: 900, p95: 2_400, max: 3_000 },
    promptTokens: 40_000,
    completionTokens: 12_000,
    costUsd: 0.42,
    costedCalls: 95,
    features: [slice()],
    models: [slice({ key: "openai/gpt-4.1-mini", label: "openai/gpt-4.1-mini" })],
    daily: [
      { day: "2026-08-14", counts: { ok: 40, unusable: 2, failed: 3, unconfigured: 0, total: 45 }, costUsd: 0.2, p50: 800 },
      { day: "2026-08-15", counts: { ok: 50, unusable: 3, failed: 2, unconfigured: 0, total: 55 }, costUsd: 0.22, p50: 950 },
    ],
    recentFailures: [failure()],
    backend: "supabase",
    processLocal: false,
    held: 100,
    configured: true,
    model: "openai/gpt-4.1-mini",
    ...overrides,
  };
}

/**
 * Answers the panel's read with whatever payload is handed in.
 *
 * The stub answers only the AI usage route, and only a request that carries admin credentials —
 * so every test in this suite implicitly asserts that the panel asks the right endpoint with the
 * right headers, rather than that being checked once and drifting afterwards.
 */
function serve(payload: unknown = state(), ok = true) {
  const mock = jest.fn(async (url: string, init?: RequestInit) => {
    const authorised = Boolean((init?.headers as Record<string, string> | undefined)?.Authorization);
    const wanted = String(url).startsWith("/api/admin/ai-usage");

    return (wanted && authorised
      ? { ok, json: async () => payload }
      : { ok: false, json: async () => ({ error: "refused" }) }) as unknown as Response;
  });

  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
}

beforeEach(() => {
  setVisibility("visible");
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// The pure helpers
// ---------------------------------------------------------------------------

describe("formatMs", () => {
  it("reads sub-second durations in milliseconds and longer ones in seconds", () => {
    expect(formatMs(340)).toBe("340ms");
    expect(formatMs(1_000)).toBe("1.0s");
    expect(formatMs(24_600)).toBe("24.6s");
  });

  it("has a dash for a call that never reached the model", () => {
    expect(formatMs(null)).toBe("—");
  });
});

describe("formatUsd", () => {
  it("keeps a fraction of a cent visible rather than rounding it to nothing", () => {
    // Two decimal places would render this as "$0.00", which reads as "nothing was spent".
    expect(formatUsd(0.0042)).toBe("$0.0042");
  });

  it("reads a real amount as money", () => {
    expect(formatUsd(12.3456)).toBe("$12.35");
    expect(formatUsd(1)).toBe("$1.00");
  });
});

describe("formatCount", () => {
  it("separates thousands, because token counts run to six digits", () => {
    expect(formatCount(1_200)).toBe("1,200");
  });
});

describe("rateTone", () => {
  it("is calm below the threshold where the odd unusable reply is normal", () => {
    expect(rateTone(0)).toContain("emerald");
    expect(rateTone(5)).toContain("emerald");
  });

  it("warns in between and alarms above", () => {
    expect(rateTone(6)).toContain("amber");
    expect(rateTone(19)).toContain("amber");
    expect(rateTone(20)).toContain("rose");
  });
});

describe("verdictOf", () => {
  it("leads with the missing key when there is no model at all", () => {
    const verdict = verdictOf(state({ configured: false, model: null }));
    expect(verdict.headline).toBe("No model is configured");
    expect(verdict.detail).toContain("nothing is being spent");
  });

  it("says nothing was asked rather than implying everything worked", () => {
    const verdict = verdictOf(state({ counts: { ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: 0 } }));
    expect(verdict.headline).toBe("Nothing has been asked of the model");
    expect(verdict.detail).toContain("7 days");
  });

  it("says a single day as a day", () => {
    const verdict = verdictOf(state({ days: 1, counts: { ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: 0 } }));
    expect(verdict.detail).toContain("last day");
  });

  it("names the fallback rate when it is high enough to act on", () => {
    const verdict = verdictOf(state({ fallbackRate: 42 }));
    expect(verdict.headline).toBe("42% of reads fell back to composed figures");
    // The whole reason the panel exists: this is invisible from every other screen.
    expect(verdict.detail).toContain("not visible anywhere else");
    expect(verdict.tone).toContain("rose");
  });

  it("qualifies a middling rate rather than alarming over it", () => {
    const verdict = verdictOf(state({ fallbackRate: 12 }));
    expect(verdict.headline).toBe("The model is answering, with 12% falling back");
    expect(verdict.tone).toContain("amber");
  });

  it("is plainly good below the threshold, and quotes the figures behind it", () => {
    const verdict = verdictOf(state({ fallbackRate: 2 }));
    expect(verdict.headline).toBe("The model is answering");
    expect(verdict.detail).toContain("90 of 100 calls");
    expect(verdict.detail).toContain("900ms");
  });
});

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

describe("AdminAiOperations", () => {
  it("says it is reading before the figures land", async () => {
    serve();
    render(<AdminAiOperations />);

    expect(screen.getByText(/Reading what the model has been doing/)).toBeInTheDocument();
    await screen.findByText("The model is answering, with 10% falling back");
  });

  it("reads the seven-day window on mount", async () => {
    const fetchMock = serve();
    render(<AdminAiOperations />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/ai-usage?days=7");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({ Authorization: "Bearer test-token" });
  });

  it("shows the totals, the spend it can account for and the tokens", async () => {
    serve();
    render(<AdminAiOperations />);

    await screen.findByText("100");
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("$0.4200")).toBeInTheDocument();
    // The spend tile has to say what it covers: not every call reports a cost.
    expect(screen.getByText("Reported on 95 of 100 calls")).toBeInTheDocument();
    expect(screen.getByText("52,000")).toBeInTheDocument();
    expect(screen.getByText("p95 2.4s · slowest 3.0s")).toBeInTheDocument();
  });

  it("re-reads when another window is chosen", async () => {
    const fetchMock = serve();
    render(<AdminAiOperations />);
    await screen.findByText("The model is answering, with 10% falling back");

    await userEvent.click(screen.getByRole("button", { name: "30 days" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/ai-usage?days=30");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("charts every day in the window, with the fallback share on top", async () => {
    serve();
    render(<AdminAiOperations />);

    await screen.findByText("Calls per day");
    expect(screen.getByTitle("2026-08-14: 45 calls, 5 fell back")).toBeInTheDocument();
    expect(screen.getByTitle("2026-08-15: 55 calls, 5 fell back")).toBeInTheDocument();
  });

  it("draws no fallback band on a day nothing was asked", async () => {
    serve(
      state({
        daily: [{ day: "2026-08-15", counts: { ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: 0 }, costUsd: 0, p50: null }],
      }),
    );
    render(<AdminAiOperations />);

    // A day with no calls must not divide by zero working out its fallback share.
    expect(await screen.findByTitle("2026-08-15: 0 calls, 0 fell back")).toBeInTheDocument();
  });

  it("breaks the calls down by research surface", async () => {
    serve();
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls by research surface" });
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("board-read")).toBeInTheDocument();
    expect(within(row).getByText("20%")).toBeInTheDocument();
    expect(within(row).getByText("5,200")).toBeInTheDocument();
    expect(within(row).getByText("$0.0042")).toBeInTheDocument();
  });

  it("sorts the surface breakdown by every column it offers", async () => {
    // Two surfaces so an ordering is observable, and a healthy one alongside the degraded one so
    // the "fell back" cell is exercised on both sides of its threshold.
    const healthy = slice({
      key: "market-pulse",
      label: "market-pulse",
      counts: { ok: 40, unusable: 0, failed: 0, unconfigured: 0, total: 40 },
      fallbackRate: 0,
      latency: { p50: 300, p95: 500, max: 600 },
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.9,
    });
    serve(state({ features: [slice(), healthy] }));
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls by research surface" });
    const firstLabel = () => within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[0].textContent;

    // Opens on call count, descending: the busiest surface leads.
    expect(firstLabel()).toBe("market-pulse");

    // A first click on a column sorts it descending, so each expectation is whichever surface
    // holds the larger value for that column.
    for (const [header, expected] of [
      ["Call site", "market-pulse"],
      ["Fell back", "board-read"],
      ["Median", "board-read"],
      ["p95", "board-read"],
      ["Tokens", "board-read"],
      ["Spend", "market-pulse"],
      ["Calls", "market-pulse"],
    ] as const) {
      await userEvent.click(within(table).getByRole("button", { name: new RegExp(`^${header}`) }));
      expect(firstLabel()).toBe(expected);
    }
  });

  it("sorts the fallback list by every column it offers", async () => {
    serve(
      state({
        recentFailures: [
          failure(),
          failure({ id: "ai_2", at: "2026-08-15T11:00:00.000Z", feature: "board-read", outcome: "unusable", status: null, ms: 400, error: null }),
        ],
      }),
    );
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls that fell back to a composed read" });
    const firstSite = () => within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[1].textContent;

    // Descending on the first click, and a missing status sorts last whichever way the column
    // points — so the refused call leads the status column rather than the one with no status.
    for (const [header, expected] of [
      ["When", "board-read"],
      ["Call site", "intel-search"],
      ["Outcome", "board-read"],
      ["Status", "intel-search"],
      ["Took", "intel-search"],
    ] as const) {
      await userEvent.click(within(table).getByRole("button", { name: new RegExp(`^${header}`) }));
      expect(firstSite()).toBe(expected);
    }
  });

  it("breaks the calls down by model", async () => {
    serve();
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls by model" });
    expect(within(table).getByText("openai/gpt-4.1-mini")).toBeInTheDocument();
  });

  it("lists the recent fallbacks with the status and reason behind each", async () => {
    serve();
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls that fell back to a composed read" });
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("intel-search")).toBeInTheDocument();
    expect(within(row).getByText("429")).toBeInTheDocument();
    expect(within(row).getByText("OpenRouter responded with 429")).toBeInTheDocument();
  });

  it("explains an unusable reply, which carries no status because nothing failed at the HTTP level", async () => {
    serve(state({ recentFailures: [failure({ outcome: "unusable", status: null, error: null })] }));
    render(<AdminAiOperations />);

    const table = await screen.findByRole("table", { name: "Model calls that fell back to a composed read" });
    expect(within(table).getByText("The reply could not be used.")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  it("leaves out the fallback table entirely when there is nothing in it", async () => {
    serve(state({ recentFailures: [] }));
    render(<AdminAiOperations />);

    await screen.findByText("Calls per day");
    expect(screen.queryByText("Recent fallbacks")).not.toBeInTheDocument();
  });

  it("warns that in-memory figures are one instance's own", async () => {
    serve(state({ processLocal: true, backend: "memory" }));
    render(<AdminAiOperations />);

    expect(await screen.findByText(/this server instance's own records/)).toBeInTheDocument();
    expect(screen.getByText(/Read from this instance's memory/)).toBeInTheDocument();
  });

  it("says so when the figures are durable", async () => {
    serve();
    render(<AdminAiOperations />);

    expect(await screen.findByText(/Read from the ai_calls table/)).toBeInTheDocument();
    expect(screen.queryByText(/this server instance's own records/)).not.toBeInTheDocument();
  });

  it("names no model on a deployment that has none", async () => {
    serve(state({ configured: false, model: null }));
    render(<AdminAiOperations />);

    expect(await screen.findByText("No model is configured")).toBeInTheDocument();
    expect(screen.getByText("No model configured")).toBeInTheDocument();
  });

  it("says the read failed rather than showing a page of zeroes", async () => {
    serve({}, false);
    render(<AdminAiOperations />);

    expect(await screen.findByText("Couldn't read the AI usage store.")).toBeInTheDocument();
    // The range buttons stay, so the reader can try another window rather than reloading.
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
  });

  it("refuses a payload that is not a report, rather than rendering half a panel", async () => {
    // A route behind a proxy that answers with a login page reaches the panel as an object with
    // none of the fields it reads.
    serve({ error: "Administrators only." });
    render(<AdminAiOperations />);

    expect(await screen.findByText("Couldn't read the AI usage store.")).toBeInTheDocument();
  });

  it("survives a read that rejects outright", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    render(<AdminAiOperations />);

    expect(await screen.findByText("Couldn't read the AI usage store.")).toBeInTheDocument();
  });

  it("keeps reading on a timer", async () => {
    jest.useFakeTimers();
    const fetchMock = serve();
    render(<AdminAiOperations />);

    await act(async () => {
      jest.advanceTimersByTime(REFRESH_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops reading while nobody is looking", async () => {
    jest.useFakeTimers();
    const fetchMock = serve();
    render(<AdminAiOperations />);

    setVisibility("hidden");
    await act(async () => {
      jest.advanceTimersByTime(REFRESH_MS * 3);
    });

    // A dashboard left open overnight should not spend the night aggregating.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads again the moment somebody comes back to the tab", async () => {
    const fetchMock = serve();
    render(<AdminAiOperations />);
    await screen.findByText("The model is answering, with 10% falling back");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says nothing about a read that was abandoned because the panel went away", async () => {
    // The read is still in flight at unmount, so it fails with the abort rather than with a real
    // fault. Reporting that to a panel nobody is looking at would be a state update on a component
    // that no longer exists, and the "error" is one we caused.
    let fail: (error: Error) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          fail = reject;
        }),
    ) as unknown as typeof fetch;

    const { unmount } = render(<AdminAiOperations />);
    // The read is dispatched off the effect body, so it has to be let through before the panel is
    // taken away — otherwise there is no in-flight request for the unmount to abort.
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      fail(new Error("aborted"));
    });

    expect(screen.queryByText("Couldn't read the AI usage store.")).not.toBeInTheDocument();
  });

  it("stops reading once it is gone", async () => {
    jest.useFakeTimers();
    const fetchMock = serve();
    const { unmount } = render(<AdminAiOperations />);
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(REFRESH_MS * 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
