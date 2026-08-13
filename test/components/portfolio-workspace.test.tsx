import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AllocationBars,
  HoldingCard,
  HoldingForm,
  HoldingGroup,
  PortfolioTotals,
  PortfolioWorkspace,
  formFor,
} from "../../app/components/portfolio-workspace";
import type { Holding } from "../../app/lib/portfolio";
import { summarisePortfolio, type PriceSnapshot } from "../../app/lib/portfolio-metrics";

// The AI panels have suites of their own; here they would only add two network calls to every
// test in this file and assert nothing this component is responsible for.
jest.mock("../../app/components/ai-board-read", () => ({
  AiBoardRead: ({ feature }: { feature: string }) => <div data-testid="ai-board-read">{feature}</div>,
}));

jest.mock("../../app/components/stock-explorer", () => ({
  StockExplorer: ({ onSelect }: { onSelect: (symbol: string) => void }) => (
    <button type="button" onClick={() => onSelect("TCS")}>
      Pick TCS
    </button>
  ),
}));

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "hold_1",
    userId: "user_1",
    symbol: "RELIANCE",
    quantity: 10,
    avgPrice: 1000,
    targetPrice: null,
    note: null,
    addedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const PRICES: PriceSnapshot[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", price: 1200, previousClose: 1150, oneMonth: 4, sixMonth: 9, oneYear: 21, capTier: "Large" },
];

function summaryOf(holdings: Holding[], prices: PriceSnapshot[] = PRICES) {
  return summarisePortfolio(holdings, new Map(prices.map((price) => [price.symbol, price])));
}

/** The portfolio endpoint answers with `holdings`; the price endpoint with `results`. */
function serve({ holdings = [holding()], ok = true, error = "" }: { holdings?: Holding[]; ok?: boolean; error?: string } = {}) {
  const mock = jest.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).includes("/api/market/performance")) {
      return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
    }
    return { ok, json: async () => (ok ? { holdings, max: 40, backend: "file" } : { error }) } as unknown as Response;
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/**
 * Waits for the workspace's first paint, whichever state it settled into.
 *
 * `priced` waits for the price feed as well, and matters more than it looks: an unpriced holding
 * sits under "Tracked only" and moves to "Performing" the moment its price lands, which replaces
 * the card's DOM node. A button queried before that is detached by the time it is clicked, and the
 * click lands on nothing at all.
 */
async function settled({ priced = false } = {}) {
  await waitFor(() => expect(screen.queryByText("Loading your portfolio...")).not.toBeInTheDocument());
  if (priced) await waitFor(() => expect(screen.getAllByText("₹1,200").length).toBeGreaterThan(0));
}

describe("formFor", () => {
  it("shows a zero as an empty field, so a placeholder is not overwritten by a meaningless 0", () => {
    expect(formFor(holding({ quantity: 0, avgPrice: 0, targetPrice: null, note: null }))).toEqual({
      symbol: "RELIANCE",
      quantity: "",
      avgPrice: "",
      targetPrice: "",
      note: "",
    });
  });

  it("carries the stored position into the fields", () => {
    expect(formFor(holding({ quantity: 10, avgPrice: 1000, targetPrice: 1500, note: "core" }))).toEqual({
      symbol: "RELIANCE",
      quantity: "10",
      avgPrice: "1000",
      targetPrice: "1500",
      note: "core",
    });
  });
});

describe("PortfolioTotals", () => {
  it("reports cost, value, the gap and today's move", () => {
    render(<PortfolioTotals summary={summaryOf([holding()])} />);

    expect(screen.getByText("₹12,000")).toBeInTheDocument();
    expect(screen.getByText("₹10,000")).toBeInTheDocument();
    expect(screen.getByText("+₹2,000")).toBeInTheDocument();
    expect(screen.getByText("+₹500")).toBeInTheDocument();
  });
});

describe("AllocationBars", () => {
  it("splits market value by company size and names the largest position", () => {
    render(<AllocationBars summary={summaryOf([holding()])} />);

    expect(screen.getByText("Large cap")).toBeInTheDocument();
    expect(screen.getByText("₹12,000 · 100%")).toBeInTheDocument();
    expect(screen.getByText(/Largest single position is/)).toBeInTheDocument();
  });

  it("asks for a quantity when there is nothing owned to spread", () => {
    render(<AllocationBars summary={summaryOf([holding({ quantity: 0, avgPrice: 0 })])} />);

    expect(screen.getByText("Add a position with a quantity to see how the money is spread.")).toBeInTheDocument();
  });
});

