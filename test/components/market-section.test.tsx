import { render, screen, waitFor } from "@testing-library/react";
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
  usePaged,
} from "../../app/components/market-section";

function Probe({ url }: { url: string }) {
  const { data, loading, error } = useMarketFeed<{ value: string }>(url);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
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
