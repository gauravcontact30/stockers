import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DividendBoard, faceValueLabel, kindTone, type Dividend } from "../../app/components/dividend-board";

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

const board = {
  live: true,
  total: 3,
  upcomingTotal: 2,
  today: "2026-08-05",
  sectors: [
    {
      sector: "Automobile and Auto Components",
      upcomingCount: 1,
      totalAmount: 25,
      dividends: [
        dividend(),
        dividend({
          symbol: "BERGEPAINT",
          company: "Berger Paints",
          subject: "Interim Dividend - Rs 4 Per Share",
          kind: "Interim",
          amount: 4,
          exDate: "2026-08-01",
          month: "Aug 2026",
          upcoming: false,
        }),
      ],
    },
    {
      sector: "Unclassified",
      upcomingCount: 1,
      totalAmount: 2,
      dividends: [
        dividend({
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
        }),
      ],
    },
  ],
};

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
    // The counts sit in their own spans, so the surrounding prose is what this element's own
    // text nodes contain.
    expect(screen.getByText(/still ahead of their ex-date/)).toBeInTheDocument();
  });

  it("marks a dividend whose ex-date has already passed", async () => {
    mockFeed(board);
    render(<DividendBoard />);

    const row = (await screen.findByText("BERGEPAINT")).closest("li")!;
    expect(within(row).getByText("EX-DATE PASSED")).toBeInTheDocument();
    expect(within(row).getByText("Interim")).toBeInTheDocument();
  });

  it("renders em dashes rather than zeros when NSE words a dividend unusually", async () => {
    const user = userEvent.setup();
    mockFeed(board);
    render(<DividendBoard />);

    await screen.findByText("HYUNDAI");
    await user.click(screen.getByRole("tab", { name: /Unclassified/ }));

    const row = screen.getByText("SARLAPOLY").closest("li")!;
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
