import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardClient } from "../../app/components/dashboard-client";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}));

function mockPanel(testId: string) {
  const Stub = () => <div data-testid={testId} />;
  return Stub;
}

jest.mock("../../app/components/ai-intel-search", () => ({ AiIntelSearch: mockPanel("panel-intel") }));
jest.mock("../../app/components/market-pulse", () => ({ MarketPulse: mockPanel("panel-market-pulse") }));
jest.mock("../../app/components/top-picks-today", () => ({ TopPicksToday: mockPanel("panel-top-picks") }));
jest.mock("../../app/components/buy-tomorrow-picks", () => ({ BuyTomorrowPicks: mockPanel("panel-buy-tomorrow") }));
jest.mock("../../app/components/dip-winners", () => ({ DipWinners: mockPanel("panel-dip-winners") }));
jest.mock("../../app/components/landing-research", () => ({ LandingResearch: mockPanel("panel-research") }));
jest.mock("../../app/components/ai-stock-compare", () => ({ AiStockCompare: mockPanel("panel-compare") }));
jest.mock("../../app/components/etf-research", () => ({ EtfResearch: mockPanel("panel-etf-research") }));
jest.mock("../../app/components/bse-stock-directory", () => ({ BseStockDirectory: mockPanel("panel-directory") }));
jest.mock("../../app/components/sector-trends", () => ({ SectorTrends: mockPanel("panel-sectors") }));
jest.mock("../../app/components/most-traded", () => ({ MostTraded: mockPanel("panel-most-traded") }));
jest.mock("../../app/components/mtf-traded", () => ({ MtfTraded: mockPanel("panel-mtf") }));
jest.mock("../../app/components/stocks-in-news", () => ({ StocksInNews: mockPanel("panel-stock-news") }));
jest.mock("../../app/components/dividend-board", () => ({ DividendBoard: mockPanel("panel-dividends") }));
jest.mock("../../app/components/ipo-listings", () => ({ IpoListings: mockPanel("panel-ipos") }));
jest.mock("../../app/components/etf-board", () => ({ EtfBoard: mockPanel("panel-etf-board") }));

function setStoredUser(user: unknown) {
  window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "tok", user }));
}

