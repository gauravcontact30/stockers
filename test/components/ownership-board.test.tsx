import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnershipBoard, formatHolders, formatPercent, type Ownership } from "../../app/components/ownership-board";

// The board embeds the exchange-wide search box, which has a suite of its own. Stubbed here to an
// input plus a "pick" button so these tests are about the ownership board, not the combobox.
jest.mock("../../app/components/stock-combobox", () => ({
  StockCombobox: (props: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (symbol: string) => void;
    placeholder?: string;
  }) => (
    <div>
      <input placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      <button type="button" onClick={() => props.onSelect?.("tcs")}>
        pick TCS
      </button>
      <button type="button" onClick={() => props.onSelect?.("  ")}>
        pick nothing
      </button>
    </div>
  ),
}));

const RELIANCE: Ownership = {
  symbol: "RELIANCE",
  company: "Reliance Industries Limited",
  quarter: "30-JUN-2026",
  groups: [
    {
      key: "promoters",
      label: "Promoters & insiders",
      percent: 50.48,
      holders: 47,
      detail: [
        { label: "Promoter bodies (Indian)", percent: 49.64, holders: 41 },
        { label: "Promoter individuals & HUF", percent: 0.84, holders: 6 },
      ],
    },
    {
      key: "dii",
      label: "Domestic institutional investors",
      percent: 21.18,
      holders: 378,
      detail: [{ label: "Mutual funds & UTI", percent: 10.11, holders: 78 }],
    },
    {
      key: "fii",
      label: "Foreign institutional investors",
      percent: 17.19,
      holders: 1542,
      detail: [{ label: "FPIs — Category I", percent: 16.52, holders: 1360 }],
    },
    {
      key: "retail",
      label: "Retail & individual investors",
      percent: 9.15,
      holders: 4569184,
      detail: [{ label: "Small investors (up to ₹2 lakh)", percent: 7.16, holders: 4472327 }],
    },
    { key: "government", label: "Government", percent: 0.09, holders: 74, detail: [] },
    { key: "bodies", label: "Corporate bodies & trusts", percent: 1.9, holders: 80638, detail: [] },
    { key: "others", label: "Unclassified in the filing", percent: 0.01, holders: null, detail: [] },
  ],
  investorTypes: [
    { key: "retail", label: "Retail & individuals", percent: 9.15 },
    { key: "dii", label: "Institutional (FII + DII)", percent: 38.37 },
    { key: "promoters", label: "Promoters & insiders", percent: 50.48 },
  ],
  foreignPercent: 17.76,
  totalHolders: 4651863,
  history: [
    { quarter: "31-MAR-2026", promoter: 50, publicHeld: 50 },
    { quarter: "30-JUN-2026", promoter: 50.48, publicHeld: 49.52 },
  ],
  filedOn: "16-JUL-2026",
  source: "NSE — quarterly shareholding pattern filed under SEBI LODR",
};

const TCS: Ownership = {
  ...RELIANCE,
  symbol: "TCS",
  company: "Tata Consultancy Services Limited",
  totalHolders: null,
  groups: [{ key: "promoters", label: "Promoters & insiders", percent: 71.77, holders: 3, detail: [] }],
};

