import { render, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DipWinners } from "../../app/components/dip-winners";

jest.mock("../../app/components/ai-report-modal", () => ({
  AiReportModal: (props: any) => (
    <div
      data-testid="ai-report-modal"
      data-open={String(props.open)}
      data-symbol={props.analysis?.stock ?? ""}
      data-logo={props.logoUrl ?? ""}
      data-company={props.companyName ?? ""}
      data-loading={String(props.loading)}
    >
      <button data-testid="modal-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const baseStocks = [
  {
    symbol: "AAA",
    name: "Alpha Co",
    sector: "Information Technology",
    capTier: "Large",
    logo: "https://logo.test/a.png",
    price: 100.5,
    changePercent: -2.5,
    periodReturn: 45,
    declineReturn: -12.3,
  },
  {
    symbol: "BBB",
    name: "Beta Co",
    sector: "Banking",
    capTier: "Mid",
    logo: "https://logo.test/b.png",
    price: 50,
    changePercent: -1.2,
    periodReturn: 20,
    declineReturn: -5,
  },
  {
    symbol: "CCC",
    name: "Gamma Co",
    sector: "Pharmaceuticals",
    capTier: "Small",
    logo: "https://logo.test/c.png",
    price: null,
    changePercent: -3,
    periodReturn: 30,
    declineReturn: 2.5,
  },
];

function mockListFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => response,
  } as Response);
}

