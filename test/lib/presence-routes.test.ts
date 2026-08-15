/** @jest-environment node */

// The heartbeat endpoint, the store behind it and the admin read on top of it.
//
// Three rules are load-bearing here and each has a test that fails loudly if it stops being true:
// a heartbeat is an upsert rather than an insert, so an hour-long sitting is one row and not sixty;
// the account on a row comes from the session token rather than from the body, so nobody can post
// as somebody else; and the admin read is refused to anyone who is not an admin, because it joins
// live sittings to names, addresses and mobile numbers.

import { promises as fs } from "node:fs";
import path from "node:path";
import { GET } from "../../app/api/admin/presence/route";
import { POST } from "../../app/api/analytics/presence/route";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";
import { buildSession, listPresence, presenceBackendName, presenceKey, touchPresence } from "../../app/lib/presence";
import { createToken, type AppUser } from "../../app/lib/store";

const usersPath = process.env.STOCKERS_USERS_FILE as string;
const presencePath = process.env.STOCKERS_PRESENCE_FILE as string;

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
  await fs.rm(presencePath, { force: true });
});

afterEach(async () => {
  if (originalRoster === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, originalRoster, "utf8");
  await fs.rm(presencePath, { force: true });
});

function beat(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/analytics/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function adminRead(user: AppUser | null) {
  return new Request("http://localhost/api/admin/presence", {
    headers: user ? { Authorization: `Bearer ${createToken(user)}` } : {},
  });
}

describe("presenceKey", () => {
  it("keys on the tab first, so two tabs are two sittings", () => {
    expect(presenceKey({ sessionId: "tab_abcdefgh", visitorId: "browser_abcdefgh", userId: "user_1" })).toBe("s:tab_abcdefgh");
  });

  it("falls back to the browser, then to the account", () => {
    expect(presenceKey({ visitorId: "browser_abcdefgh", userId: "user_1" })).toBe("v:browser_abcdefgh");
    expect(presenceKey({ userId: "user_1" })).toBe("u:user_1");
  });

  it("namespaces the key so a session id cannot collide with a visitor id", () => {
    expect(presenceKey({ sessionId: "same_identifier" })).not.toBe(presenceKey({ visitorId: "same_identifier" }));
  });

  it("refuses a heartbeat that identifies nothing at all", () => {
    // Without a key every ping lands as a new row, and one person with a tab open would be
    // reported as sixty people an hour.
    expect(presenceKey({})).toBeNull();
    expect(presenceKey({ sessionId: "short", visitorId: 42 })).toBeNull();
  });
});

describe("buildSession", () => {
  it("keeps only what a visit already stores, and strips the query string off the path", () => {
    const session = buildSession(
      { userId: "user_1", visitorId: "browser_abcdefgh", sessionId: "tab_abcdefgh", path: "/news?token=secret", userAgent: "iPhone Mobile" },
      "s:tab_abcdefgh",
      new Date("2026-08-14T10:00:00.000Z"),
    );

    expect(session).toMatchObject({
      key: "s:tab_abcdefgh",
      userId: "user_1",
      visitorId: "browser_abcdefgh",
      sessionId: "tab_abcdefgh",
      // The query string is where the personal data is, and none of it is needed to say which page
      // somebody is on.
      path: "/news",
      device: "mobile",
      startedAt: "2026-08-14T10:00:00.000Z",
      lastSeenAt: "2026-08-14T10:00:00.000Z",
    });
  });

  it("drops an off-site path rather than storing it", () => {
    expect(buildSession({ path: "https://elsewhere.example/page" }, "s:tab").path).toBeNull();
  });
});

describe("touchPresence", () => {
  it("rewrites one row rather than appending a second", async () => {
    const first = new Date("2026-08-14T10:00:00.000Z");
    const later = new Date("2026-08-14T10:30:00.000Z");

    await touchPresence({ sessionId: "tab_abcdefgh", path: "/news" }, first);
    await touchPresence({ sessionId: "tab_abcdefgh", path: "/overview" }, later);

    const sessions = await listPresence(later);
    expect(sessions).toHaveLength(1);
    // Where they are now, but the sitting still began when it began — which is what makes "here
    // for 30 minutes" answerable at all.
    expect(sessions[0]).toMatchObject({ path: "/overview", startedAt: first.toISOString(), lastSeenAt: later.toISOString() });
  });

  it("keeps two tabs apart", async () => {
    await touchPresence({ sessionId: "tab_aaaaaaaa", visitorId: "browser_abcdefgh" });
    await touchPresence({ sessionId: "tab_bbbbbbbb", visitorId: "browser_abcdefgh" });

    expect(await listPresence()).toHaveLength(2);
  });

  it("does nothing at all for a heartbeat with no id", async () => {
    await touchPresence({ path: "/news" });

    expect(await listPresence()).toEqual([]);
  });

  it("drops sittings that went quiet long enough ago to stop mattering", async () => {
    const now = new Date("2026-08-14T10:00:00.000Z");
    const longAgo = new Date("2026-08-14T08:00:00.000Z");

    await touchPresence({ sessionId: "tab_stale" }, longAgo);
    await touchPresence({ sessionId: "tab_here" }, now);

    const sessions = await listPresence(now);
    expect(sessions.map((session) => session.sessionId)).toEqual(["tab_here"]);
  });

  it("never throws, whatever the store does", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(fs, "writeFile").mockRejectedValue(new Error("read-only disk"));

    // An observation must never be able to fail the thing it is observing.
    await expect(touchPresence({ sessionId: "tab_abcdefgh" })).resolves.toBeUndefined();
  });

  it("names the store it is using", () => {
    expect(presenceBackendName()).toBe("file");
  });
});

