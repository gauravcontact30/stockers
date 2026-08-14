import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingResearch } from "../../app/components/landing-research";

jest.mock("../../app/components/ai-report-modal-lazy", () => ({
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

jest.mock("../../app/components/indian-stocks-market", () => ({
  IndianStocksMarket: (props: { onSelect?: (symbol: string) => void }) => (
    <button data-testid="pick-tcs" onClick={() => props.onSelect?.("TCS")}>
      pick TCS
    </button>
  ),
}));

function mockResearchFetch(response: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  } as Response);
}

describe("LandingResearch", () => {
  it("renders the default stock input and closed modal initially", () => {
    render(<LandingResearch />);
    expect(screen.getByPlaceholderText("Try HDFC BANK or TCS")).toHaveValue("RELIANCE");
    expect(screen.getByRole("button", { name: "Analyze stock" })).toBeInTheDocument();
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });

  it("submits the form, opens the modal, shows loading, and renders the AI analysis with a matched logo", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "RELIANCE", score: 88 });
    render(<LandingResearch />);

    await user.click(screen.getByRole("button", { name: "Analyze stock" }));

    // Modal should be open with the correct data once resolved (loading text flips back)
    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-symbol", "RELIANCE");
    expect(modal).toHaveAttribute("data-loading", "false");
    expect(modal).toHaveAttribute("data-company", "Reliance Industries");
    expect(modal.getAttribute("data-logo")).toMatch(/google\.com\/s2\/favicons/);

    expect(await screen.findByText("AI market scan generated for RELIANCE.")).toBeInTheDocument();
  });

  it("updates the input value as the user types", async () => {
    const user = userEvent.setup();
    render(<LandingResearch />);
    const input = screen.getByPlaceholderText("Try HDFC BANK or TCS");
    await user.clear(input);
    await user.type(input, "TCS");
    expect(input).toHaveValue("TCS");
  });

  it("selecting a stock from the market table updates the input and runs analysis for it", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "TCS", score: 91 });
    render(<LandingResearch />);

    await user.click(screen.getByTestId("pick-tcs"));

    expect((screen.getByPlaceholderText("Try HDFC BANK or TCS") as HTMLInputElement).value).toBe("TCS");
    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-symbol", "TCS");
    expect(modal).toHaveAttribute("data-company", "Tata Consultancy Services");
  });

  it("handles an analysis result for a stock with no matching metadata (no logo/company name)", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "UNKNOWNSTOCK", score: 50 });
    render(<LandingResearch />);
    const input = screen.getByPlaceholderText("Try HDFC BANK or TCS");
    await user.clear(input);
    await user.type(input, "UNKNOWNSTOCK");
    await user.click(screen.getByRole("button", { name: "Analyze stock" }));

    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-symbol", "UNKNOWNSTOCK");
    expect(modal).toHaveAttribute("data-logo", "");
    expect(modal).toHaveAttribute("data-company", "");
  });

  it("closes the modal via onClose", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "RELIANCE", score: 88 });
    render(<LandingResearch />);
    await user.click(screen.getByRole("button", { name: "Analyze stock" }));
    await screen.findByText("AI market scan generated for RELIANCE.");
    await user.click(screen.getByTestId("modal-close"));
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });
});