describe("DipWinners", () => {
  it("shows loading skeletons before data arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<DipWinners />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });

  it("renders stocks with formatted price, cap pill, change, period-return and decline columns", async () => {
    mockListFetch({ stocks: baseStocks, generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" });
    render(<DipWinners />);

    expect(await screen.findByText("AAA")).toBeInTheDocument();
    const aaaRow = screen.getByText("AAA").closest("tr")!;
    expect(within(aaaRow).getByText("₹100.50")).toBeInTheDocument();
    expect(within(aaaRow).getByText("▼ 2.50%")).toBeInTheDocument();
    expect(within(aaaRow).getByText("+45%")).toBeInTheDocument();
    expect(within(aaaRow).getByText("▼ 12.3%")).toBeInTheDocument();
    expect(within(aaaRow).getByText("Large Cap")).toBeInTheDocument();
    expect(within(aaaRow).getByText("Live")).toBeInTheDocument();

    const bbbRow = screen.getByText("BBB").closest("tr")!;
    expect(within(bbbRow).getByText("Mid Cap")).toBeInTheDocument();

    const cccRow = screen.getByText("CCC").closest("tr")!;
    expect(within(cccRow).getByText("Small Cap")).toBeInTheDocument();
    // Null price and a non-negative declineReturn (2.5) both render the muted "—" placeholder.
    expect(within(cccRow).getAllByText("—")).toHaveLength(2);
    expect(within(cccRow).queryByText(/▼.*2\.5/)).not.toBeInTheDocument();

    // Default period is 6-Month / decline period is 1-Month, reflected in heading/badge/columns.
    expect(screen.getByText("Proven 6-Month winners, trading cheaper today")).toBeInTheDocument();
    expect(screen.getByText("Losers today • Winners over 6-Month")).toBeInTheDocument();
    expect(screen.getByText("6-Month return")).toBeInTheDocument();
    expect(screen.getByText("1-Month decline")).toBeInTheDocument();
  });

  it("shows an error banner when the response is not ok", async () => {
    mockListFetch({}, false);
    render(<DipWinners />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });

  it("shows an error banner when the fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    render(<DipWinners />);
    expect(await screen.findByText(/Couldn't reach the market data feed/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no matching stocks", async () => {
    mockListFetch({ stocks: [], generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" });
    render(<DipWinners />);
    expect(await screen.findByText(/No stocks currently match these filters/)).toBeInTheDocument();
    expect(screen.getByText(/Try loosening the return or decline threshold, or picking different/)).toBeInTheDocument();
  });

  it("falls back to initials when the logo image fails to load", async () => {
    mockListFetch({ stocks: [baseStocks[0]], generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" });
    render(<DipWinners />);
    const img = await screen.findByAltText("Alpha Co logo");
    fireEvent.error(img);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("selects a row, shows loading then the analysis in the modal, and closes it", async () => {
    const user = userEvent.setup();
    const research = deferred<Response>();
    global.fetch = jest.fn((url: any) => {
      if (String(url).includes("/api/research")) return research.promise;
      return Promise.resolve({
        ok: true,
        json: async () => ({ stocks: baseStocks, generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<DipWinners />);
    await screen.findByText("AAA");

    const aaaRow = screen.getByText("AAA").closest("tr")!;
    await user.click(aaaRow);

    let modal = screen.getByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-loading", "true");
    expect(modal).toHaveAttribute("data-logo", "https://logo.test/a.png");
    expect(modal).toHaveAttribute("data-company", "Alpha Co");

    await act(async () => {
      research.resolve({ ok: true, json: async () => ({ stock: "AAA", score: 80 }) } as Response);
      await research.promise;
    });

    modal = screen.getByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-loading", "false");
    expect(modal).toHaveAttribute("data-symbol", "AAA");
    expect(screen.getByText("AAA").closest("tr")).toHaveClass("bg-rose-50/60");

    await user.click(screen.getByTestId("modal-close"));
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });

  it("applies filters (performance period + decline period) and requests the right query string", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stocks: baseStocks, generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DipWinners />);
    await screen.findByText("AAA");

    // Initial call: default filters -> no sector, no capTier param (all 3 active), 6-month
    // performance period, 1-month decline period, fixed limit.
    const initialUrl = String(fetchMock.mock.calls[0][0]);
    expect(initialUrl).not.toMatch(/sector=/);
    expect(initialUrl).not.toMatch(/capTier=/);
    expect(initialUrl).toMatch(/period=6mo/);
    expect(initialUrl).toMatch(/declinePeriod=1mo/);
    expect(initialUrl).toMatch(/minDecline=0/);
    expect(initialUrl).toMatch(/limit=10/);

    fireEvent.change(screen.getByLabelText("Sector"), { target: { value: "it" } });
    fireEvent.change(screen.getByLabelText("Performance period"), { target: { value: "1y" } });
    fireEvent.change(screen.getByLabelText("Min return over period (%)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Down at least X% over"), { target: { value: "3y" } });
    fireEvent.change(screen.getByLabelText("Min decline over that period (%)"), { target: { value: "15" } });

    // Uncheck one cap tier (Small) -> subset selected -> capTier param should be set
    fireEvent.click(screen.getByRole("checkbox", { name: "Small" }));

    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await screen.findByText("AAA");

    const appliedUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
    expect(appliedUrl).toMatch(/sector=it/);
    expect(appliedUrl).toMatch(/period=1y/);
    expect(appliedUrl).toMatch(/minReturn=30/);
    expect(appliedUrl).toMatch(/declinePeriod=3y/);
    expect(appliedUrl).toMatch(/minDecline=15/);
    expect(appliedUrl).toMatch(/limit=10/);
    expect(appliedUrl).toMatch(/capTier=Large%2CMid/);

    // The applied periods (1-Year / 3-Year) should now drive the heading and table columns too.
    expect(screen.getByText("Proven 1-Year winners, trading cheaper today")).toBeInTheDocument();
    expect(screen.getByText("1-Year return")).toBeInTheDocument();
    expect(screen.getByText("3-Year decline")).toBeInTheDocument();

    // Reset restores defaults and refetches
    const callsBeforeReset = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeReset));
    const resetUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
    expect(resetUrl).not.toMatch(/sector=/);
    expect(resetUrl).toMatch(/period=6mo/);
    expect(resetUrl).toMatch(/declinePeriod=1mo/);
    expect(resetUrl).toMatch(/minReturn=20/);
    expect((screen.getByLabelText("Sector") as HTMLSelectElement).value).toBe("");
  }, 15000);

  it("keeps the last cap tier checked when trying to uncheck it", async () => {
    mockListFetch({ stocks: baseStocks, generatedAt: "", asOfDate: "2026-08-04", source: "yahoo" });
    render(<DipWinners />);
    await screen.findByText("AAA");

    fireEvent.click(screen.getByRole("checkbox", { name: "Small" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mid" }));
    // Now only "Large" remains checked; trying to uncheck it must be a no-op.
    const largeCheckbox = screen.getByRole("checkbox", { name: "Large" }) as HTMLInputElement;
    expect(largeCheckbox.checked).toBe(true);
    fireEvent.click(largeCheckbox);
    expect(largeCheckbox.checked).toBe(true);
  });
});
