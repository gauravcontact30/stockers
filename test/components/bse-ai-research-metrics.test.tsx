import { render, screen } from "@testing-library/react";
import { BseAiResearchMetrics } from "../../app/components/bse-ai-research-metrics";
import { getAuthorizedBseAiAnalysis } from "../../app/lib/bse-ai-analysis";
import { findUserById, verifyToken } from "../../app/lib/store";
import { cookies } from "next/headers";

const mockClientSpy = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

jest.mock("../../app/lib/store", () => ({
  SESSION_COOKIE: "stockers_session",
  verifyToken: jest.fn(),
  findUserById: jest.fn(),
}));

jest.mock("../../app/lib/bse-ai-analysis", () => ({
  getAuthorizedBseAiAnalysis: jest.fn(),
}));

jest.mock("../../app/components/bse-ai-research-metrics-client", () => ({
  BseAiResearchMetricsClient: (props: unknown) => {
    mockClientSpy(props);
    return <pre data-testid="client-props">{JSON.stringify(props)}</pre>;
  },
}));

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockedFindUserById = findUserById as jest.MockedFunction<typeof findUserById>;
const mockedGetAuthorizedBseAiAnalysis = getAuthorizedBseAiAnalysis as jest.MockedFunction<typeof getAuthorizedBseAiAnalysis>;

const user = {
  id: "user_1",
  name: "Research User",
  email: "research@example.com",
  passwordHash: "salt:hash",
  plan: "Pro",
  role: "user",
  createdAt: "2026-08-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedCookies.mockResolvedValue({
    get: jest.fn(() => ({ value: "session-token" })),
  } as never);
  mockedVerifyToken.mockReturnValue("user_1");
  mockedFindUserById.mockResolvedValue(user as never);
  mockedGetAuthorizedBseAiAnalysis.mockResolvedValue({
    ok: true,
    data: {
      securityCode: "500002",
      companyName: "ABB India Ltd",
      currency: "INR",
      asOf: "2026-03-06",
      measures: {
        latestClose: 164,
        previousClose: 163,
        oneDayReturnPercent: 0.61,
        twentySessionReturnPercent: 13.1,
        sixtySessionReturnPercent: 64,
        oneYearReturnPercent: null,
        annualizedVolatility20SessionPercent: 8.25,
        drawdownFromHighPercent: -2.5,
        averageVolume20Session: 100032,
        high52Week: 170,
        low52Week: 95,
        support20Session: 144,
        resistance20Session: 166,
      },
      analysis: {
        source: "ai",
        summary: "Validated BSE price history shows constructive momentum with manageable risk.",
        trend: "Bullish",
        risk: "Moderate",
        signals: ["Price is above the recent support band."],
        warnings: ["The drawdown profile should still be watched."],
        actionItems: ["Track the next close against resistance."],
        confidence: 72,
      },
    },
  } as never);
});

describe("BseAiResearchMetrics", () => {
  it("authenticates on the server and passes only formatted display values to the client child", async () => {
    render(await BseAiResearchMetrics({ securityCode: "500002" }));

    expect(mockedGetAuthorizedBseAiAnalysis).toHaveBeenCalledWith("500002", user);
    const payload = JSON.parse(screen.getByTestId("client-props").textContent ?? "{}") as {
      view: {
        title: string;
        subtitle: string;
        metrics: { label: string; value: string; hint: string }[];
        summary: string;
      };
    };

    expect(payload.view.title).toBe("ABB India Ltd / BSE 500002");
    expect(payload.view.subtitle).toContain("Support ₹144.00");
    expect(payload.view.metrics[0]).toMatchObject({ label: "Latest close", value: "₹164.00", hint: "Previous ₹163.00" });
    expect(payload.view.metrics[1]).toMatchObject({ label: "1D return", value: "+0.61%" });
    expect(payload.view.metrics.every((metric) => typeof metric.value === "string" && typeof metric.hint === "string")).toBe(true);
    expect(JSON.stringify(payload.view)).not.toContain("latestClose");
    expect(JSON.stringify(payload.view)).not.toContain("previousClose");
    expect(JSON.stringify(payload.view)).not.toContain("measures");
    expect(mockClientSpy).toHaveBeenCalledTimes(1);
  });
});
