import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ALL_KINDS,
  ALL_SECTORS,
  DividendBoard,
  dividendBrief,
  faceValueLabel,
  filterDividends,
  kindStyle,
  kindTone,
  type Dividend,
  type DividendSector,
} from "../../app/components/dividend-board";

jest.setTimeout(30000);

function dividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    symbol: "HYUNDAI",
    company: "Hyundai Motor India Limited",
    sector: "Automobile and Auto Components",
    subject: "Dividend - Rs 21 Per Share",
    kind: "Dividend",
    amount: 21,
    faceValue: 10,
    percentOfFaceValue: 210,
    exDate: "2026-08-20",
    recordDate: "2026-08-20",
    month: "Aug 2026",
    upcoming: true,
    ...overrides,
  };
}

const berger = dividend({
  symbol: "BERGEPAINT",
  company: "Berger Paints",
  subject: "Interim Dividend - Rs 4 Per Share",
  kind: "Interim",
  amount: 4,
  exDate: "2026-08-01",
  upcoming: false,
});

const sarla = dividend({
  symbol: "SARLAPOLY",
  company: "Sarla Performance Fibers",
  sector: "Unclassified",
  amount: null,
  faceValue: null,
  percentOfFaceValue: null,
  exDate: null,
  recordDate: null,
  month: null,
  kind: "Special",
});

const sectors: DividendSector[] = [
  {
    sector: "Automobile and Auto Components",
    upcomingCount: 1,
    totalAmount: 25,
    dividends: [dividend(), berger],
  },
  { sector: "Unclassified", upcomingCount: 1, totalAmount: 2, dividends: [sarla] },
];

const board = { live: true, total: 3, upcomingTotal: 2, today: "2026-08-05", sectors };

function mockFeed(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
}

describe("kindTone", () => {
  it("colours each dividend type distinctly", () => {
    expect(kindTone("Interim")).toContain("sky");
    expect(kindTone("Final")).toContain("emerald");
    expect(kindTone("Special")).toContain("violet");
    expect(kindTone("Dividend")).toContain("slate");
  });

  it("falls back to the plain tone for an unknown type", () => {
    expect(kindTone("Mystery")).toBe(kindTone("Dividend"));
  });
});

describe("kindStyle", () => {
  // The colour has to reach the card, not just a chip, or a page of cards all reads the same.
  it("carries a card wash and a rule colour for each category", () => {
    expect(kindStyle("Interim").card).toContain("sky");
    expect(kindStyle("Interim").rule).toContain("sky");
    expect(kindStyle("Final").label).toMatch(/full-year results/);
  });

  it("falls back to the plain style for an unknown category", () => {
    expect(kindStyle("Mystery")).toBe(kindStyle("Dividend"));
  });
});

describe("faceValueLabel", () => {
  // Indian companies declare dividends as a percentage of face value, which is why "210%" and
  // "₹21" describe the same payout on a ₹10 face value.
  it("expresses the payout against face value", () => {
    expect(faceValueLabel(210, 10)).toBe("210% of ₹10 face value");
  });

  it("returns null when either half is missing", () => {
    expect(faceValueLabel(null, 10)).toBeNull();
    expect(faceValueLabel(210, null)).toBeNull();
  });
});

