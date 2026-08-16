/** @jest-environment node */

import { fetchBseAiAnalysis } from "../../app/actions/fetch-bse-ai-analysis";
import { chatJson } from "../../app/lib/openrouter";
import { canUseFeature, getAccessStatus, readFeatureLocks } from "../../app/lib/subscription";
import { findUserById, verifyToken } from "../../app/lib/store";
import { cookies } from "next/headers";

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("../../app/lib/store", () => ({
  SESSION_COOKIE: "stockers_session",
  verifyToken: jest.fn(),
  findUserById: jest.fn(),
}));

jest.mock("../../app/lib/subscription", () => ({
  getAccessStatus: jest.fn(),
  readFeatureLocks: jest.fn(),
  canUseFeature: jest.fn(),
  requiredPlanFor: jest.fn(() => "Pro"),
}));

jest.mock("../../app/lib/openrouter", () => ({
  chatJson: jest.fn(),
  extractJsonObject: jest.fn((text: string) => JSON.parse(text)),
}));

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockedFindUserById = findUserById as jest.MockedFunction<typeof findUserById>;
const mockedGetAccessStatus = getAccessStatus as jest.MockedFunction<typeof getAccessStatus>;
const mockedReadFeatureLocks = readFeatureLocks as jest.MockedFunction<typeof readFeatureLocks>;
const mockedCanUseFeature = canUseFeature as jest.MockedFunction<typeof canUseFeature>;
const mockedChatJson = chatJson as jest.MockedFunction<typeof chatJson>;

const user = {
  id: "user_1",
  name: "Research User",
  email: "research@example.com",
  passwordHash: "salt:hash",
  plan: "Pro",
  role: "user",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const status = {
  state: "active",
  allowed: true,
  tier: "pro",
  planName: "Pro",
  isAdmin: false,
  marketDaysUsed: 0,
  marketDaysLeft: 0,
  trialStartedAt: null,
  trialEndsAt: null,
  subscribedUntil: "2026-09-16",
  today: "2026-08-16",
};

function cookieStore(token: string | null) {
  return {
    get: jest.fn((name: string) => (name === "stockers_session" && token ? { value: token } : undefined)),
  };
}

function rows(count = 65) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100_000 + index,
    };
  });
}

function upstream(payload: unknown, ok = true) {
  global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => payload })) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn() as unknown as typeof fetch;
  process.env.STOCKERS_BSE_MICROSERVICE_URL = "https://bse-internal.example";
  process.env.STOCKERS_BSE_MICROSERVICE_TOKEN = "internal-service-token";
  mockedCookies.mockResolvedValue(cookieStore("session-token") as never);
  mockedVerifyToken.mockReturnValue("user_1");
  mockedFindUserById.mockResolvedValue(user as never);
  mockedGetAccessStatus.mockResolvedValue(status as never);
  mockedReadFeatureLocks.mockResolvedValue({});
  mockedCanUseFeature.mockReturnValue(true);
  mockedChatJson.mockImplementation(async (options) =>
    options.parse(
      JSON.stringify({
        summary: "Validated BSE price history shows constructive momentum with manageable risk and enough liquidity for continued monitoring.",
        trend: "Bullish",
        risk: "Moderate",
        signals: ["Price is above the recent support band."],
        warnings: ["The drawdown profile should still be watched."],
        actionItems: ["Track the next close against resistance."],
        confidence: 72,
      }),
    ),
  );
});

afterEach(() => {
  delete process.env.STOCKERS_BSE_MICROSERVICE_URL;
  delete process.env.STOCKERS_BSE_MICROSERVICE_TOKEN;
});

describe("fetchBseAiAnalysis", () => {
  it("rejects injection-shaped BSE security codes before auth or upstream calls", async () => {
    const result = await fetchBseAiAnalysis("500002;DROP TABLE prices");

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mockedCookies).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedChatJson).not.toHaveBeenCalled();
  });

  it("requires a signed-in session inside the server action", async () => {
    mockedCookies.mockResolvedValue(cookieStore(null) as never);
    mockedVerifyToken.mockReturnValue(null);

    const result = await fetchBseAiAnalysis("500002");

    expect(result).toMatchObject({ ok: false, code: "AUTHENTICATION_REQUIRED" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedChatJson).not.toHaveBeenCalled();
  });

  it("enforces the research entitlement inside the server action", async () => {
    mockedCanUseFeature.mockReturnValue(false);

    const result = await fetchBseAiAnalysis("500002");

    expect(result).toMatchObject({ ok: false, code: "AUTHORIZATION_REQUIRED", requiredPlan: "Pro" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedChatJson).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads from the internal BSE microservice", async () => {
    upstream({ securityCode: "500002", currency: "INR", prices: [{ date: "2026-01-01", close: 100 }] });

    const result = await fetchBseAiAnalysis("500002");

    expect(result).toMatchObject({ ok: false, code: "UPSTREAM_DATA_INVALID" });
    expect(mockedChatJson).not.toHaveBeenCalled();
  });

  it("queries the internal service and returns computed measures plus schema-checked AI analysis", async () => {
    upstream({ securityCode: "500002", companyName: "ABB India Ltd", currency: "INR", prices: rows() });

    const result = await fetchBseAiAnalysis("500002");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("https://bse-internal.example/v1/bse/historical-prices"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer internal-service-token" }),
        body: JSON.stringify({ securityCode: "500002" }),
        cache: "no-store",
      }),
    );
    expect(result.data).toMatchObject({
      securityCode: "500002",
      companyName: "ABB India Ltd",
      asOf: "2026-03-06",
      analysis: { source: "ai", trend: "Bullish", risk: "Moderate", confidence: 72 },
    });
    expect(result.data.measures.latestClose).toBe(164);
    expect(result.data.measures.oneDayReturnPercent).toBe(0.61);
    expect(result.data.measures.twentySessionReturnPercent).toBe(13.89);
    expect(mockedChatJson).toHaveBeenCalledWith(expect.objectContaining({ feature: "bse-ai-analysis-action", temperature: 0.2 }));
  });

  it("falls back to computed measures when the LLM response is unusable", async () => {
    mockedChatJson.mockResolvedValue(null);
    upstream({ securityCode: "500002", currency: "INR", prices: rows() });

    const result = await fetchBseAiAnalysis("500002");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.data.analysis.source).toBe("fallback");
    expect(result.data.measures.latestClose).toBe(164);
  });
});
