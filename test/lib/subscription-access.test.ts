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

  it("grants every AI feature, Elite included, for the first three calendar days after signup", () => {
    const status = accessStatusFor(newUser as never, "2026-08-03");

    expect(status).toMatchObject({
      state: "trial",
      allowed: true,
      tier: "elite",
      planName: "Elite",
      marketDaysLeft: 1,
      trialEndsAt: "2026-08-04",
    });
    // One from each tier: the trial is the whole product for three days, not a sample of the
    // cheapest part of it.
    expect(canUseFeature(status, {}, "market-pulse")).toBe(true);
    expect(canUseFeature(status, {}, "research")).toBe(true);
    expect(canUseFeature(status, {}, "intel")).toBe(true);
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
    // Everything the trial opened closes again, at every tier, until something is bought.
    expect(canUseFeature(status, {}, "market-pulse")).toBe(false);
    expect(canUseFeature(status, {}, "research")).toBe(false);
    expect(canUseFeature(status, {}, "intel")).toBe(false);
  });

  describe("comped test accounts", () => {
    const { featureKeys } = require("../../app/lib/subscription") as typeof import("../../app/lib/subscription");
    const { TEST_ACCESS_UNTIL } = require("../../app/lib/admin-access") as typeof import("../../app/lib/admin-access");

    const TESTERS = [
      "chiragpandey678@gmail.com",
      "pankajdubae@gmail.com",
      "s77464524@gmail.com",
      "levime7908@careney.com",
      "jitu050288@gmail.com",
    ];

    // Well past the three-day trial, so nothing here can be passing on the trial's coat-tails.
    const DURING = "2026-09-01";

    it.each(TESTERS)("unlocks every AI feature for %s", (email) => {
      const status = accessStatusFor({ ...newUser, email } as never, DURING);

      expect(status).toMatchObject({
        state: "active",
        allowed: true,
        tier: "elite",
        planName: "Elite",
        subscribedUntil: TEST_ACCESS_UNTIL,
      });

      // Every feature the app gates, not a sample of three — the ask was that nothing of any tier
      // stays locked, and a spot check could not show that.
      const locked = featureKeys().filter((feature) => !canUseFeature(status, {}, feature));
      expect(locked).toEqual([]);
    });

    it("matches an address however it was typed", () => {
      const status = accessStatusFor({ ...newUser, email: "  ChiragPandey678@Gmail.com " } as never, DURING);
      expect(status.tier).toBe("elite");
    });

    it("does not hand them the back office", () => {
      // Elite access, not admin. A comped tester must not be able to open the user list.
      const status = accessStatusFor({ ...newUser, email: TESTERS[0] } as never, DURING);
      expect(status.isAdmin).toBe(false);
      expect(status.state).not.toBe("admin");
    });

    it("expires on the stated day rather than running for ever", () => {
      const lastDay = accessStatusFor({ ...newUser, email: TESTERS[0] } as never, TEST_ACCESS_UNTIL);
      expect(lastDay.tier).toBe("elite");

      const dayAfter = accessStatusFor({ ...newUser, email: TESTERS[0] } as never, "2026-09-15");
      expect(dayAfter).toMatchObject({ state: "expired", allowed: false, tier: null });
    });

    it("leaves everybody else exactly as they were", () => {
      const stranger = accessStatusFor({ ...newUser, email: "someone@example.com" } as never, DURING);
      expect(stranger).toMatchObject({ state: "expired", allowed: false, tier: null });
    });
  });

  it("reopens only what was actually bought once the trial has lapsed", () => {
    // The point of closing the trial at Elite: what comes back is the plan, not the trial.
    const starter = accessStatusFor({ ...newUser, plan: "Starter", subscribedUntil: "2026-09-01" } as never, "2026-08-10");

    expect(starter).toMatchObject({ state: "active", tier: "starter", planName: "Starter" });
    expect(canUseFeature(starter, {}, "market-pulse")).toBe(true);
    expect(canUseFeature(starter, {}, "research")).toBe(false);
    expect(canUseFeature(starter, {}, "intel")).toBe(false);
  });
});
