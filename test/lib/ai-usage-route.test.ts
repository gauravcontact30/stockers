/** @jest-environment node */

// The route behind the AI Operations panel.
//
// Two things are load-bearing here. The access check, because this answers with a detailed map of
// what the deployment runs, what it costs and where it is failing — and it can be called directly,
// whatever the dashboard chooses to show. And the `configured` flag, because without it an empty
// report is ambiguous: a deployment with no key and one nobody has used look identical from a list
// of zero calls.

import { promises as fs } from "node:fs";
import path from "node:path";
import { GET } from "../../app/api/admin/ai-usage/route";
import { MAX_DAYS, rangeFrom } from "../../app/api/admin/ai-usage/helpers";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";
import { recordAiCall, resetAiTelemetry } from "../../app/lib/ai-telemetry";
import type { AiUsageReport } from "../../app/lib/ai-usage-report";
import { createToken, type AppUser } from "../../app/lib/store";

const usersPath = process.env.STOCKERS_USERS_FILE as string;

function account(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_regular",
    name: "Regular User",
    email: "regular@example.com",
    passwordHash: "salt:hash",
    plan: "Starter",
    createdAt: "2026-08-01T00:00:00.000Z",
    mobile: "9876543210",
    role: "user",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    subscribedUntil: null,
    emailVerifiedAt: null,
    verificationToken: null,
    ...overrides,
  };
}

const superAdmin = account({ id: "user_super", name: "Garv", email: SUPER_ADMIN_EMAIL, role: "admin" });
const regular = account();

async function writeRoster(users: AppUser[]) {
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, JSON.stringify(users, null, 2), "utf8");
}

let originalRoster: string | null = null;

beforeAll(async () => {
  originalRoster = await fs.readFile(usersPath, "utf8").catch(() => null);
});

beforeEach(() => {
  resetAiTelemetry();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

afterEach(async () => {
  if (originalRoster === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, originalRoster, "utf8");
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

function request(user: AppUser | null, query = "") {
  return new Request(`http://localhost/api/admin/ai-usage${query}`, {
    headers: user ? { Authorization: `Bearer ${createToken(user)}` } : {},
  });
}

type Payload = AiUsageReport & { configured: boolean; model: string | null };

describe("rangeFrom", () => {
  it("defaults to a week", () => {
    expect(rangeFrom(null)).toBe(1);
    expect(rangeFrom("not a number")).toBe(1);
    expect(rangeFrom("0")).toBe(1);
    expect(rangeFrom("-5")).toBe(1);
  });

  it("takes a window it is given", () => {
    expect(rangeFrom("1")).toBe(1);
    expect(rangeFrom("30")).toBe(30);
  });

  it("refuses to be talked into an unbounded one", () => {
    expect(rangeFrom("100000")).toBe(MAX_DAYS);
  });
});

describe("GET /api/admin/ai-usage", () => {
  it("refuses a caller with no session", async () => {
    await writeRoster([regular]);

    const response = await GET(request(null));

    expect(response.status).toBe(403);
  });

  it("refuses a signed-in reader who is not an admin", async () => {
    await writeRoster([regular]);

    const response = await GET(request(regular));

    // The dashboard hides itself from them, but that is presentation — this can be called directly.
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Administrators only." });
  });

  it("answers the super admin", async () => {
    await writeRoster([superAdmin]);

    const response = await GET(request(superAdmin));

    expect(response.status).toBe(200);
    // One admin's view of what the whole deployment is spending: never stored, and never by a
    // cache anything else can read from.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers a role admin who is not the super admin", async () => {
    const admin = account({ id: "user_admin", email: "ops@example.com", role: "admin" });
    await writeRoster([admin]);

    expect((await GET(request(admin))).status).toBe(200);
  });

  it("reports the calls that were recorded", async () => {
    await writeRoster([superAdmin]);
    recordAiCall({ feature: "board-read", model: "openai/gpt-4.1-mini", outcome: "ok", ms: 800, promptTokens: 100, completionTokens: 40, costUsd: 0.001 });
    recordAiCall({ feature: "intel-search", model: "openai/gpt-4.1-mini", outcome: "failed", ms: 25_000, status: 429 });

    const payload = (await (await GET(request(superAdmin))).json()) as Payload;

    expect(payload.counts).toMatchObject({ ok: 1, failed: 1, total: 2 });
    expect(payload.fallbackRate).toBe(50);
    expect(payload.features.map((slice) => slice.key).sort()).toEqual(["board-read", "intel-search"]);
    expect(payload.recentFailures).toHaveLength(1);
  });

  it("says whether a model is configured at all, so an empty report is not ambiguous", async () => {
    await writeRoster([superAdmin]);

    const unconfigured = (await (await GET(request(superAdmin))).json()) as Payload;
    expect(unconfigured).toMatchObject({ configured: false, model: null });

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

    const configured = (await (await GET(request(superAdmin))).json()) as Payload;
    expect(configured).toMatchObject({ configured: true, model: "anthropic/claude-sonnet-5" });
  });

  it("charts a bar per day across the window it was asked for", async () => {
    await writeRoster([superAdmin]);

    const payload = (await (await GET(request(superAdmin, "?days=7"))).json()) as Payload;

    expect(payload.days).toBe(7);
    expect(payload.daily).toHaveLength(7);
    expect(payload.daily[payload.daily.length - 1].day).toBe(payload.today);
  });

  it("narrows to a single day when asked", async () => {
    await writeRoster([superAdmin]);

    const payload = (await (await GET(request(superAdmin, "?days=1"))).json()) as Payload;

    expect(payload.daily).toHaveLength(1);
  });

  it("says the figures are one process's own when there is no durable store", async () => {
    await writeRoster([superAdmin]);

    const payload = (await (await GET(request(superAdmin))).json()) as Payload;

    // The panel warns the reader on the strength of this, so a serverless deployment is not read
    // as the whole picture.
    expect(payload).toMatchObject({ backend: "memory", processLocal: true });
  });
});