function installFetchMock() {
  global.fetch = jest.fn((url: string) => {
    if (url === "/api/ai/verdicts") {
      return Promise.resolve({ ok: true, body: null, text: () => Promise.resolve("") });
    }
    if (url.startsWith("/api/market/performance")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], generatedAt: "2026-08-14T00:00:00.000Z" }) });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  }) as unknown as typeof fetch;
}

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
    window.history.replaceState(null, "", "/overview");
    installFetchMock();
  });

  describe("session handling", () => {
    it("redirects to /signin and shows fallback identity text when there is no stored user", async () => {
      await renderDashboard();
      expect(mockReplace).toHaveBeenCalledWith("/signin");
      expect(screen.getByText("Signed in as investor")).toBeInTheDocument();
      expect(screen.getByText("Plan:")).toBeInTheDocument();
      expect(screen.getByTitle("Included in Starter")).toBeInTheDocument();
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
      expect(screen.getByText("Plan:")).toBeInTheDocument();
      expect(screen.getByTitle("Included in Pro")).toBeInTheDocument();
    });

    it("falls back to default identity text when the stored user has no name or plan", async () => {
      setStoredUser({ id: "1", email: "jane@example.com" });
      await renderDashboard();
      expect(screen.getByText("Signed in as investor")).toBeInTheDocument();
      expect(screen.getByText("Plan:")).toBeInTheDocument();
      expect(screen.getByTitle("Included in Starter")).toBeInTheDocument();
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
    it("shows overview actions and keeps dedicated panels unmounted", async () => {
      await renderDashboard();

      expect(screen.getByRole("heading", { name: "Open one live tool at a time" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open Stock Research/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open Stocks in News/ })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("e.g. HDFC BANK")).not.toBeInTheDocument();
      expect(screen.queryByTestId("panel-intel")).not.toBeInTheDocument();
      expect(screen.queryByTestId("panel-research")).not.toBeInTheDocument();
      expect(screen.queryByTestId("panel-stock-news")).not.toBeInTheDocument();
    });

    it("opens stock research from the overview action grid", async () => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: /Open Stock Research/ }));

      expect(await screen.findByTestId("panel-research")).toBeInTheDocument();
      expect(window.location.pathname + window.location.hash).toBe("/stock-research");
    });

    it("no longer carries duplicated overview cards", async () => {
      await renderDashboard();
      expect(screen.queryByText("Suggested focus")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Open report" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Portfolio analytics/i)).not.toBeInTheDocument();
      expect(screen.queryByText("What StockersAI watches")).not.toBeInTheDocument();
    });
  });

  describe("AI section navigation", () => {
    const sidebar = () => within(screen.getByRole("navigation", { name: "Dashboard sections" }));

    afterEach(() => {
      window.history.replaceState(null, "", "/overview");
    });

    it("opens an AI section from the sidebar, mounting only that panel and bookmarking it in the URL", async () => {
      const user = userEvent.setup();
      await renderDashboard();
      expect(screen.queryByTestId("panel-market-pulse")).not.toBeInTheDocument();

      await user.click(sidebar().getByRole("button", { name: "Market Pulse" }));

      expect(await screen.findByTestId("panel-market-pulse")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Market Pulse" })).toBeInTheDocument();
      expect(screen.getByText("Live breadth, indices and movers with an AI read on the day's mood.")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("e.g. HDFC BANK")).not.toBeInTheDocument();
      expect(window.location.pathname + window.location.hash).toBe("/market-pulse");
      expect(window.scrollTo).toHaveBeenCalled();
    });

    it.each([
      ["Intelligence Search", "panel-intel"],
      ["Top Picks", "panel-top-picks"],
      ["Outperform Tomorrow", "panel-buy-tomorrow"],
      ["Dip Winners", "panel-dip-winners"],
      ["Stock Research", "panel-research"],
      ["Compare", "panel-compare"],
      ["ETF Research", "panel-etf-research"],
    ])("mounts the %s panel when its sidebar entry is picked", async (label, testId) => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(sidebar().getByRole("button", { name: label }));
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });

    it("opens the section named by the URL hash on first render", async () => {
      window.location.hash = "#compare";
      await renderDashboard();

      expect(await screen.findByTestId("panel-compare")).toBeInTheDocument();
      expect(window.location.hash).toBe("#compare");
    });

    it("falls back to the overview when the hash names no section", async () => {
      window.history.replaceState(null, "", "/pricing");
      await renderDashboard();

      expect(screen.getByRole("heading", { name: "Open one live tool at a time" })).toBeInTheDocument();
    });

    it("drops the hash again on the way back to the overview", async () => {
      const user = userEvent.setup();
      window.location.hash = "#dip-winners";
      await renderDashboard();

      await user.click(sidebar().getByRole("button", { name: "Overview" }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: "Open one live tool at a time" })).toBeInTheDocument();
      expect(window.location.pathname + window.location.hash).toBe("/overview");
    });

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

      expect(await screen.findByTestId("panel-top-picks")).toBeInTheDocument();
    });
  });

  describe("exchange boards and the guided tour", () => {
    afterEach(() => {
      window.history.replaceState(null, "", "/overview");
    });

    it.each([
      ["Company Directory", "panel-directory"],
      ["Sector Trends", "panel-sectors"],
      ["Most Traded", "panel-most-traded"],
      ["MTF Watch", "panel-mtf"],
      ["Stocks in News", "panel-stock-news"],
      ["Dividends", "panel-dividends"],
      ["IPO Watch", "panel-ipos"],
      ["ETF Board", "panel-etf-board"],
    ])("opens %s from the sidebar", async (label, testId) => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(
        within(screen.getByRole("navigation", { name: "Dashboard sections" })).getByRole("button", { name: label }),
      );

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });

    it("opens the guided tour without a paywall around it", async () => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(
        within(screen.getByRole("navigation", { name: "Dashboard sections" })).getByRole("button", {
          name: "Getting Started",
        }),
      );

      expect(screen.getByRole("heading", { name: /here is the order to read them in/ })).toBeInTheDocument();
      expect(window.location.pathname + window.location.hash).toBe("/getting-started");
    });

    it("jumps from the tour straight into the board it points at", async () => {
      const user = userEvent.setup();
      window.location.hash = "#support";
      await renderDashboard();

      await user.click(screen.getByRole("button", { name: /Open Market Pulse/ }));

      expect(await screen.findByTestId("panel-market-pulse")).toBeInTheDocument();
      expect(window.location.pathname + window.location.hash).toBe("/market-pulse");
    });
  });
});
