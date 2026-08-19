import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  MarketSection,
  Pager,
  pageWindow,
  PillTabs,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  type Prefetched,
  usePaged,
} from "../../app/components/market-section";

function Probe({
  url,
  prefetched,
  refreshMs,
  refreshNow,
}: {
  url: string;
  prefetched?: Prefetched<{ value: string }>;
  refreshMs?: number;
  refreshNow?: boolean;
}) {
  const { data, loading, updating, error } = useMarketFeed<{ value: string }>(url, prefetched, { refreshMs, refreshNow });
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="updating">{String(updating)}</span>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="value">{data?.value ?? ""}</span>
    </div>
  );
}

describe("useMarketFeed", () => {
  it("starts loading, then exposes the payload", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ value: "ok" }) } as Response);
    render(<Probe url="/api/test" />);

    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("ok"));
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(global.fetch).toHaveBeenCalledWith("/api/test");
  });

  it("reports an error when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    render(<Probe url="/api/test" />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(/Couldn't reach the market data feed/));
  });

  it("reports an error when the fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<Probe url="/api/test" />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(/Couldn't reach the market data feed/));
  });

  // The server resolves a board's opening payload and sends it with the page. Using it removes a
  // whole round trip from what the reader waits through: there is no loading state to pass
  // through and no request to make.
  it("opens on the payload the server already resolved, without asking for it", async () => {
    global.fetch = jest.fn();
    render(<Probe url="/api/test" prefetched={{ url: "/api/test", data: { value: "from the server" } }} />);

    expect(screen.getByTestId("value")).toHaveTextContent("from the server");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
  });

  // A payload only answers the URL it was resolved for. A board rendered on different filters is
  // asking a different question, so the prefetch is ignored rather than shown as its answer.
  it("ignores a payload that answers a different request", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ value: "fetched" }) } as Response);
    render(<Probe url="/api/test?page=2" prefetched={{ url: "/api/test", data: { value: "from the server" } }} />);

    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("fetched"));
    expect(global.fetch).toHaveBeenCalledWith("/api/test?page=2");
  });

  /**
   * The server's payload is spent once.
   *
   * A reader who changes a filter and then changes it back is asking for the opening view again —
   * but time has passed, so they get a fresh answer rather than figures from whenever the page was
   * rendered.
   */
  it("refetches the opening view if the reader returns to it", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ value: "fetched" }) } as Response);
    const prefetched = { url: "/api/test", data: { value: "from the server" } };

    const { rerender } = render(<Probe url="/api/test" prefetched={prefetched} />);
    expect(screen.getByTestId("value")).toHaveTextContent("from the server");

    rerender(<Probe url="/api/test?page=2" prefetched={prefetched} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/test?page=2"));

    rerender(<Probe url="/api/test" prefetched={prefetched} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/test"));
  });

  /**
   * The case behind "the table does not update when I change the filters".
   *
   * Two of the boards on this hook take tens of seconds to answer, so a reader who changes a filter
   * mid-flight leaves two requests racing — and the loser was landing last and winning. Nothing tied
   * a response to the request it came from, so the answer to the filters they had left overwrote the
   * answer to the filters they were on, and the table sat there disagreeing with its own controls.
   */
  it("does not let a superseded response overwrite the current one", async () => {
    const settle: Record<string, (value: unknown) => void> = {};
    global.fetch = jest.fn(
      (url: string) =>
        new Promise((resolve) => {
          settle[String(url)] = resolve;
        }),
    ) as unknown as typeof fetch;

    const { rerender } = render(<Probe url="/api/test?tier=all" />);
    await waitFor(() => expect(settle["/api/test?tier=all"]).toBeDefined());

    // The reader changes the filter while the first request is still in flight.
    rerender(<Probe url="/api/test?tier=large" />);
    await waitFor(() => expect(settle["/api/test?tier=large"]).toBeDefined());

    // The new filter's answer arrives first.
    await act(async () => {
      settle["/api/test?tier=large"]({ ok: true, json: async () => ({ value: "large caps" }) });
    });
    expect(screen.getByTestId("value")).toHaveTextContent("large caps");

    // Then the old one turns up. It must be dropped, not applied over the top.
    await act(async () => {
      settle["/api/test?tier=all"]({ ok: true, json: async () => ({ value: "whole exchange" }) });
    });
    expect(screen.getByTestId("value")).toHaveTextContent("large caps");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  /**
   * A changed filter reports itself as `updating` rather than as `loading`.
   *
   * The distinction is the whole point: `loading` is the empty board and draws a skeleton, while a
   * filter change keeps the last real figures on screen — these boards take seconds to answer, and
   * twenty seconds of skeleton over readable numbers is worse than the numbers plus a caller-drawn
   * "being replaced". What it must not do is call them the answer to the new filters.
   */
  it("reports a changed filter as updating, keeping the last figures on screen", async () => {
    const settle: Record<string, (value: unknown) => void> = {};
    global.fetch = jest.fn(
      (url: string) =>
        new Promise((resolve) => {
          settle[String(url)] = resolve;
        }),
    ) as unknown as typeof fetch;

    const { rerender } = render(<Probe url="/api/test?tier=all" />);
    await waitFor(() => expect(settle["/api/test?tier=all"]).toBeDefined());
    await act(async () => {
      settle["/api/test?tier=all"]({ ok: true, json: async () => ({ value: "whole exchange" }) });
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("updating")).toHaveTextContent("false");

    rerender(<Probe url="/api/test?tier=large" />);
    expect(screen.getByTestId("updating")).toHaveTextContent("true");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("value")).toHaveTextContent("whole exchange");

    await act(async () => {
      settle["/api/test?tier=large"]({ ok: true, json: async () => ({ value: "large caps" }) });
    });
    expect(screen.getByTestId("updating")).toHaveTextContent("false");
    expect(screen.getByTestId("value")).toHaveTextContent("large caps");
  });

  // A failed request for the previous filters is the same story: it belongs to a question the
  // reader has moved on from, so it must not raise a banner over the one they are waiting for.
  it("drops a superseded failure too", async () => {
    const reject: Record<string, (reason: unknown) => void> = {};
    global.fetch = jest.fn(
      (url: string) =>
        new Promise((_resolve, rejectIt) => {
          reject[String(url)] = rejectIt;
        }),
    ) as unknown as typeof fetch;

    const { rerender } = render(<Probe url="/api/test?tier=all" />);
    await waitFor(() => expect(reject["/api/test?tier=all"]).toBeDefined());

    rerender(<Probe url="/api/test?tier=large" />);
    await waitFor(() => expect(reject["/api/test?tier=large"]).toBeDefined());

    await act(async () => {
      reject["/api/test?tier=all"](new Error("gave up"));
    });

    // Nothing has answered yet, so the board is still on its first load rather than updating —
    // and it is waiting on the current request, not reporting the abandoned one's failure.
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
  });
});