describe("POST /api/analytics/presence", () => {
  it("records the sitting and answers with nothing to say", async () => {
    const response = await POST(beat({ sessionId: "tab_abcdefgh", visitorId: "browser_abcdefgh", path: "/news" }));

    expect(response.status).toBe(204);
    const sessions = await listPresence();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: "tab_abcdefgh", path: "/news", userId: null });
  });

  it("takes the account from the session token, never from the body", async () => {
    await writeRoster([regular]);

    await POST(
      beat(
        { sessionId: "tab_abcdefgh", path: "/news", userId: "user_super" },
        { Authorization: `Bearer ${createToken(regular)}` },
      ),
    );

    const [session] = await listPresence();
    // The body claimed to be somebody else; the token is what was believed.
    expect(session.userId).toBe("user_regular");
  });

  it("shrugs off a body that is not JSON at all", async () => {
    const response = await POST(
      new Request("http://localhost/api/analytics/presence", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(204);
    expect(await listPresence()).toEqual([]);
  });
});

describe("GET /api/admin/presence", () => {
  it("refuses anyone who is not signed in", async () => {
    const response = await GET(adminRead(null));

    expect(response.status).toBe(403);
  });

  it("refuses an ordinary account", async () => {
    await writeRoster([regular]);

    const response = await GET(adminRead(regular));

    // This joins live sittings to names, addresses and mobile numbers. Knowing the URL is not
    // permission to read it.
    expect(response.status).toBe(403);
  });

  it("answers the super admin with who is on the site", async () => {
    await writeRoster([superAdmin, regular]);
    await touchPresence({ sessionId: "tab_abcdefgh", userId: regular.id, path: "/overview", userAgent: "Mozilla" });

    const response = await GET(adminRead(superAdmin));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ available: true, summary: { online: 1, signedIn: 1, guests: 0 } });
    expect(body.rows[0]).toMatchObject({ name: "Regular User", email: "regular@example.com", path: "/overview" });
  });

  it("never lets a cache hold one admin's view of where everyone is", async () => {
    await writeRoster([superAdmin]);

    const response = await GET(adminRead(superAdmin));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