describe("filterDividends", () => {
  const base = { sector: ALL_SECTORS, query: "", kind: ALL_KINDS, timing: "all" as const };

  it("returns every declared dividend, soonest ex-date first, with unknown dates last", () => {
    expect(filterDividends(sectors, base).map((row) => row.symbol)).toEqual(["BERGEPAINT", "HYUNDAI", "SARLAPOLY"]);
  });

  // A row with no ex-date sorts last whichever side of the comparison it lands on, so the order
  // it arrived in from the feed cannot change where it ends up.
  it("sinks an undated dividend regardless of its position in the feed", () => {
    const undated = dividend({ symbol: "NODATE", exDate: null });
    const dated = dividend({ symbol: "DATED", exDate: "2026-09-01" });
    const group = (dividends: Dividend[]): DividendSector[] => [
      { sector: "Automobile and Auto Components", dividends, upcomingCount: dividends.length, totalAmount: 0 },
    ];

    expect(filterDividends(group([undated, dated]), base).map((row) => row.symbol)).toEqual(["DATED", "NODATE"]);
    expect(filterDividends(group([dated, undated]), base).map((row) => row.symbol)).toEqual(["DATED", "NODATE"]);
  });

  it("narrows to one sector", () => {
    expect(filterDividends(sectors, { ...base, sector: "Unclassified" }).map((row) => row.symbol)).toEqual(["SARLAPOLY"]);
  });

  it("narrows to one category", () => {
    expect(filterDividends(sectors, { ...base, kind: "Interim" }).map((row) => row.symbol)).toEqual(["BERGEPAINT"]);
  });

  it.each([
    ["upcoming", ["HYUNDAI", "SARLAPOLY"]],
    ["passed", ["BERGEPAINT"]],
  ] as const)("splits on whether the ex-date has passed (%s)", (timing, expected) => {
    expect(filterDividends(sectors, { ...base, timing }).map((row) => row.symbol)).toEqual(expected);
  });

  // Searching a sector name matters as much as searching a ticker: "which telecom dividends" is
  // a question a reader has before they know any of the tickers in it.
  it.each([
    ["berge", ["BERGEPAINT"]],
    ["Sarla Performance", ["SARLAPOLY"]],
    ["Unclassified", ["SARLAPOLY"]],
    ["nothing here", []],
  ])("matches %s on ticker, company or sector", (query, expected) => {
    expect(filterDividends(sectors, { ...base, query }).map((row) => row.symbol)).toEqual(expected);
  });
});

describe("dividendBrief", () => {
  // Two dated, capturable dividends, so both the "pays most" and "soonest" orderings are real.
  const withSecondDated: DividendSector[] = [
    { ...sectors[0], dividends: [...sectors[0].dividends, dividend({ symbol: "ITC", amount: 7.5, exDate: "2026-08-12" })] },
    sectors[1],
  ];

  it("summarises what is capturable and what pays most", () => {
    const brief = dividendBrief(withSecondDated, 3, 4)!;

    expect(brief.facts).toContainEqual({ label: "Declared dividends", value: "4" });
    expect(brief.facts).toContainEqual({ label: "Still ahead of ex-date", value: "3" });
    // The soonest ex-date, not the biggest payout — it is the one with a deadline on it.
    expect(brief.facts).toContainEqual({ label: "Next ex-date", value: "ITC on 12 Aug 2026" });
    // Biggest payout first among the highlights.
    expect(brief.highlights[0]).toMatch(/HYUNDAI .* ₹21.00 a share/);
    expect(brief.highlights[1]).toMatch(/ITC .* ₹7.50 a share/);
  });

  // A dividend NSE worded unusually has no amount; it sorts last rather than as if it paid zero
  // ahead of something that pays nothing at all.
  it("ranks an unparsed payout below a stated one, from either starting order", () => {
    const withUnpriced: DividendSector[] = [
      { ...sectors[0], dividends: [sarla, dividend()] },
      { ...sectors[0], sector: "Second", dividends: [dividend(), sarla] },
    ];

    expect(dividendBrief(withUnpriced, 4, 4)!.highlights[0]).toMatch(/HYUNDAI/);
  });

  it("drops the next-ex-date fact when nothing upcoming carries one", () => {
    const undated: DividendSector[] = [{ ...sectors[1], dividends: [sarla] }];
    expect(dividendBrief(undated, 1, 1)!.facts.map((fact) => fact.label)).not.toContain("Next ex-date");
  });

  it("returns nothing to read when the calendar is empty", () => {
    expect(dividendBrief([], 0, 0)).toBeNull();
  });
});

