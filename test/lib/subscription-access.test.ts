type AccessStatus = {
  state: "admin" | "trial" | "active" | "expired";
  allowed: boolean;
  tier: "starter" | "pro" | "elite" | null;
  planName: "Starter" | "Pro" | "Elite" | null;
  isAdmin: boolean;
  marketDaysUsed: number;
  marketDaysLeft: number;
  trialStartedAt: string | null;
  subscribedUntil: string | null;
  today: string;
};

const webGlobal = globalThis as typeof globalThis & { Request?: typeof Request };
webGlobal.Request ??= class {} as unknown as typeof Request;

const { canUseFeature } = require("../../app/lib/subscription") as typeof import("../../app/lib/subscription");

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
    subscribedUntil: tier ? "2026-09-10" : null,
    today: "2026-08-11",
  };
}

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
});
