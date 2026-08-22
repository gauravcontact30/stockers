import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnershipBoard, formatHolders, formatPercent, formatPoints, type Ownership } from "../../app/components/ownership-board";

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
  market: {
    symbol: "RELIANCE",
    name: "Reliance Industries Limited",
    scripCode: "500325",
    price: 1431.25,
    previousClose: 1400,
    change: 31.25,
    changePercent: 2.23,
    sessionDate: "2026-08-11",
    source: "BSE Bhavcopy",
    returns: [
      { key: "1D", value: 2.23, measuredFrom: "2026-08-11" },
      { key: "1W", value: 3.11, measuredFrom: "2026-08-04" },
      { key: "1M", value: 5.49, measuredFrom: "2026-07-11" },
      { key: "3M", value: -2.12, measuredFrom: "2026-05-11" },
      { key: "6M", value: 8.08, measuredFrom: "2026-02-11" },
      { key: "1Y", value: 14.5, measuredFrom: "2025-08-11" },
      { key: "3Y", value: 42.9, measuredFrom: "2023-08-11" },
      { key: "5Y", value: 90.25, measuredFrom: "2021-08-11" },
      { key: "Overall", value: 90.25, measuredFrom: "2021-08-11" },
    ],
  },
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
    {
      quarter: "31-MAR-2026",
      promoter: 50,
      publicHeld: 50,
      investorTypes: [
        { key: "promoters", label: "Promoters & insiders", percent: 50 },
        { key: "fii", label: "Foreign institutional investors", percent: 17 },
        { key: "dii", label: "Domestic institutional investors", percent: 21 },
        { key: "government", label: "Government", percent: 0.1 },
        { key: "retail", label: "Retail & individual investors", percent: 9.1 },
        { key: "bodies", label: "Corporate bodies & trusts", percent: 2.8 },
      ],
    },
    {
      quarter: "30-JUN-2026",
      promoter: 50.48,
      publicHeld: 49.52,
      investorTypes: [
        { key: "promoters", label: "Promoters & insiders", percent: 50.48 },
        { key: "fii", label: "Foreign institutional investors", percent: 17.19 },
        { key: "dii", label: "Domestic institutional investors", percent: 21.18 },
        { key: "government", label: "Government", percent: 0.09 },
        { key: "retail", label: "Retail & individual investors", percent: 9.15 },
        { key: "bodies", label: "Corporate bodies & trusts", percent: 1.9 },
        { key: "others", label: "Unclassified in the filing", percent: 0.01 },
      ],
    },
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

