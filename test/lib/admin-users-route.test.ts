/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";

jest.mock("../../app/lib/mailer", () => ({
  appOrigin: () => "http://localhost",
  passwordResetEmail: jest.fn(({ resetUrl }) => ({ subject: "reset", html: resetUrl, text: resetUrl })),
  sendMail: jest.fn(() => Promise.resolve({ ok: true, transport: "outbox" })),
}));

import { DELETE, PATCH } from "../../app/api/admin/users/route";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";
import { createToken, type AppUser } from "../../app/lib/store";

// The per-worker store jest.setup.ts points `app/lib/store` at, so this suite writes the same file
// the code under test reads — and never the real `app/data/users.json`.
const usersPath = process.env.STOCKERS_USERS_FILE as string;

let original: string | null = null;

function account(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_regular",
    name: "Regular User",
    email: "regular@example.com",
    passwordHash: "salt:hash",
    plan: "Starter",
    createdAt: "2026-08-01T00:00:00.000Z",
    role: "user",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    subscribedUntil: null,
    emailVerifiedAt: null,
    verificationToken: null,
    ...overrides,
  };
}

const superAdmin = account({
  id: "user_super",
  name: "Garv Tuts",
  email: SUPER_ADMIN_EMAIL,
  role: "admin",
  emailVerifiedAt: "2026-08-02T00:00:00.000Z",
});

const normalAdmin = account({
  id: "user_admin",
  name: "Root Admin",
  email: "root@example.com",
  role: "admin",
  emailVerifiedAt: "2026-08-02T00:00:00.000Z",
});

const regular = account();

async function writeRoster(users: AppUser[]) {
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, JSON.stringify(users, null, 2), "utf8");
}

function request(caller: AppUser, body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${createToken(caller)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(caller: AppUser, body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${createToken(caller)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function queryRequest(caller: AppUser, id: string) {
  return new Request(`http://localhost/api/admin/users?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${createToken(caller)}` },
  });
}

beforeAll(async () => {
  original = await fs.readFile(usersPath, "utf8").catch(() => null);
});

afterEach(async () => {
  if (original === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, original, "utf8");
});

describe("DELETE /api/admin/users", () => {
  it("refuses deletion from a regular admin", async () => {
    await writeRoster([superAdmin, normalAdmin, regular]);

    const response = await DELETE(request(normalAdmin, { id: regular.id }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Only the super admin can delete users.");
  });

  it("refuses to delete the super admin account", async () => {
    await writeRoster([superAdmin, regular]);

    const response = await DELETE(request(superAdmin, { id: superAdmin.id }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("The super admin account cannot be deleted.");
  });

  it("lets the super admin delete another account", async () => {
    await writeRoster([superAdmin, regular]);

    const response = await DELETE(request(superAdmin, { id: regular.id }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users.map((user: { id: string }) => user.id)).toEqual([superAdmin.id]);
    expect(payload.summary.total).toBe(1);
  });

  it("accepts the user id from the query string for DELETE requests", async () => {
    await writeRoster([superAdmin, regular]);

    const response = await DELETE(queryRequest(superAdmin, regular.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users.map((user: { id: string }) => user.id)).toEqual([superAdmin.id]);
    expect(payload.permissions.canDeleteUsers).toBe(true);
  });
});

describe("PATCH /api/admin/users password reset", () => {
  it("refuses password reset links from a regular admin", async () => {
    await writeRoster([superAdmin, normalAdmin, regular]);

    const response = await PATCH(patchRequest(normalAdmin, { id: regular.id, passwordReset: "send" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Only the super admin can send password reset links.");
  });

  it("lets the super admin create and email a database-backed reset link", async () => {
    await writeRoster([superAdmin, regular]);

    const response = await PATCH(patchRequest(superAdmin, { id: regular.id, passwordReset: "send" }));
    const payload = await response.json();
    const stored = JSON.parse(await fs.readFile(usersPath, "utf8")) as AppUser[];
    const updated = stored.find((user) => user.id === regular.id);

    expect(response.status).toBe(200);
    expect(payload.message).toBe("Password reset link sent to regular@example.com.");
    expect(updated?.passwordResetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(updated?.passwordResetExpiresAt).toEqual(expect.any(String));
    expect(updated?.passwordResetSentAt).toEqual(expect.any(String));
  });
});

describe("PATCH /api/admin/users free trial grants", () => {
  it("refuses free trial grants from a regular admin", async () => {
    await writeRoster([superAdmin, normalAdmin, regular]);

    const response = await PATCH(patchRequest(normalAdmin, { id: regular.id, freeTrial: "grant5d" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Only the super admin can grant a 5-day free trial.");
  });

  it("lets the super admin restart a user's five-day trial clock", async () => {
    await writeRoster([superAdmin, regular]);

    const response = await PATCH(patchRequest(superAdmin, { id: regular.id, freeTrial: "grant5d" }));
    const payload = await response.json();
    const stored = JSON.parse(await fs.readFile(usersPath, "utf8")) as AppUser[];
    const updated = stored.find((user) => user.id === regular.id);

    expect(response.status).toBe(200);
    expect(payload.message).toBe("5-day free trial approved for regular@example.com.");
    expect(updated?.trialStartedAt).toEqual(expect.any(String));
    expect(Date.parse(updated?.trialStartedAt ?? "")).not.toBeNaN();
  });
});