describe("DividendBoard", () => {
  it("shows a skeleton before the feed arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<DividendBoard />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });

  it("renders each dividend with amount, type, month and both key dates", async () => {
    mockFeed(board);
    render(<DividendBoard />);

    const row = (await screen.findByText("HYUNDAI")).closest("li")!;
    expect(within(row).getByText("Hyundai Motor India Limited")).toBeInTheDocument();
    expect(within(row).getByText("₹21.00")).toBeInTheDocument();
    expect(within(row).getByText("per share")).toBeInTheDocument();
    expect(within(row).getByText("Aug 2026")).toBeInTheDocument();
    expect(within(row).getByText("UPCOMING")).toBeInTheDocument();
    expect(within(row).getAllByText("20 Aug 2026")).toHaveLength(2);
    expect(within(row).getByText("210% of ₹10 face value")).toBeInTheDocument();

    expect(screen.getByText("2 still capturable")).toBeInTheDocument();
  });

  // Colour is the category, so a legend has to say what each one means.
  it("names every category in a legend", async () => {
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    expect(screen.getByText("Paid part-way through the financial year")).toBeInTheDocument();
    expect(screen.getByText("Declared with the full-year results")).toBeInTheDocument();
    expect(screen.getByText("One-off, outside the usual schedule")).toBeInTheDocument();
    expect(screen.getByText("Declared without a stated type")).toBeInTheDocument();
  });

  // The board opens on what is still actionable; a passed ex-date is history until asked for.
  it("hides passed ex-dates until the timing filter asks for them", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    expect(screen.queryByText("BERGEPAINT")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Ex-date passed/ }));

    const row = (await screen.findByText("BERGEPAINT")).closest("li")!;
    expect(within(row).getByText("EX-DATE PASSED")).toBeInTheDocument();
    expect(within(row).getByText("Interim")).toBeInTheDocument();
    expect(screen.queryByText("HYUNDAI")).not.toBeInTheDocument();
  });

  it("filters to one sector from the dropdown", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    await user.selectOptions(screen.getByLabelText("Sector"), "Unclassified");

    expect(await screen.findByText("SARLAPOLY")).toBeInTheDocument();
    expect(screen.queryByText("HYUNDAI")).not.toBeInTheDocument();
  });

  it("filters to one category from the dropdown", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    await user.selectOptions(screen.getByLabelText("Category"), "Special");

    expect(await screen.findByText("SARLAPOLY")).toBeInTheDocument();
    expect(screen.queryByText("HYUNDAI")).not.toBeInTheDocument();
  });

  it("searches by company name and clears back to the full list", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    await user.type(screen.getByLabelText("Company or ticker"), "Sarla");

    expect(await screen.findByText("SARLAPOLY")).toBeInTheDocument();
    expect(screen.queryByText("HYUNDAI")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("HYUNDAI")).toBeInTheDocument();
  });

  // The clear button only exists once something has been narrowed.
  it("offers no clear button until a filter is set", async () => {
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("says so when the filters match nothing", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    await user.type(screen.getByLabelText("Company or ticker"), "zzzz");

    expect(await screen.findByText(/No declared dividend matches those filters/)).toBeInTheDocument();
  });

  it("renders em dashes rather than zeros when NSE words a dividend unusually", async () => {
    mockFeed(board);
    render(<DividendBoard />);

    const row = (await screen.findByText("SARLAPOLY")).closest("li")!;
    // Amount, ex-date and record date all unknown; the month chip and face-value line are dropped.
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(row).queryByText(/face value/)).not.toBeInTheDocument();
  });

  it("explains what an ex-date means for a buyer", async () => {
    mockFeed(board);
    render(<DividendBoard />);
    expect(await screen.findByText("Reading a dividend")).toBeInTheDocument();
    expect(screen.getByText(/the dividend goes to the seller/)).toBeInTheDocument();
  });

  it("shows the empty state when the calendar is empty", async () => {
    mockFeed({ sectors: [], total: 0, upcomingTotal: 0, today: "2026-08-05", live: false });
    render(<DividendBoard />);
    expect(await screen.findByText(/No dividends on NSE's corporate-actions calendar/)).toBeInTheDocument();
    expect(screen.getByText("0 still capturable")).toBeInTheDocument();
  });

  it("shows an error banner when the feed fails", async () => {
    mockFeed({}, false);
    render(<DividendBoard />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });
});
