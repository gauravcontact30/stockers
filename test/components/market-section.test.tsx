import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  MarketSection,
  PillTabs,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
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
