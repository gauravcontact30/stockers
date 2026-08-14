// The live exchange section on the landing page.
//
// The point of these tests is that nothing on the card is invented: the counts come from the
// board's own breadth, the rankings come from `getBseMovers`, and a tier that had no movers says
// so rather than showing a filled list.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveMarketBoard, LiveMarketFallback, LiveMarketPayload } from "../../app/components/live-market-board";
import { formatCrore } from "../../app/lib/market-format";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

// The payload mounts the one-minute refresher, which reaches for the app router. Its own behaviour
// is covered in market-refresher.test.tsx; here it only has to not throw.
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Both have their own suites; here they only need to be identifiable and not reach the network.
jest.mock("../../app/components/exchange-ticker", () => ({
  ExchangeTicker: ({ initial }: { initial: { listed: number } }) => (
    <div data-testid="exchange-ticker" data-listed={initial.listed} />
  ),
}));

jest.mock("../../app/components/tier-movers", () => ({
  TierMovers: () => <div data-testid="tier-movers" />,
}));

jest.mock("../../app/lib/bse-market", () => ({
  getBseBoard: jest.fn(),
  getBseMovers: jest.fn(),
}));

const { getBseBoard, getBseMovers } = require("../../app/lib/bse-market") as {
  getBseBoard: jest.Mock;
  getBseMovers: jest.Mock;
};

function breadth(advancing: number, declining: number, unchanged = 1) {
  return { advancing, declining, unchanged, traded: advancing + declining + unchanged };
}

type Tier = { count: number; breadth: ReturnType<typeof breadth>; averageChangePercent: number | null };

function board(): { summary: { listed: number; priced: number; totalMarketCapCr: number; breadth: ReturnType<typeof breadth>; byTier: Record<"Large" | "Mid" | "Small", Tier>; sessionDate: string | null } } {
  return {
    summary: {
      listed: 4949,
      priced: 3800,
      totalMarketCapCr: 4_512_345,
      breadth: breadth(2100, 1600),
      byTier: {
        Large: { count: 100, breadth: breadth(60, 39), averageChangePercent: 0.82 },
        Mid: { count: 150, breadth: breadth(80, 69), averageChangePercent: -0.41 },
        Small: { count: 3550, breadth: breadth(1960, 1492), averageChangePercent: 0 },
      },
      sessionDate: "2026-08-14",
    },
  };
}

function row(ticker: string, returnPercent: number) {
  return { code: `c-${ticker}`, ticker, name: `${ticker} Ltd`, returnPercent };
}

/** Answers each ranking with a row named after what was asked for, so mix-ups are visible. */
function serveMovers(overrides: { empty?: boolean; rows?: number } = {}) {
  getBseBoard.mockResolvedValue(board());
  getBseMovers.mockImplementation(async ({ tier, direction, period }: { tier: string; direction: string; period: string }) => ({
    rows: overrides.empty
      ? []
      : Array.from({ length: overrides.rows ?? 1 }, (_, index) =>
          row(
            `${tier}-${direction}-${period}${index === 0 ? "" : `-${index}`}`.toUpperCase(),
            direction === "gainers" ? 9.5 : -7.25,
          ),
        ),
    period,
    periodFrom: null,
    total: 1,
    page: 1,
    pageSize: 5,
    pages: 1,
    sessionDate: "2026-08-14",
  }));
}

/** Server components return a promise; rendering one means awaiting it first. */
async function renderPayload() {
  render(await LiveMarketPayload());
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("formatCrore", () => {
  it("switches to lakh crore once the figure stops being readable", () => {
    expect(formatCrore(4_512_345)).toBe("₹45.12 lakh Cr");
    expect(formatCrore(87_500)).toBe("₹87,500 Cr");
  });
});

describe("LiveMarketPayload", () => {
  it("labels the week's two cards for the window they actually measure", async () => {
    serveMovers();
    await renderPayload();

    // Not "yesterday": the feed has no previous-session ranking, so the cards are named for the
    // window they can genuinely report.
    const up = screen.getByRole("region", { name: "Top performers this week" });
    const down = screen.getByRole("region", { name: "Top non-performers this week" });
    expect(within(up).getByText("ALL-GAINERS-1W")).toBeInTheDocument();
    expect(within(down).getByText("ALL-LOSERS-1W")).toBeInTheDocument();
  });

  it("hands the exchange strip and the tier panel their own places", async () => {
    serveMovers();
    await renderPayload();

    // The summary is seeded from this server render; the tier lists page themselves from the API.
    expect(screen.getByTestId("exchange-ticker")).toHaveAttribute("data-listed", "4949");
    expect(screen.getByTestId("tier-movers")).toBeInTheDocument();
  });

  it("signs the moves and carries each company's mark", async () => {
    serveMovers();
    await renderPayload();

    const up = screen.getByRole("region", { name: "Top performers this week" });
    expect(within(up).getByText("+9.50%")).toBeInTheDocument();
    expect(within(up).getByTestId("logo-ALL-GAINERS-1W")).toBeInTheDocument();
  });

  it("says so when the week had no movers rather than showing an empty list", async () => {
    serveMovers({ empty: true });
    await renderPayload();

    expect(screen.getByText("Nothing higher across the exchange this week.")).toBeInTheDocument();
    expect(screen.getByText("Nothing lower across the exchange this week.")).toBeInTheDocument();
  });
});

describe("LiveMarketBoard", () => {
  it("streams the payload behind its own fallback", () => {
    serveMovers();
    render(<LiveMarketBoard />);

    // The heading is in the shell and flushes immediately; the rankings arrive behind Suspense.
    expect(screen.getByText("Where the BSE is right now")).toBeInTheDocument();
    expect(document.getElementById("live-market")).toBeInTheDocument();
  });

  it("holds the section's shape while the exchange is still answering", () => {
    const { container } = render(<LiveMarketFallback />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