function mockRouted(handler: (url: string) => { ok: boolean; body: unknown }) {
  const fetchMock = jest.fn((url: string) => {
    const { ok, body } = handler(url);
    return Promise.resolve({ ok, json: async () => body } as Response);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("formatPercent", () => {
  it("reports two decimals, the way the filing does", () => {
    expect(formatPercent(50.4832)).toBe("50.48%");
    expect(formatPercent(0)).toBe("0.00%");
  });
});

describe("formatHolders", () => {
  it("reads shareholder counts in Indian units", () => {
    expect(formatHolders(4651863)).toBe("46.52 lakh");
    expect(formatHolders(12_500_000)).toBe("1.25 crore");
    expect(formatHolders(1542)).toBe("1,542");
  });

  it("says nothing rather than zero when the count is missing", () => {
    expect(formatHolders(null)).toBe("—");
    expect(formatHolders(Number.NaN)).toBe("—");
  });
});

describe("OwnershipBoard", () => {
  it("opens on Reliance and asks for its filing", async () => {
    const fetchMock = mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);

    expect(await screen.findByText("Reliance Industries Limited")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/market/shareholding?symbol=RELIANCE", expect.anything());
    expect(screen.getByText("RELIANCE · as filed for the quarter ended 30-JUN-2026")).toBeInTheDocument();
  });

  it("shows every shareholder class with its share and how many holders sit behind it", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);

    await screen.findByText("Reliance Industries Limited");

    // Named twice on purpose: once as a class of the register, once in the investor-type split.
    expect(screen.getAllByText("Promoters & insiders")).toHaveLength(2);
    expect(screen.getAllByText("50.48%").length).toBeGreaterThan(0);
    expect(screen.getByText("Foreign institutional investors")).toBeInTheDocument();
    expect(screen.getByText("17.19%")).toBeInTheDocument();
    // Retail is the one class measured in millions of people.
    expect(screen.getByText("45.69 lakh shareholders")).toBeInTheDocument();
    // A class the filing does not break holders out for says so rather than showing a zero.
    expect(screen.getByText("Holder count not broken out")).toBeInTheDocument();

    expect(screen.getByText("46.52 lakh")).toBeInTheDocument();
    expect(screen.getByText("17.76%")).toBeInTheDocument();
  });

  it("opens and closes a class's sub-categories", async () => {
    const user = userEvent.setup();
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    expect(screen.queryByText("Promoter bodies (Indian)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 2 sub-categories" }));
    expect(screen.getByText("Promoter bodies (Indian)")).toBeInTheDocument();
    expect(screen.getByText("49.64%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide breakdown" }));
    expect(screen.queryByText("Promoter bodies (Indian)")).not.toBeInTheDocument();
  });

  it("splits the register by investor type and tracks the promoter stake by quarter", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    expect(screen.getByText("By investor type")).toBeInTheDocument();
    expect(screen.getByText("Retail & individuals")).toBeInTheDocument();
    expect(screen.getByText("38.37%")).toBeInTheDocument();

    expect(screen.getByText("Promoter stake, quarter by quarter")).toBeInTheDocument();
    // The trend chart carries the series; each filed quarter is its own labelled point.
    expect(screen.getByRole("button", { name: "Jun '26: 50.48% promoter holding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mar '26: 50.00% promoter holding" })).toBeInTheDocument();
  });

  it("names its source and says plainly that no state-wise split exists", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    expect(screen.getByText(/filed under SEBI LODR, filed 16-JUL-2026/)).toBeInTheDocument();
    expect(screen.getByText(/state-wise split of a company's investors is not part of any exchange disclosure/)).toBeInTheDocument();
  });

  it("leaves the filing date out when the index does not carry one", async () => {
    mockRouted(() => ({ ok: true, body: { ...RELIANCE, filedOn: null } }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    expect(screen.getByText(/filed under SEBI LODR\. Categories and percentages/)).toBeInTheDocument();
  });

  it("switches company from a quick pick", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted((url) => ({ ok: true, body: url.includes("TCS") ? TCS : RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    await user.click(screen.getByRole("button", { name: "TCS" }));

    expect(await screen.findByText("Tata Consultancy Services Limited")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/market/shareholding?symbol=TCS", expect.anything());
    expect(screen.getByRole("button", { name: "TCS" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "RELIANCE" })).toHaveAttribute("aria-pressed", "false");
    // A company whose total is not filed still renders, with the count left blank.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("switches company from the search box, and ignores an empty pick", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted((url) => ({ ok: true, body: url.includes("TCS") ? TCS : RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    await user.click(screen.getByRole("button", { name: "pick nothing" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "pick TCS" }));
    expect(await screen.findByText("Tata Consultancy Services Limited")).toBeInTheDocument();
  });

  it("keeps typing in the box without re-querying until something is picked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    const input = screen.getByPlaceholderText("Search any listed company");
    await user.type(input, "X");

    expect(input).toHaveValue("RELIANCEX");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains a company with nothing filed", async () => {
    mockRouted(() => ({ ok: false, body: { error: "No shareholding pattern is published for RELIANCE." } }));
    render(<OwnershipBoard />);

    expect(await screen.findByText(/No shareholding pattern is published for RELIANCE/)).toBeInTheDocument();
    expect(screen.getByText(/a scrip that trades only on the BSE/)).toBeInTheDocument();
  });

  it("falls back to its own wording when the failure carries none", async () => {
    mockRouted(() => ({ ok: false, body: {} }));
    render(<OwnershipBoard />);

    expect(await screen.findByText(/No filing could be read for this company/)).toBeInTheDocument();
  });

  it("shows a skeleton until the filing lands", async () => {
    let settle: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    ) as unknown as typeof fetch;

    render(<OwnershipBoard />);
    expect(screen.queryByText("Reliance Industries Limited")).not.toBeInTheDocument();

    await act(async () => {
      settle({ ok: true, json: async () => RELIANCE });
    });

    expect(await screen.findByText("Reliance Industries Limited")).toBeInTheDocument();
  });

  it("ignores an answer for a company the reader has already moved off", async () => {
    const user = userEvent.setup();
    const rejecters: ((reason: unknown) => void)[] = [];
    global.fetch = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejecters.push(reject);
        }),
    ) as unknown as typeof fetch;

    render(<OwnershipBoard />);
    await waitFor(() => expect(rejecters).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "TCS" }));

    await act(async () => {
      rejecters[0](new Error("aborted"));
    });

    expect(screen.queryByText(/No filing could be read/)).not.toBeInTheDocument();
  });

  it("renders an answer cached before the bucket keys existed instead of crashing", async () => {
    // Entries live for a day, so a cache written by the previous shape outlives the deploy that
    // added `key`. Indexing straight into the colour table on that payload threw while rendering.
    const withoutKey = <T extends { key: unknown }>(item: T) => {
      const copy: Partial<T> = { ...item };
      delete copy.key;
      return copy;
    };
    const legacy = {
      ...RELIANCE,
      groups: RELIANCE.groups.map(withoutKey),
      investorTypes: RELIANCE.investorTypes.map(withoutKey),
    };
    mockRouted(() => ({ ok: true, body: legacy }));
    render(<OwnershipBoard />);

    expect(await screen.findByText("Reliance Industries Limited")).toBeInTheDocument();
    expect(screen.getAllByText("Promoters & insiders")).toHaveLength(2);
    expect(screen.getByText("By investor type")).toBeInTheDocument();
  });

  it("draws the whole register as one bar", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    const { container } = render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    const bar = within(container).getByTitle("Promoters & insiders — 50.48%");
    expect(bar).toHaveStyle({ width: "50.48%" });
  });
});
