import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EtfResearch } from "../../app/components/etf-research";

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

jest.mock("../../app/components/indian-etfs-market", () => ({
  IndianEtfsMarket: (props: { onSelect?: (symbol: string) => void }) => (
    <button data-testid="pick-goldbees" onClick={() => props.onSelect?.("GOLDBEES")}>
      pick GOLDBEES
    </button>
  ),
}));

function mockResearchFetch(response: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  } as Response);
}

describe("EtfResearch", () => {
  it("renders the default symbol input and closed modal initially", () => {
    render(<EtfResearch />);
    expect(screen.getByPlaceholderText("Try NIFTYBEES or GOLDBEES")).toHaveValue("NIFTYBEES");
    expect(screen.getByRole("button", { name: "Analyze ETF" })).toBeInTheDocument();
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });

  it("submits the form, opens the modal, and renders the AI analysis with a matched logo", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "NIFTYBEES", score: 88 });
    render(<EtfResearch />);

    await user.click(screen.getByRole("button", { name: "Analyze ETF" }));

    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-symbol", "NIFTYBEES");
    expect(modal).toHaveAttribute("data-loading", "false");
    expect(modal).toHaveAttribute("data-company", "Nippon India ETF Nifty BeES");
    expect(modal.getAttribute("data-logo")).toMatch(/google\.com\/s2\/favicons/);

    expect(await screen.findByText("AI market scan generated for NIFTYBEES.")).toBeInTheDocument();
  });

  it("updates the input value as the user types", async () => {
    const user = userEvent.setup();
    render(<EtfResearch />);
    const input = screen.getByPlaceholderText("Try NIFTYBEES or GOLDBEES");
    await user.clear(input);
    await user.type(input, "GOLDBEES");
    expect(input).toHaveValue("GOLDBEES");
  });

  it("selecting an ETF from the market table updates the input and runs analysis for it", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "GOLDBEES", score: 91 });
    render(<EtfResearch />);

    await user.click(screen.getByTestId("pick-goldbees"));

    expect((screen.getByPlaceholderText("Try NIFTYBEES or GOLDBEES") as HTMLInputElement).value).toBe("GOLDBEES");
    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-symbol", "GOLDBEES");
    expect(modal).toHaveAttribute("data-company", "Nippon India ETF Gold BeES");
  });

  it("handles an analysis result for a symbol with no matching metadata (no logo/company name)", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "UNKNOWNETF", score: 50 });
    render(<EtfResearch />);
    const input = screen.getByPlaceholderText("Try NIFTYBEES or GOLDBEES");
    await user.clear(input);
    await user.type(input, "UNKNOWNETF");
    await user.click(screen.getByRole("button", { name: "Analyze ETF" }));

    const modal = await screen.findByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-symbol", "UNKNOWNETF");
    expect(modal).toHaveAttribute("data-logo", "");
    expect(modal).toHaveAttribute("data-company", "");
  });

  it("closes the modal via onClose", async () => {
    const user = userEvent.setup();
    mockResearchFetch({ stock: "NIFTYBEES", score: 88 });
    render(<EtfResearch />);
    await user.click(screen.getByRole("button", { name: "Analyze ETF" }));
    await screen.findByText("AI market scan generated for NIFTYBEES.");
    await user.click(screen.getByTestId("modal-close"));
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });
});
