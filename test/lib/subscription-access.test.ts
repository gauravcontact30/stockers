type AccessStatus = {
  state: "admin" | "trial" | "active" | "expired";
  allowed: boolean;
  tier: "starter" | "pro" | "elite" | null;
  planName: "Starter" | "Pro" | "Elite" | null;
  isAdmin: boolean;
  marketDaysUsed: number;
  marketDaysLeft: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscribedUntil: string | null;
  today: string;
};

const webGlobal = globalThis as typeof globalThis & { Request?: typeof Request };
webGlobal.Request ??= class {} as unknown as typeof Request;

const { accessStatusFor, canUseFeature } = require("../../app/lib/subscription") as typeof import("../../app/lib/subscription");

function activeStatus(tier: AccessStatus["tier"]): AccessStatus {
  return {
    state: tier ? "active" : "expired",
    allowed: tier !== null,
    tier,
    planName: tier === "elite" ? "Elite" : tier === "pro" ? "Pro" : tier === "starter" ? "Starter" : null,
    isAdmin: false,
    marketDaysUsed: 5,
    marketDaysLeft: 0,
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    trialEndsAt: "2026-08-04",
    subscribedUntil: tier ? "2026-09-10" : null,
    today: "2026-08-11",
  };
}

const newUser = {
  id: "u1",
  name: "Aarav",
  email: "aarav@example.com",
  passwordHash: "hash",
  plan: "Starter",
  createdAt: "2026-08-01T04:00:00.000Z",
  trialStartedAt: "2026-08-01T04:00:00.000Z",
};

describe("server feature access", () => {
  it("allows each paid tier to use only the AI features bundled into that tier", () => {
    expect(canUseFeature(activeStatus("starter"), {}, "market-pulse")).toBe(true);
    expect(canUseFeature(activeStatus("starter"), {}, "research")).toBe(false);

    expect(canUseFeature(activeStatus("pro"), {}, "market-pulse")).toBe(true);
    expect(canUseFeature(activeStatus("pro"), {}, "research")).toBe(true);
    expect(canUseFeature(activeStatus("pro"), {}, "intel")).toBe(false);

    expect(canUseFeature(activeStatus("elite"), {}, "market-pulse")).toBe(true);
    expect(canUseFeature(activeStatus("elite"), {}, "research")).toBe(true);
    expect(canUseFeature(activeStatus("elite"), {}, "intel")).toBe(true);
  });

  it("keeps admin locks above paid entitlements", () => {
    expect(canUseFeature(activeStatus("elite"), { intel: true }, "intel")).toBe(false);
  });

  it("grants Starter and Pro AI features for the first three calendar days after signup", () => {
    const status = accessStatusFor(newUser as never, "2026-08-03");

    expect(status).toMatchObject({
      state: "trial",
      allowed: true,
      tier: "pro",
      planName: "Pro",
      marketDaysLeft: 1,
      trialEndsAt: "2026-08-04",
    });
    expect(canUseFeature(status, {}, "market-pulse")).toBe(true);
    expect(canUseFeature(status, {}, "research")).toBe(true);
    expect(canUseFeature(status, {}, "intel")).toBe(false);
  });

  it("locks every AI tier automatically when the three-day trial expires", () => {
    const status = accessStatusFor(newUser as never, "2026-08-04");

    expect(status).toMatchObject({
      state: "expired",
      allowed: false,
      tier: null,
      planName: null,
      marketDaysLeft: 0,
    });
    expect(canUseFeature(status, {}, "market-pulse")).toBe(false);
    expect(canUseFeature(status, {}, "research")).toBe(false);
  });
});
