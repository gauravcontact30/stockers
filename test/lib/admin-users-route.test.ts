/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { DELETE, SUPER_ADMIN_EMAIL } from "../../app/api/admin/users/route";
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
