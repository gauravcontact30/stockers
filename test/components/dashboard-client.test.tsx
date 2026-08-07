import { act, render, screen, within } from "@testing-library/react";
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

// Each AI panel fetches its own live market data and is covered by its own test file; here they
// stand in as markers so a test can tell which section the dashboard mounted.
function mockPanel(testId: string) {
  const Stub = () => <div data-testid={testId} />;
  return Stub;
}

jest.mock("../../app/components/market-pulse", () => ({ MarketPulse: mockPanel("panel-market-pulse") }));
jest.mock("../../app/components/top-picks-today", () => ({ TopPicksToday: mockPanel("panel-top-picks") }));
jest.mock("../../app/components/buy-tomorrow-picks", () => ({ BuyTomorrowPicks: mockPanel("panel-buy-tomorrow") }));
jest.mock("../../app/components/dip-winners", () => ({ DipWinners: mockPanel("panel-dip-winners") }));
jest.mock("../../app/components/landing-research", () => ({ LandingResearch: mockPanel("panel-research") }));
jest.mock("../../app/components/ai-stock-compare", () => ({ AiStockCompare: mockPanel("panel-compare") }));
jest.mock("../../app/components/etf-research", () => ({ EtfResearch: mockPanel("panel-etf-research") }));

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

  describe("AI section navigation", () => {
    const sidebar = () => within(screen.getByRole("navigation", { name: "Dashboard sections" }));

    afterEach(() => {
      window.location.hash = "";
    });

    it("opens an AI section from the sidebar, mounting only that panel and bookmarking it in the URL", async () => {
      const user = userEvent.setup();
      await renderDashboard();
      expect(screen.queryByTestId("panel-market-pulse")).not.toBeInTheDocument();

      await user.click(sidebar().getByRole("button", { name: "Market Pulse" }));

      expect(screen.getByTestId("panel-market-pulse")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Market Pulse" })).toBeInTheDocument();
      expect(screen.getByText("Live breadth, indices and movers with an AI read on the day's mood.")).toBeInTheDocument();
      // The overview is unmounted with its own fetches, so only one section is ever live.
      expect(screen.queryByPlaceholderText("e.g. HDFC BANK")).not.toBeInTheDocument();
      expect(window.location.hash).toBe("#market-pulse");
      expect(window.scrollTo).toHaveBeenCalled();
    });

    it.each([
      ["Top Picks", "panel-top-picks"],
      ["Buy Tomorrow", "panel-buy-tomorrow"],
      ["Dip Winners", "panel-dip-winners"],
      ["Stock Research", "panel-research"],
      ["Compare", "panel-compare"],
      ["ETF Research", "panel-etf-research"],
    ])("mounts the %s panel when its sidebar entry is picked", async (label, testId) => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(sidebar().getByRole("button", { name: label }));
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    it("opens the section named by the URL hash on first render", async () => {
      window.location.hash = "#compare";
      await renderDashboard();

      expect(screen.getByTestId("panel-compare")).toBeInTheDocument();
      // A deep link must not be rewritten on arrival.
      expect(window.location.hash).toBe("#compare");
    });

    it("falls back to the overview when the hash names no section", async () => {
      window.location.hash = "#pricing";
      await renderDashboard();

      expect(screen.getByPlaceholderText("e.g. HDFC BANK")).toBeInTheDocument();
    });

    it("drops the hash again on the way back to the overview", async () => {
      const user = userEvent.setup();
      window.location.hash = "#dip-winners";
      await renderDashboard();

      await user.click(sidebar().getByRole("button", { name: "Overview" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByPlaceholderText("e.g. HDFC BANK")).toBeInTheDocument();
      expect(window.location.hash).toBe("");
    });

    // The open section is read from the URL, so a hash change from outside React — the back
    // button, or an in-page link — has to move the dashboard with it.
    it("follows a hash change it did not make itself", async () => {
      await renderDashboard();
      expect(screen.queryByTestId("panel-etf-research")).not.toBeInTheDocument();

      window.location.hash = "#etf-research";

      expect(await screen.findByTestId("panel-etf-research")).toBeInTheDocument();
    });

    it("switches sections from the compact phone strip", async () => {
      const user = userEvent.setup();
      await renderDashboard();

      const tabs = within(screen.getByRole("navigation", { name: "Dashboard sections (compact)" }));
      await user.click(tabs.getByRole("button", { name: "Top Picks" }));

      expect(screen.getByTestId("panel-top-picks")).toBeInTheDocument();
    });
  });

  it("renders the static watch-list of things Stockers.AI monitors and the supporting panels", async () => {
    await renderDashboard();
    expect(screen.getByText("What Stockers.AI watches")).toBeInTheDocument();
    expect(screen.getByText(/Earnings momentum and guidance changes/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/news");
  });
});
