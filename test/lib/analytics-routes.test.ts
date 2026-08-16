/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { GET, rangeFrom } from "../../app/api/admin/analytics/route";
import { POST } from "../../app/api/analytics/track/route";
import { istDay, resetAnalyticsThrottle, listEvents, VISITOR_COOKIE } from "../../app/lib/analytics";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";
import { createToken, type AppUser } from "../../app/lib/store";

const usersPath = process.env.STOCKERS_USERS_FILE as string;
const eventsPath = process.env.STOCKERS_ANALYTICS_FILE as string;

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

const superAdmin = account({ id: "user_super", name: "Garv Tuts", email: SUPER_ADMIN_EMAIL, role: "admin" });
const excludedOperator = account({ id: "user_operator", name: "Gaurav Contact", email: "gauravcontact66@gmail.com", role: "admin" });
const regular = account();

async function writeRoster(users: AppUser[]) {
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, JSON.stringify(users, null, 2), "utf8");
}

let originalRoster: string | null = null;

beforeAll(async () => {
  originalRoster = await fs.readFile(usersPath, "utf8").catch(() => null);
});

beforeEach(async () => {
  await fs.rm(eventsPath, { force: true });
  resetAnalyticsThrottle();
});

afterEach(async () => {
  if (originalRoster === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, originalRoster, "utf8");
  await fs.rm(eventsPath, { force: true });
});

function trackRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/analytics/track", () => {
  it("records a page view from a signed-out visitor", async () => {
    const response = await POST(
      trackRequest(
        { path: "/news?q=secret", referrer: "https://news.example.com/story", visitorId: "vabc12345678" },
        { "user-agent": "Mozilla/5.0 (iPhone) Mobile/15E148" },
      ),
    );

    expect(response.status).toBe(204);

    const [event] = await listEvents("1970-01-01");
    expect(event).toMatchObject({
      type: "visit",
      // The query string is dropped on the way in — that is where the personal data is.
      path: "/news",
      referrer: "news.example.com",
      visitorId: "vabc12345678",
      device: "mobile",
      userId: null,
    });
  });

  it("attributes the view to the account behind the session token", async () => {
    await writeRoster([regular]);

    await POST(trackRequest({ path: "/overview", visitorId: "vabc12345678" }, { Authorization: `Bearer ${createToken(regular)}` }));

    const [event] = await listEvents("1970-01-01");
    expect(event.userId).toBe(regular.id);
  });

  it("records nothing for excluded operator accounts", async () => {
    await writeRoster([superAdmin]);

    const response = await POST(
      trackRequest({ path: "/analytics", visitorId: "vabc12345678" }, { Authorization: `Bearer ${createToken(superAdmin)}` }),
    );

    expect(response.status).toBe(204);
    expect(await listEvents("1970-01-01")).toEqual([]);
  });

  it("answers 204 and records nothing for a body it cannot read", async () => {
    const response = await POST(trackRequest("{not json"));

    expect(response.status).toBe(204);
    expect(await listEvents("1970-01-01")).toEqual([]);
  });

  it("stores nothing it was not willing to accept", async () => {
    await POST(trackRequest({ path: "https://evil.example.com/x", referrer: "nonsense", visitorId: "short" }));

    const [event] = await listEvents("1970-01-01");
    expect(event).toMatchObject({ path: null, referrer: null, visitorId: null });
  });

  it("folds a reload of the same page by the same visitor into the first view", async () => {
    const body = { path: "/", visitorId: "vabc12345678" };

    await POST(trackRequest(body));
    await POST(trackRequest(body));

    expect(await listEvents("1970-01-01")).toHaveLength(1);
  });

  it("records an interaction, keeping only the action and the label", async () => {
    await POST(
      trackRequest({
        type: "action",
        action: "stock.open",
        label: "RELIANCE",
        path: "/overview",
        visitorId: "vabc12345678",
        sessionId: "sabc12345678",
      }),
    );

    const [event] = await listEvents("1970-01-01");
    expect(event).toMatchObject({
      type: "action",
      action: "stock.open",
      label: "RELIANCE",
      path: "/overview",
      sessionId: "sabc12345678",
    });
  });

  it("stores nothing at all for an action it does not recognise", async () => {
    await POST(trackRequest({ type: "action", action: "made.up", label: "x", visitorId: "vabc12345678" }));

    expect(await listEvents("1970-01-01")).toEqual([]);
  });

  it("refuses a label that could carry what somebody typed", async () => {
    await POST(
      trackRequest({ type: "action", action: "ai.ask", label: "should I sell my reliance shares?", visitorId: "vabc12345678" }),
    );

    expect((await listEvents("1970-01-01"))[0]).toMatchObject({ action: "ai.ask", label: null });
  });
});

