// The cap-tier panel on the landing page.
//
// The property under test is the scoping: choosing a tier must show that tier's gainers and losers
// and nothing else, and each card must page and search over the *whole* tier rather than over the
// five rows it happens to be holding. That second half is why every assertion here is about the
// URL requested — the ranking, the paging and the search all live on the server.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierMovers } from "../../app/components/tier-movers";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

// The picker has its own suite and its own call to /api/stocks/suggest; here it stands in as a
// plain input so these tests drive the panel rather than the search box.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />,
}));

/** Every URL the panel has asked for, newest last. */
let asked: string[] = [];

function serve({ total = 40, rows = 5 }: { total?: number; rows?: number } = {}) {
  asked = [];
  global.fetch = jest.fn(async (url: string) => {
    asked.push(String(url));
    const params = new URL(String(url), "http://x").searchParams;
    const tier = params.get("tier");
    const direction = params.get("direction");
    const page = Number(params.get("page"));
    const size = Number(params.get("pageSize"));

    return {
      ok: true,
      json: async () => ({
        rows: Array.from({ length: rows }, (_, index) => ({
          code: `${tier}-${direction}-${page}-${index}`,
          ticker: `${tier}${direction}${page}${index}`.toUpperCase(),
          name: `${tier} ${direction} ${index}`,
          returnPercent: direction === "gainers" ? 5 + index : -(5 + index),
        })),
        period: "1d",
        periodFrom: null,
        total,
        page,
        pageSize: size,
        pages: Math.ceil(total / size),
        sessionDate: "2026-08-14",
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** The most recent URL asked for one side. */
function lastUrlFor(direction: "gainers" | "losers"): string {
  return [...asked].reverse().find((url) => url.includes(`direction=${direction}`)) ?? "";
}

describe("TierMovers", () => {
  it("opens on large cap and asks for both sides of it", async () => {
    serve();
    render(<TierMovers />);

    await waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2));
    expect(lastUrlFor("gainers")).toContain("tier=large");
    expect(lastUrlFor("losers")).toContain("tier=large");
    // Five a page, as the section asks for.
    expect(lastUrlFor("gainers")).toContain("pageSize=5");
  });

  it("shows only the chosen tier when the tier changes", async () => {
    const person = userEvent.setup();
    serve();
    render(<TierMovers />);
    await screen.findByRole("region", { name: "Top gainers — large" });

    await person.click(screen.getByRole("button", { name: "Mid cap" }));

    await waitFor(() => expect(lastUrlFor("gainers")).toContain("tier=mid"));
    expect(screen.getByRole("region", { name: "Top gainers — mid" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Top losers — mid" })).toBeInTheDocument();
    // The large-cap cards are gone, not merely hidden behind them.
    expect(screen.queryByRole("region", { name: "Top gainers — large" })).not.toBeInTheDocument();
  });

  it("pages over the whole tier rather than the rows on screen", async () => {
    const person = userEvent.setup();
    // Forty companies, five to a page: eight pages, none of which are in the browser at once.
    serve({ total: 40 });
    render(<TierMovers />);
    const card = await screen.findByRole("region", { name: "Top gainers — large" });

    // The card paints before its first response lands, so these wait for the figures.
    expect(await within(card).findByText("40 companies")).toBeInTheDocument();
    expect(within(card).getByText(/Page 1 of 8/)).toBeInTheDocument();

    await person.click(within(card).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrlFor("gainers")).toContain("page=2"));
  });

  it("sends the search to the server, so it reaches past the current page", async () => {
    const person = userEvent.setup();
    serve();
    render(<TierMovers />);
    const card = await screen.findByRole("region", { name: "Top gainers — large" });

    await person.type(within(card).getByLabelText("Search a company"), "RELI");

    // Debounced, then sent as `q=` — a client-side filter would only ever search five rows.
    await waitFor(() => expect(lastUrlFor("gainers")).toContain("q=RELI"), { timeout: 3000 });
  });

  it("offers a clear only once something has been typed, and drops the term when used", async () => {
    const person = userEvent.setup();
    serve();
    render(<TierMovers />);
    const card = await screen.findByRole("region", { name: "Top gainers — large" });

    expect(within(card).queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();

    await person.type(within(card).getByLabelText("Search a company"), "TCS");
    await waitFor(() => expect(lastUrlFor("gainers")).toContain("q=TCS"), { timeout: 3000 });

    await person.click(within(card).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(lastUrlFor("gainers")).not.toContain("q="), { timeout: 3000 });
  });

  it("numbers rows by their place in the whole ranking, not the page", async () => {
    const person = userEvent.setup();
    serve({ total: 40 });
    render(<TierMovers />);
    const card = await screen.findByRole("region", { name: "Top gainers — large" });

    // Scoped to the list: the pager renders page numbers too, and "1" would match both.
    const list = await within(card).findByRole("list");
    expect(await within(list).findByText("1")).toBeInTheDocument();

    await person.click(within(card).getByRole("button", { name: "Next" }));
    // Page two starts at six, so paging reads as one continuous list.
    await waitFor(() => expect(within(within(card).getByRole("list")).getByText("6")).toBeInTheDocument());
  });

  it("says so when a search matches nothing in the tier", async () => {
    serve({ rows: 0 });
    render(<TierMovers />);

    const card = await screen.findByRole("region", { name: "Top gainers — large" });
    await waitFor(() => expect(within(card).getByText("Nothing higher in this tier today.")).toBeInTheDocument());
  });

  it("surfaces a feed it could not reach without losing the card", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<TierMovers />);

    expect(await screen.findAllByText(/Couldn't reach the market data feed/)).not.toHaveLength(0);
  });
});