/**
 * Refreshing in place, which is what keeps a market board from being a photograph.
 *
 * The case these are about is the one a reader cannot see going wrong: a page left open across the
 * close, or simply open for an hour, showing figures that stopped being true without anything on
 * screen admitting it.
 *
 * Real timers on a very short interval rather than fake ones: each tick ends in a fetch whose
 * promise has to settle before the DOM changes, and driving that by hand is a lot of ceremony to
 * test a `setInterval`.
 */
describe("useMarketFeed refreshing", () => {
  /** Long enough for a 20ms interval to have fired and settled, short enough not to pad the suite. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  it("re-asks on the interval and swaps the payload in place", async () => {
    let served = 0;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ value: `print ${++served}` }) }) as Response);

    render(<Probe url="/api/test" refreshMs={20} />);
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("print 1"));

    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("print 2"));
    // Never back to a skeleton: the reader's eye is on the numbers, and blanking them every tick
    // would be worse than not refreshing at all.
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("makes no request at all while the tab is in the background", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ value: "ok" }) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<Probe url="/api/test" refreshMs={20} />);

    // The opening fetch is not a refresh and happens regardless — it is the board being drawn.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("refreshes the moment a slept-through tab is looked at again", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ value: "ok" }) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    // No interval, so the only thing that can ask again is the tab coming back to the foreground.
    render(<Probe url="/api/test" refreshMs={600_000} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("keeps the figures on screen when a background refresh fails", async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) return { ok: true, json: async () => ({ value: "the last good print" }) } as Response;
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<Probe url="/api/test" refreshMs={20} />);
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("the last good print"));
    await waitFor(() => expect(call).toBeGreaterThan(1));

    // Real figures the server confirmed a moment ago beat an error banner over the top of them.
    expect(screen.getByTestId("value")).toHaveTextContent("the last good print");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  });

  it("stays a photograph when no interval is asked for", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ value: "ok" }) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Probe url="/api/test" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fills in an incomplete server payload straight away, without a skeleton", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ value: "the fuller answer" }) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <Probe
        url="/api/test"
        prefetched={{ url: "/api/test", data: { value: "what the server could resolve" } }}
        refreshNow
      />,
    );

    // The server's rows are on screen from the first frame — that is the whole point of prefetching
    // them — and are replaced in place once the fuller answer lands.
    expect(screen.getByTestId("value")).toHaveTextContent("what the server could resolve");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("the fuller answer"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("spends a complete server payload without asking again", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Probe url="/api/test" prefetched={{ url: "/api/test", data: { value: "complete" } }} />);
    await settle();

    expect(screen.getByTestId("value")).toHaveTextContent("complete");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes a zero interval as no interval", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ value: "ok" }) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Probe url="/api/test" refreshMs={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("MarketSection", () => {
  it("renders the eyebrow, title, blurb, aside and children", () => {
    render(
      <MarketSection
        id="probe"
        eyebrow="Most traded"
        title="Where the money went"
        blurb="A blurb."
        aside={<span>aside content</span>}
      >
        <p>child content</p>
      </MarketSection>,
    );

    expect(screen.getByText("Most traded")).toBeInTheDocument();
    expect(screen.getByText("Where the money went")).toBeInTheDocument();
    expect(screen.getByText("A blurb.")).toBeInTheDocument();
    expect(screen.getByText("aside content")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(document.getElementById("probe")).toBeInTheDocument();
  });

  it("renders without an id, an aside or a custom eyebrow colour", () => {
    render(
      <MarketSection eyebrow="Plain" title="Title" blurb="Blurb">
        <p>body</p>
      </MarketSection>,
    );
    expect(screen.getByText("Plain")).toHaveClass("text-emerald-600");
  });
});

describe("SectionError, SectionSkeleton and SectionFootnote", () => {
  it("renders the error message", () => {
    render(<SectionError message="It broke" />);
    expect(screen.getByText("It broke")).toBeInTheDocument();
  });

  it("renders the requested number of skeleton rows", () => {
    const { container } = render(<SectionSkeleton rows={3} height="h-10" />);
    const rows = container.querySelectorAll(".animate-pulse");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass("h-10");
  });

  it("falls back to four rows at the default height", () => {
    const { container } = render(<SectionSkeleton />);
    const rows = container.querySelectorAll(".animate-pulse");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveClass("h-16");
  });

  it("renders the footnote", () => {
    render(<SectionFootnote>Source note</SectionFootnote>);
    expect(screen.getByText("Source note")).toBeInTheDocument();
  });
});

describe("PillTabs", () => {
  function Harness() {
    const [value, setValue] = useState("a");
    return (
      <PillTabs
        label="Choice"
        value={value}
        onChange={setValue}
        options={[
          { key: "a", label: "Alpha", count: 3 },
          { key: "b", label: "Beta" },
        ]}
      />
    );
  }

  it("marks the active tab and switches on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const alpha = screen.getByRole("tab", { name: /Alpha/ });
    const beta = screen.getByRole("tab", { name: "Beta" });

    expect(alpha).toHaveAttribute("aria-selected", "true");
    expect(beta).toHaveAttribute("aria-selected", "false");
    // The count only renders for options that carry one.
    expect(alpha).toHaveTextContent("(3)");
    expect(beta).not.toHaveTextContent("(");

    await user.click(beta);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tablist")).toHaveAccessibleName("Choice");
  });
});

describe("pageWindow", () => {
  it("centres a run of pages on the current one", () => {
    expect(pageWindow(5, 20)).toEqual([3, 4, 5, 6, 7]);
  });

  it("clamps to the start and the end rather than running off either edge", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
  });

  it("shows every page when there are fewer than a window's worth", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it("takes a wider window when asked", () => {
    expect(pageWindow(5, 20, 3)).toEqual([4, 5, 6]);
  });
});

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

function Paged({ rows = LETTERS, size = 5, resetKey = "all" }: { rows?: string[]; size?: number; resetKey?: string }) {
  const paged = usePaged(rows, size, resetKey);
  return (
    <div>
      <p data-testid="slice">{paged.slice.join("")}</p>
      <p data-testid="range">{`${paged.from}-${paged.to} of ${paged.total}`}</p>
      <Pager paged={paged} unit="letters" />
    </div>
  );
}

describe("usePaged and Pager", () => {
  it("shows the first page and counts the whole list", () => {
    render(<Paged />);

    expect(screen.getByTestId("slice")).toHaveTextContent("abcde");
    expect(screen.getByTestId("range")).toHaveTextContent("1-5 of 26");
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
  });

  it("walks forward and back a page at a time", async () => {
    const user = userEvent.setup();
    render(<Paged />);

    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByTestId("slice")).toHaveTextContent("fghij");

    await user.click(screen.getByRole("button", { name: "← Prev" }));
    expect(screen.getByTestId("slice")).toHaveTextContent("abcde");
  });

  it("jumps straight to a numbered page", async () => {
    const user = userEvent.setup();
    render(<Paged />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(screen.getByTestId("slice")).toHaveTextContent("klmno");
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
  });

  it("disables the ends so paging can never walk out of range", async () => {
    const user = userEvent.setup();
    render(<Paged />);

    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();

    // Page six is outside the initial window, so it is reached by walking to the end.
    await user.click(screen.getByRole("button", { name: "Page 5" }));
    await user.click(screen.getByRole("button", { name: "Next →" }));
    // 26 letters at five a page leaves one on the last page.
    expect(screen.getByTestId("slice")).toHaveTextContent("z");
    expect(screen.getByTestId("range")).toHaveTextContent("26-26 of 26");
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  // Switching tab is switching lists; landing on page four of a shorter one is a dead end.
  it("returns to the first page when the list it is paging changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Paged resetKey="first" />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(screen.getByTestId("slice")).toHaveTextContent("klmno");

    rerender(<Paged resetKey="second" />);
    expect(screen.getByTestId("slice")).toHaveTextContent("abcde");
  });

  // A list that shrinks under a reader shows them its new last page, never an empty one.
  it("clamps a stale page to the end of a shorter list", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Paged />);

    await user.click(screen.getByRole("button", { name: "Page 4" }));
    expect(screen.getByTestId("slice")).toHaveTextContent("pqrst");

    rerender(<Paged rows={LETTERS.slice(0, 8)} />);
    expect(screen.getByTestId("slice")).toHaveTextContent("fgh");
  });

  it("hides the pager entirely when everything fits on one page", () => {
    render(<Paged rows={["a", "b"]} />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByTestId("range")).toHaveTextContent("1-2 of 2");
  });

  it("reports an empty range for an empty list", () => {
    render(<Paged rows={[]} />);
    expect(screen.getByTestId("range")).toHaveTextContent("0-0 of 0");
  });
});