describe("GET /api/admin/analytics", () => {
  function adminRequest(caller: AppUser | null, query = "") {
    return new Request(`http://localhost/api/admin/analytics${query}`, {
      headers: caller ? { Authorization: `Bearer ${createToken(caller)}` } : {},
    });
  }

  it("refuses a caller who is not an admin", async () => {
    await writeRoster([superAdmin, regular]);

    for (const caller of [null, regular]) {
      const response = await GET(adminRequest(caller));
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("Admin access required.");
    }
  });

  it("reports traffic, features and the people behind them to an admin", async () => {
    await writeRoster([superAdmin, regular]);
    const day = istDay();
    await fs.writeFile(
      eventsPath,
      JSON.stringify([
        { id: "e1", type: "visit", at: `${day}T04:00:00.000Z`, day, userId: regular.id, visitorId: null, feature: null, path: "/", referrer: null, device: "desktop", blocked: false },
        { id: "e2", type: "signin", at: `${day}T04:05:00.000Z`, day, userId: regular.id, visitorId: null, feature: null, path: null, referrer: null, device: null, blocked: false },
        { id: "e3", type: "feature", at: `${day}T04:10:00.000Z`, day, userId: regular.id, visitorId: null, feature: "intel", path: null, referrer: null, device: null, blocked: false },
        { id: "e4", type: "visit", at: `${day}T04:15:00.000Z`, day, userId: null, visitorId: "vabc12345678", feature: null, path: "/news", referrer: null, device: "mobile", blocked: false },
      ]),
      "utf8",
    );

    const response = await GET(adminRequest(superAdmin, "?days=7"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.today).toMatchObject({ views: 2, signins: 1, featureOpens: 1, visitors: 2, activeUsers: 1, guests: 1 });
    expect(payload.trending).toMatchObject({ key: "intel", opens: 1 });
    expect(payload.range.days).toBe(7);
    // The contact details the dashboard shows are joined on from the account store, not stored
    // against the events themselves.
    expect(payload.users[0]).toMatchObject({ name: regular.name, email: regular.email, mobile: regular.mobile });
    expect(payload.recent).toHaveLength(4);
  });

  it("keeps excluded operator accounts out of the admin traffic report even when old rows exist", async () => {
    await writeRoster([superAdmin, excludedOperator, regular]);
    const day = istDay();
    await fs.writeFile(
      eventsPath,
      JSON.stringify([
        { id: "e1", type: "visit", at: `${day}T04:00:00.000Z`, day, userId: superAdmin.id, visitorId: null, feature: null, action: null, label: null, path: "/analytics", referrer: null, device: "desktop", blocked: false },
        { id: "e2", type: "action", at: `${day}T04:10:00.000Z`, day, userId: excludedOperator.id, visitorId: null, feature: null, action: "stock.open", label: "RELIANCE", path: "/overview", referrer: null, device: "desktop", blocked: false },
        { id: "e3", type: "visit", at: `${day}T04:15:00.000Z`, day, userId: regular.id, visitorId: null, feature: null, action: null, label: null, path: "/news", referrer: null, device: "mobile", blocked: false },
      ]),
      "utf8",
    );

    const response = await GET(adminRequest(superAdmin, "?days=7"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.today).toMatchObject({ views: 1, visitors: 1, activeUsers: 1 });
    expect(payload.users.map((user: { email: string }) => user.email)).toEqual([regular.email]);
    expect(payload.recent).toHaveLength(1);
    expect(payload.recent[0]).toMatchObject({ email: regular.email, path: "/news" });
  });

  it("answers an empty store with zeroes rather than an error", async () => {
    await writeRoster([superAdmin]);

    const payload = await (await GET(adminRequest(superAdmin))).json();

    expect(payload.totals).toMatchObject({ visitors: 0, views: 0, signins: 0, signups: 0 });
    expect(payload.features).toEqual([]);
    expect(payload.trending).toBeNull();
    expect(payload.daily).toHaveLength(30);
  });

  it("clamps the window rather than letting a URL choose how much to scan", () => {
    expect(rangeFrom(null)).toBe(30);
    expect(rangeFrom("7")).toBe(7);
    expect(rangeFrom("7.4")).toBe(7);
    expect(rangeFrom("0")).toBe(30);
    expect(rangeFrom("-5")).toBe(30);
    expect(rangeFrom("banana")).toBe(30);
    expect(rangeFrom("100000")).toBe(120);
  });

  it("reads the visitor cookie name the tracker writes", () => {
    expect(VISITOR_COOKIE).toBe("stockers_visitor");
  });
});

// The half of the analytics store that production actually runs on. Nothing is stubbed between it
// and `fetch`, so these cover the column mapping and the PostgREST query as one piece — the part
// that would otherwise only break against a real project.
describe("against Supabase", () => {
  const URL_BASE = "https://project-under-test.supabase.co";

  /** The super admin as one row of `public.users`, in the columns Postgres actually has. */
  const ADMIN_ROW = {
    id: superAdmin.id,
    name: superAdmin.name,
    email: superAdmin.email,
    password_hash: "salt:key",
    plan: "Elite",
    created_at: "2026-08-01T00:00:00.000Z",
    mobile: "9876543210",
    role: "admin",
    trial_started_at: null,
    subscribed_until: null,
    last_payment_id: null,
    email_verified_at: "2026-08-01T00:00:00.000Z",
    verification_token: null,
    verification_sent_at: null,
  };

  function reply(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Map(),
    } as unknown as Response;
  }

  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.SUPABASE_URL = URL_BASE;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-under-test";

    fetchMock = jest.fn(async (url: string) => (String(url).includes("/users") ? reply([ADMIN_ROW]) : reply([])));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("inserts a page view as a row of analytics_events", async () => {
    await POST(trackRequest({ path: "/news", visitorId: "vabc12345678" }, { "user-agent": "Mozilla/5.0 (Windows NT 10.0)" }));

    const insert = fetchMock.mock.calls.find(([url]) => String(url).includes("analytics_events"));
    expect(insert).toBeDefined();
    expect(insert?.[1]?.method).toBe("POST");
    // snake_case on the wire, camelCase in the app — the mapping is the thing under test.
    expect(JSON.parse(insert?.[1]?.body as string)).toMatchObject({
      type: "visit",
      path: "/news",
      visitor_id: "vabc12345678",
      device: "desktop",
      blocked: false,
      user_id: null,
    });
  });

  it("asks only for the window it needs, newest first", async () => {
    await GET(new Request("http://localhost/api/admin/analytics?days=7", { headers: { Authorization: `Bearer ${createToken(superAdmin)}` } }));

    const read = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes("analytics_events"));
    expect(read).toContain("day=gte.");
    expect(read).toContain("order=at.desc");
  });

  it("reports a read it could not make, rather than an empty site", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("analytics_events") ? reply({ message: "boom" }, 503) : reply([ADMIN_ROW]),
    );

    const response = await GET(
      new Request("http://localhost/api/admin/analytics", { headers: { Authorization: `Bearer ${createToken(superAdmin)}` } }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Couldn't read the analytics store.");
    expect(error).toHaveBeenCalled();
  });

  it("swallows a failed insert rather than failing the page view it was counting", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => reply({ message: "no such table" }, 404));

    const response = await POST(trackRequest({ path: "/", visitorId: "vabc12345678" }));

    expect(response.status).toBe(204);
    expect(error).toHaveBeenCalled();
  });
});
