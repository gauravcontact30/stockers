import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardClient } from "../../app/components/dashboard-client";
import { companyLogoUrl, indianStocks } from "../../app/lib/indian-stocks";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}));

jest.mock("../../app/components/ai-report-modal", () => ({
  AiReportModal: (props: {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    analysis: { stock: string } | null;
    logoUrl?: string;
    companyName?: string;
  }) => (
    <div
      data-testid="ai-report-modal"
      data-open={String(props.open)}
      data-loading={String(props.loading)}
      data-stock={props.analysis?.stock ?? ""}
      data-company-name={props.companyName ?? ""}
      data-logo-url={props.logoUrl ?? ""}
    >
      <button type="button" onClick={props.onClose}>
        close-modal
      </button>
    </div>
  ),
}));

function setStoredUser(user: unknown) {
  window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "tok", user }));
}

function installFetchMock(researchResponse?: unknown, researchOk = true) {
  global.fetch = jest.fn((url: string) => {
    if (url === "/api/news") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url === "/api/research") {
      return Promise.resolve({
        ok: researchOk,
        json: () => Promise.resolve(researchResponse),
      });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  }) as unknown as typeof fetch;
}

const reliance = indianStocks.find((s) => s.symbol === "RELIANCE")!;

// DashboardClient renders the real (unmocked) MarketNews child, which fires its own /api/news
// fetch on mount. Flushing that microtask chain inside act() here keeps every test's render
// free of "not wrapped in act(...)" warnings without each test needing to know about it.
async function renderDashboard() {
  const result = render(<DashboardClient />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

describe("DashboardClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    installFetchMock();
  });

  describe("session handling", () => {
    it("redirects to /signin and shows fallback identity text when there is no stored user", async () => {
      await renderDashboard();
      expect(mockReplace).toHaveBeenCalledWith("/signin");
      expect(screen.getByText("Signed in as investor")).toBeInTheDocument();
      expect(screen.getByText("Plan: Starter")).toBeInTheDocument();
    });

    it("redirects to /signin when the stored auth value is malformed JSON", async () => {
      window.localStorage.setItem("stockers-auth", "{not-json");
      await renderDashboard();
      expect(mockReplace).toHaveBeenCalledWith("/signin");
      expect(screen.getByText("Signed in as investor")).toBeInTheDocument();
    });

    it("redirects to /signin when the stored auth value has no user field", async () => {
      window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "tok" }));
      await renderDashboard();
      expect(mockReplace).toHaveBeenCalledWith("/signin");
    });

    it("renders the signed-in user's name and plan, and does not redirect", async () => {
      setStoredUser({ id: "1", name: "Jane Doe", email: "jane@example.com", plan: "Pro" });
      await renderDashboard();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByText("Signed in as Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Plan: Pro")).toBeInTheDocument();
    });

    it("falls back to default identity text when the stored user has no name or plan", async () => {
      setStoredUser({ id: "1", email: "jane@example.com" });
      await renderDashboard();
      expect(screen.getByText("Signed in as investor")).toBeInTheDocument();
      expect(screen.getByText("Plan: Starter")).toBeInTheDocument();
    });

    it("logs out by clearing the session and navigating home", async () => {
      const user = userEvent.setup();
      setStoredUser({ id: "1", name: "Jane Doe", plan: "Pro" });
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Logout" }));

      expect(window.localStorage.getItem("stockers-auth")).toBeNull();
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  describe("initial render", () => {
    it("shows the default no-analysis state and a closed report modal", async () => {
      await renderDashboard();
      expect(
        screen.getByText("Select a stock to unlock the AI buy/avoid recommendation and full research report.")
      ).toBeInTheDocument();
      expect(screen.queryByText("View full AI report")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Open report" })).not.toBeInTheDocument();
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
      expect(screen.getByText("RELIANCE outlook")).toBeInTheDocument();
    });

    it("updates the stock field when a suggestion is picked from StockSearch", async () => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: /^TCS/ }));
      expect(screen.getByPlaceholderText("e.g. HDFC BANK")).toHaveValue("TCS");
    });
  });

  describe("AI research flow", () => {
    it("runs the research flow: shows the loading state, opens the modal, and displays the result", async () => {
      const user = userEvent.setup();
      let resolveResearch!: (value: unknown) => void;
      global.fetch = jest.fn((url: string) => {
        if (url === "/api/news") return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        if (url === "/api/research") {
          return new Promise((resolve) => {
            resolveResearch = resolve;
          });
        }
        return Promise.reject(new Error(`unexpected url ${url}`));
      }) as unknown as typeof fetch;

      await renderDashboard();

      const stockInput = screen.getByPlaceholderText("e.g. HDFC BANK");
      await user.clear(stockInput);
      await user.type(stockInput, "reliance");
      await user.click(screen.getByRole("button", { name: "Research stock" }));

      expect(await screen.findByRole("button", { name: "Researching..." })).toBeInTheDocument();
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-loading", "true");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/research",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock: "reliance" }),
        })
      );
      // selectedSymbol is upper-cased for display in the prediction panel immediately on submit
      expect(screen.getByText("RELIANCE outlook")).toBeInTheDocument();

      resolveResearch({
        ok: true,
        json: () =>
          Promise.resolve({
            stock: "RELIANCE",
            summary: "Reliance looks strong this quarter.",
            recommendation: "Buy",
            score: 82,
          }),
      });

      expect(await screen.findByText("Analysis ready for RELIANCE.")).toBeInTheDocument();
      expect(screen.getByText("Reliance looks strong this quarter.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Research stock" })).toBeInTheDocument();
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-loading", "false");
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-stock", "RELIANCE");
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-company-name", reliance.name);
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute(
        "data-logo-url",
        companyLogoUrl(reliance.domain)
      );
    });

    it("falls back to the 'Buy' recommendation label when the response omits one", async () => {
      const user = userEvent.setup();
      installFetchMock({ stock: "RELIANCE", summary: "Summary text." });
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Research stock" }));
      await screen.findByText("Analysis ready for RELIANCE.");

      expect(
        screen.getByText(
          "Buy — open the full research report for key insights, market trends, company actions, positive news, and reasons."
        )
      ).toBeInTheDocument();
    });

    it("leaves logoUrl and companyName undefined when the analyzed symbol isn't in the known stock list", async () => {
      const user = userEvent.setup();
      installFetchMock({ stock: "UNKNOWNSYM", summary: "Summary text.", recommendation: "Hold" });
      await renderDashboard();

      const stockInput = screen.getByPlaceholderText("e.g. HDFC BANK");
      await user.clear(stockInput);
      await user.type(stockInput, "unknownsym");
      await user.click(screen.getByRole("button", { name: "Research stock" }));

      await screen.findByText("Analysis ready for UNKNOWNSYM.");
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-company-name", "");
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-logo-url", "");
    });

    it("reopens the modal from the 'View full AI report' button after it was closed", async () => {
      const user = userEvent.setup();
      installFetchMock({ stock: "RELIANCE", summary: "Summary text.", recommendation: "Buy" });
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Research stock" }));
      await screen.findByText("Analysis ready for RELIANCE.");

      await user.click(screen.getByRole("button", { name: "close-modal" }));
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");

      await user.click(screen.getByRole("button", { name: "View full AI report" }));
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "true");
    });

    it("reopens the modal from the aside's 'Open report' button", async () => {
      const user = userEvent.setup();
      installFetchMock({ stock: "RELIANCE", summary: "Summary text.", recommendation: "Buy" });
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: "Research stock" }));
      await screen.findByText("Analysis ready for RELIANCE.");

      await user.click(screen.getByRole("button", { name: "close-modal" }));
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");

      await user.click(screen.getByRole("button", { name: "Open report" }));
      expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "true");
    });
  });

  it("renders the static watch-list of things Stockers.AI monitors and the supporting panels", async () => {
    await renderDashboard();
    expect(screen.getByText("What Stockers.AI watches")).toBeInTheDocument();
    expect(screen.getByText(/Earnings momentum and guidance changes/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/news");
  });
});
