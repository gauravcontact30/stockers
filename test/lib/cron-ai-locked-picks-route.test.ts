/**
 * Who is allowed to fire the 8:50 AM IST lock.
 *
 * The endpoint answered 401 to Vercel's own scheduler on any deployment where `CRON_SECRET` had
 * not been set — which is the state this repository ships in. From the outside that is
 * indistinguishable from a lock that simply did not run: the morning passed, no list was written,
 * and the landing page built its own later on, after the open, from a different code path.
 */
jest.mock("../../app/lib/bse-ai-prediction-accuracy", () => ({
  runDailyPredictionLock: jest.fn(),
}));

jest.mock("../../app/lib/store", () => ({
  userFromRequest: jest.fn(),
}));

jest.mock("../../app/lib/admin-access", () => ({
  isAdminEmail: jest.fn(() => false),
  isSuperAdminEmail: jest.fn(() => false),
}));

import { GET, POST } from "../../app/api/cron/ai-locked-picks/route";
import { runDailyPredictionLock, type PredictionLockAction } from "../../app/lib/bse-ai-prediction-accuracy";
import { userFromRequest } from "../../app/lib/store";

const lock = runDailyPredictionLock as jest.MockedFunction<typeof runDailyPredictionLock>;
const user = userFromRequest as jest.MockedFunction<typeof userFromRequest>;

const URL_BASE = "https://stockers.test/api/cron/ai-locked-picks";

function run(action: PredictionLockAction) {
  return {
    ok: true,
    action,
    date: "2026-08-19",
    lockAt: "2026-08-19T08:50:00+05:30",
    nextLockAt: "2026-08-20T08:50:00+05:30",
    tradingDay: true,
    source: "ai" as const,
    model: "test/model",
    generatedAt: "2026-08-19T03:20:00.000Z",
    picks: { Large: 10, Mid: 10, Small: 10 },
    holidayCalendarThrough: "2027-04-14",
    message: "ok",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.CRON_SECRET;
  user.mockResolvedValue(null);
  lock.mockResolvedValue(run("generated"));
});

describe("the scheduled lock endpoint", () => {
  it("refuses a request that presents nothing at all", async () => {
    const response = await GET(new Request(URL_BASE));

    expect(response.status).toBe(401);
    expect(lock).not.toHaveBeenCalled();
  });

  it("runs for Vercel's scheduler on a deployment with no secret configured", async () => {
    const response = await GET(new Request(URL_BASE, { headers: { "x-vercel-cron": "1" } }));

    expect(response.status).toBe(200);
    expect(lock).toHaveBeenCalledWith(expect.any(Date), { force: false });
  });

  it("runs for a scheduler presenting the configured secret", async () => {
    process.env.CRON_SECRET = "s3cret";

    await expect(
      GET(new Request(URL_BASE, { headers: { authorization: "Bearer s3cret" } })).then((r) => r.status),
    ).resolves.toBe(200);
    await expect(
      POST(new Request(URL_BASE, { method: "POST", headers: { "x-cron-secret": "s3cret" } })).then((r) => r.status),
    ).resolves.toBe(200);
    await expect(
      GET(new Request(URL_BASE, { headers: { authorization: "Bearer wrong" } })).then((r) => r.status),
    ).resolves.toBe(401);
  });

  // The header is not proof of anything on its own, so it opens only the idempotent run. Re-locking
  // a day that already has a list is the one way the ten stocks change between one 8:50 and the
  // next, and that stays with the secret and with admins.
  it("will not re-lock a day on the header alone", async () => {
    const response = await GET(new Request(`${URL_BASE}?force=true`, { headers: { "x-vercel-cron": "1" } }));

    expect(response.status).toBe(401);
    expect(lock).not.toHaveBeenCalled();
  });

  it("lets an admin re-lock by hand", async () => {
    user.mockResolvedValue({ id: "u1", email: "admin@stockers.test", role: "admin" } as never);

    const response = await GET(new Request(`${URL_BASE}?force=true`, { headers: { "x-vercel-cron": "1" } }));

    expect(response.status).toBe(200);
    expect(lock).toHaveBeenCalledWith(expect.any(Date), { force: true });
  });

  it("answers 503 when the run could not assemble a list", async () => {
    lock.mockResolvedValue({ ...run("failed"), ok: false });

    const response = await GET(new Request(URL_BASE, { headers: { "x-vercel-cron": "1" } }));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