describe("HoldingCard", () => {
  const card = (holdings: Holding[], prices?: PriceSnapshot[]) => summaryOf(holdings, prices).holdings[0];

  it("shows the position, what it is worth and how it has run", () => {
    render(<HoldingCard holding={card([holding()])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries")).toBeInTheDocument();
    expect(screen.getByText("+₹2,000")).toBeInTheDocument();
    expect(screen.getByText("₹10,000 invested")).toBeInTheDocument();
    expect(screen.getByText("+21.00%")).toBeInTheDocument();
  });

  it("says when a row is tracked rather than owned", () => {
    render(<HoldingCard holding={card([holding({ quantity: 0, avgPrice: 0 })])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText(/Tracked, not owned/)).toBeInTheDocument();
  });

  it("says so rather than inventing a name when the feed has no price", () => {
    render(<HoldingCard holding={card([holding({ symbol: "NOPRICE" })], [])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText("Live price unavailable")).toBeInTheDocument();
  });

  it("shows progress towards a target, and the dash when it cannot be measured", () => {
    const { unmount } = render(
      <HoldingCard holding={card([holding({ targetPrice: 1500 })])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />,
    );
    expect(screen.getByText("40% there")).toBeInTheDocument();
    unmount();

    render(
      <HoldingCard
        holding={card([holding({ symbol: "NOPRICE", targetPrice: 1500 })], [])}
        busy={false}
        onEdit={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    const target = screen.getByText(/^Target/).closest("div") as HTMLElement;
    expect(within(target).getByText("—")).toBeInTheDocument();
  });

  it("wears the direction of the position, including when it is down", () => {
    const losing = card([holding({ avgPrice: 2000 })]);
    const { container } = render(<HoldingCard holding={losing} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(container.querySelector(".from-rose-500")).toBeInTheDocument();
  });

  it("wears no direction at all while the price is unknown", () => {
    const { container } = render(
      <HoldingCard holding={card([holding({ symbol: "NOPRICE" })], [])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />,
    );

    expect(container.querySelector(".bg-slate-200")).toBeInTheDocument();
  });

  it("shows the reader's own note when they left one", () => {
    render(<HoldingCard holding={card([holding({ note: "core holding" })])} busy={false} onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText("core holding")).toBeInTheDocument();
  });

  it("hands its own row back on edit, and the symbol on remove", async () => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    render(<HoldingCard holding={card([holding()])} busy={false} onEdit={onEdit} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ symbol: "RELIANCE", avgPrice: 1000 }));
    expect(onRemove).toHaveBeenCalledWith("RELIANCE");
  });

  it("locks its actions while a save is in flight", () => {
    render(<HoldingCard holding={card([holding()])} busy onEdit={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });
});

describe("HoldingGroup", () => {
  const rows = summaryOf([holding()]).holdings;

  it("heads the band with its count and its own running total", () => {
    render(
      <HoldingGroup
        title="Performing"
        blurb="Worth at least what you paid."
        accent=""
        total="+₹2,000"
        holdings={rows}
        empty="Nothing here."
        busy={false}
        onEdit={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Performing (1)" })).toBeInTheDocument();
    // Twice: once as the band's running total, once on the single card that makes it up.
    expect(screen.getAllByText("+₹2,000")).toHaveLength(2);
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
  });

  it("says what an empty band means rather than showing a bare heading", () => {
    render(
      <HoldingGroup
        title="Not performing"
        blurb="Below what you paid."
        accent=""
        total="—"
        holdings={[]}
        empty="Nothing is behind its cost."
        busy={false}
        onEdit={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Nothing is behind its cost.")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
  });
});

describe("HoldingForm", () => {
  const values = { symbol: "RELIANCE", quantity: "10", avgPrice: "1000", targetPrice: "", note: "" };

  it("offers the picker when adding and hides it when editing", () => {
    const { unmount } = render(
      <HoldingForm values={{ ...values, symbol: "" }} editing={false} busy={false} onChange={jest.fn()} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Pick TCS" })).toBeInTheDocument();
    unmount();

    render(<HoldingForm values={values} editing busy={false} onChange={jest.fn()} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Pick TCS" })).not.toBeInTheDocument();
    expect(screen.getByText("Edit RELIANCE")).toBeInTheDocument();
  });

  it("reports every field the reader changes", async () => {
    const onChange = jest.fn();
    render(
      <HoldingForm values={{ ...values, symbol: "" }} editing={false} busy={false} onChange={onChange} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Pick TCS" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ symbol: "TCS" }));

    await userEvent.type(screen.getByLabelText(/Quantity/), "5");
    await userEvent.type(screen.getByLabelText(/Average buy price/), "5");
    await userEvent.type(screen.getByLabelText(/Target price/), "5");
    await userEvent.type(screen.getByLabelText(/Why you hold it/), "x");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ avgPrice: "10005" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ targetPrice: "5" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ note: "x" }));
  });

  it("cannot be submitted without a stock, and reports the submit when it has one", async () => {
    const onSubmit = jest.fn();
    const { unmount } = render(
      <HoldingForm values={{ ...values, symbol: "" }} editing={false} busy={false} onChange={jest.fn()} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Add to portfolio" })).toBeDisabled();
    unmount();

    render(<HoldingForm values={values} editing={false} busy={false} onChange={jest.fn()} onSubmit={onSubmit} onCancel={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to portfolio" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("says it is saving, and can be abandoned", async () => {
    const onCancel = jest.fn();
    render(<HoldingForm values={values} editing busy onChange={jest.fn()} onSubmit={jest.fn()} onCancel={onCancel} />);

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("PortfolioWorkspace", () => {
  it("loads the portfolio, prices it, and reviews it", async () => {
    serve();

    render(<PortfolioWorkspace />);
    await settled();

    // Twice over: once in the totals strip, once on the card it came from.
    await waitFor(() => expect(screen.getAllByText("₹12,000")).toHaveLength(2));
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByTestId("ai-board-read")).toHaveTextContent("portfolio");
  });

  it("invites a first holding rather than showing an empty grid", async () => {
    serve({ holdings: [] });

    render(<PortfolioWorkspace />);
    await settled();

    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    // With no holdings there is nothing for the desk to read, so the panel stays away.
    expect(screen.queryByTestId("ai-board-read")).not.toBeInTheDocument();
  });

  it("adds a stock the reader picked", async () => {
    const fetchMock = serve({ holdings: [] });

    render(<PortfolioWorkspace />);
    await settled();

    await userEvent.click(screen.getByRole("button", { name: "+ Add a stock to your portfolio" }));
    await userEvent.click(screen.getByRole("button", { name: "Pick TCS" }));
    await userEvent.type(screen.getByLabelText(/Quantity/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add to portfolio" }));

    await waitFor(() => expect(screen.getByText("TCS saved.")).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toMatchObject({ symbol: "TCS", quantity: "5" });
  });

  it("opens an existing holding for editing with its figures already in the fields", async () => {
    serve({ holdings: [holding({ targetPrice: 1500, note: "core" })] });

    render(<PortfolioWorkspace />);
    await settled({ priced: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Edit RELIANCE")).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/)).toHaveValue(10);
    expect(screen.getByLabelText(/Target price/)).toHaveValue(1500);
  });

  it("removes a holding", async () => {
    const fetchMock = serve();

    render(<PortfolioWorkspace />);
    await settled({ priced: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));

    await waitFor(() => expect(screen.getByText("RELIANCE removed.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio?symbol=RELIANCE",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows the reason the server gave for refusing a load, a save or a removal", async () => {
    serve({ ok: false, error: "Sign in to use your portfolio." });
    const { unmount } = render(<PortfolioWorkspace />);
    // Nothing loaded, so nothing is priced — the plain wait is the right one here.
    await settled();
    expect(screen.getByText("Sign in to use your portfolio.")).toBeInTheDocument();
    unmount();

    // A save that is refused keeps the form open with the reason above it.
    const failSave = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
      if (init?.method === "POST") return { ok: false, json: async () => ({ error: "That is not a symbol this exchange lists." }) } as unknown as Response;
      if (init?.method === "DELETE") return { ok: false, json: async () => ({ error: "That stock is not in your portfolio." }) } as unknown as Response;
      return { ok: true, json: async () => ({ holdings: [holding()], max: 40, backend: "file" }) } as unknown as Response;
    });
    global.fetch = failSave as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled({ priced: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));
    await waitFor(() => expect(screen.getByText("That stock is not in your portfolio.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("That is not a symbol this exchange lists.")).toBeInTheDocument());
  });

  it("falls back to its own words when the server refuses without giving a reason", async () => {
    const silent = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
      if (init?.method) return { ok: false, json: async () => ({}) } as unknown as Response;
      return { ok: true, json: async () => ({ holdings: [holding()] }) } as unknown as Response;
    });
    global.fetch = silent as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled({ priced: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));
    await waitFor(() => expect(screen.getByText("That stock could not be removed.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("That holding was refused.")).toBeInTheDocument());
  });

  it("reports a portfolio it could not reach, and one it could not write to", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const { unmount } = render(<PortfolioWorkspace />);
    await waitFor(() => expect(screen.getByText("Couldn't reach your portfolio.")).toBeInTheDocument());
    unmount();

    const failWrites = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
      if (init?.method) throw new Error("offline");
      return { ok: true, json: async () => ({ holdings: [holding()] }) } as unknown as Response;
    });
    global.fetch = failWrites as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled({ priced: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));
    await waitFor(() => expect(screen.getByText("Couldn't reach your portfolio.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Couldn't save that holding.")).toBeInTheDocument());
  });

  it.each([
    ["refuses the request", { ok: false, body: {} }],
    ["answers with no prices in it", { ok: true, body: {} }],
  ])("leaves the cards showing dashes when the price feed %s", async (_case, feed) => {
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes("/api/market/performance")) {
        return { ok: feed.ok, json: async () => feed.body } as unknown as Response;
      }
      return { ok: true, json: async () => ({ holdings: [holding()] }) } as unknown as Response;
    }) as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled();

    // The holding is still the reader's to manage; only its live figures are missing.
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Live price unavailable")).toBeInTheDocument();
  });

  it("says how many owned positions it could not price", async () => {
    serve({ holdings: [holding(), holding({ id: "hold_2", symbol: "NOPRICE", quantity: 5, avgPrice: 100 })] });

    render(<PortfolioWorkspace />);
    await settled();

    await waitFor(() =>
      expect(screen.getByText(/1 owned position\(s\) could not be priced just now/)).toBeInTheDocument(),
    );
  });

  it("falls back to its own words when a load is refused without a reason", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled();

    expect(screen.getByText("Couldn't load your portfolio.")).toBeInTheDocument();
  });

  it("copes with a load and a write that answer without a portfolio in them", async () => {
    // Neither response carries `holdings`. Every one of these paths has to settle on an empty
    // portfolio rather than on `undefined`, which would take the whole page down on the next render.
    const bare = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) return { ok: true, json: async () => ({}) } as unknown as Response;
      if (init?.method) return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    global.fetch = bare as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled();

    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ Add a stock to your portfolio" }));
    await userEvent.click(screen.getByRole("button", { name: "Pick TCS" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to portfolio" }));

    await waitFor(() => expect(screen.getByText("TCS saved.")).toBeInTheDocument());
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it("copes with a removal that answers without a portfolio in it", async () => {
    const bare = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
      if (init?.method) return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      return { ok: true, json: async () => ({ holdings: [holding()] }) } as unknown as Response;
    });
    global.fetch = bare as unknown as typeof fetch;

    render(<PortfolioWorkspace />);
    await settled({ priced: true });

    await userEvent.click(screen.getByRole("button", { name: "Remove RELIANCE from portfolio" }));

    await waitFor(() => expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument());
  });

  it("abandons the price request when the reader leaves", async () => {
    const seen: (AbortSignal | undefined)[] = [];

    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/market/performance")) {
        seen.push(init?.signal ?? undefined);
        return { ok: true, json: async () => ({ results: PRICES }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ holdings: [holding()] }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const { unmount } = render(<PortfolioWorkspace />);
    await waitFor(() => expect(seen).toHaveLength(1));

    unmount();

    // The in-flight request is cancelled rather than left to settle into a component that has gone.
    expect(seen[0]?.aborted).toBe(true);
  });

  it("abandons the form without saving", async () => {
    serve({ holdings: [] });

    render(<PortfolioWorkspace />);
    await settled();

    await userEvent.click(screen.getByRole("button", { name: "+ Add a stock to your portfolio" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "+ Add a stock to your portfolio" })).toBeInTheDocument();
  });
});