describe("formatPoints", () => {
  // A stake moving from 50.00% to 50.48% moved 0.48 *points*, not 0.48 per cent - 0.48 per cent of
  // 50 would be 0.24. The direction is carried by the sentence around it, so the figure is bare.
  it("reads a move in percentage points, unsigned", () => {
    expect(formatPoints(0.48)).toBe("0.48 points");
    expect(formatPoints(-0.48)).toBe("0.48 points");
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

    // Named in the register, the investor-type split, the trend chart's holdings legend, and the
    // callout naming the largest holder of the selected quarter.
    expect(screen.getAllByText("Promoters & insiders")).toHaveLength(4);
    expect(screen.getAllByText("50.48%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Foreign institutional investors").length).toBeGreaterThan(0);
    expect(screen.getAllByText("17.19%").length).toBeGreaterThan(0);
    // Retail is the one class measured in millions of people.
    expect(screen.getByText("45.69 lakh shareholders")).toBeInTheDocument();
    // A class the filing does not break holders out for says so rather than showing a zero.
    expect(screen.getByText("Holder count not broken out")).toBeInTheDocument();

    expect(screen.getByText("46.52 lakh")).toBeInTheDocument();
    expect(screen.getByText("17.76%")).toBeInTheDocument();
  });

  it("shows the BSE-sourced price and measured return windows beside the filing", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);

    await screen.findByText("Reliance Industries Limited");

    expect(screen.getByText("BSE market snapshot")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,431.25")).toBeInTheDocument();
    expect(screen.getAllByText("+2.23%").length).toBeGreaterThan(0);
    expect(screen.getByText("RELIANCE / BSE 500325 - session 2026-08-11")).toBeInTheDocument();
    expect(screen.getByTitle("1Y measured from 2025-08-11")).toHaveTextContent("+14.50%");
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

  it("tracks the promoter stake by quarter", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    expect(screen.getByText("Promoter stake, quarter by quarter")).toBeInTheDocument();
    // The trend chart carries the series: every filed quarter is its own button, and the pie
    // beside them reports the promoter stake of whichever quarter is selected.
    expect(screen.getByRole("button", { name: "Jun '26" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mar '26" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Jun '26 ownership pie chart, promoter holding 50\.48 percent/ }),
    ).toBeInTheDocument();
  });

  /**
   * The read, which is the only part of this board that says anything rather than tabulating it.
   *
   * Each case below is a register of a genuinely different shape - a controlled company, one with
   * no controlling group, one no institution has touched - because the sentences are the board's
   * one claim to being readable by somebody who does not already know what a promoter is, and a
   * sentence that is right for Reliance and wrong for a professionally managed mid cap would be
   * worse than no sentence at all.
   */
  describe("the read", () => {
    /** Renders a register built by reshaping the Reliance filing, and waits for it to land. */
    async function readOf(overrides: Partial<Ownership>) {
      mockRouted(() => ({ ok: true, body: { ...RELIANCE, ...overrides } }));
      render(<OwnershipBoard />);
      await screen.findByText("Reliance Industries Limited");
    }

    /** The read's sentences are woven from several elements, so they are matched by text content. */
    function sentence(match: RegExp) {
      return screen.getByText((_, element) => {
        if (!element || element.tagName !== "SPAN") return false;
        const own = element.textContent ?? "";
        return match.test(own) && !Array.from(element.children).some((child) => match.test(child.textContent ?? ""));
      });
    }

    it("says who controls a company whose promoters hold more than half of it", async () => {
      await readOf({});

      expect(screen.getByText("What this filing tells you")).toBeInTheDocument();
      expect(sentence(/Promoters hold 50\.48% — more than half the company/)).toBeInTheDocument();
      expect(sentence(/Funds and institutions hold 38\.37% between them — 21\.18% Indian mutual funds/)).toBeInTheDocument();
      expect(sentence(/45\.69 lakh individual investors hold 9\.15% between them/)).toBeInTheDocument();
    });

    it("says plainly when the promoters cannot outvote everybody else", async () => {
      await readOf({
        groups: RELIANCE.groups.map((group) => (group.key === "promoters" ? { ...group, percent: 26.4 } : group)),
      });

      expect(sentence(/Promoters hold 26\.40%, short of the half that decides a vote/)).toBeInTheDocument();
    });

    it("says when nobody is registered as the controlling group at all", async () => {
      await readOf({ groups: RELIANCE.groups.filter((group) => group.key !== "promoters") });

      expect(sentence(/No promoter stake is filed/)).toBeInTheDocument();
    });

    it("says when no institution has filed a holding", async () => {
      await readOf({ groups: RELIANCE.groups.filter((group) => group.key !== "fii" && group.key !== "dii") });

      expect(sentence(/No fund or institution has filed a holding this quarter/)).toBeInTheDocument();
    });

    it("does not invent a headcount the filing does not break out", async () => {
      await readOf({
        groups: RELIANCE.groups.map((group) => (group.key === "retail" ? { ...group, holders: null } : group)),
      });

      expect(sentence(/Individual investors hold 9\.15% of the company/)).toBeInTheDocument();
    });

    it("reads the promoter stake across every quarter filed, in both directions", async () => {
      await readOf({});
      expect(sentence(/promoters have added 0\.48 points, from 50\.00% to 50\.48%/)).toBeInTheDocument();

      cleanup();
      await readOf({ history: [...RELIANCE.history].reverse() });
      expect(sentence(/promoters have given up 0\.48 points, from 50\.48% to 50\.00%/)).toBeInTheDocument();
    });

    it("says a stake has not moved rather than reporting a change of nothing", async () => {
      await readOf({
        history: RELIANCE.history.map((entry) => ({ ...entry, promoter: 50.48 })),
      });

      expect(sentence(/the promoter stake has not moved from 50\.48%/)).toBeInTheDocument();
    });

    // One filed quarter is a photograph, not a direction, and a direction drawn from it would be
    // a line between a point and itself.
    it("says nothing about direction when only one quarter has been filed", async () => {
      await readOf({ history: RELIANCE.history.slice(0, 1) });

      expect(screen.queryByText("Which way it is moving")).not.toBeInTheDocument();
      expect(screen.getByText("Who controls it")).toBeInTheDocument();
    });
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

  it("still shows exact BSE market data when a shareholding filing is unavailable", async () => {
    mockRouted(() => ({
      ok: false,
      body: { error: "No shareholding pattern is published for 500325.", market: RELIANCE.market },
    }));
    render(<OwnershipBoard />);

    expect(await screen.findByText(/No shareholding pattern is published for 500325/)).toBeInTheDocument();
    expect(screen.getByText("BSE market snapshot")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,431.25")).toBeInTheDocument();
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
    expect(screen.getAllByText("Promoters & insiders")).toHaveLength(4);
    // The read is drawn from the same payload, so a legacy entry has to survive it too.
    expect(screen.getByText("What this filing tells you")).toBeInTheDocument();
  });

  it("draws the whole register as one bar", async () => {
    mockRouted(() => ({ ok: true, body: RELIANCE }));
    const { container } = render(<OwnershipBoard />);
    await screen.findByText("Reliance Industries Limited");

    const bar = within(container).getByTitle("Promoters & insiders — 50.48%");
    expect(bar).toHaveStyle({ width: "50.48%" });

    // A phone cannot hover a band, so the colours are keyed on the page and the whole bar is
    // named for a reader who cannot see it at all.
    expect(
      screen.getByRole("img", { name: /The whole register: Promoters & insiders 50\.48%, .*Government 0\.09%/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Every class accounted for — 100.00% of shares")).toBeInTheDocument();
  });
});
