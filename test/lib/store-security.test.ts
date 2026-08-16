/** @jest-environment node */

import { createToken, type AppUser } from "../../app/lib/store";

const user: AppUser = {
  id: "user_test",
  name: "Test User",
  email: "test@example.com",
  passwordHash: "salt:hash",
  plan: null,
  createdAt: "2026-08-16T00:00:00.000Z",
  role: "user",
};

describe("session token security", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.AUTH_TOKEN_SECRET;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = originalSecret;
  });

  it("refuses the development token secret in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.AUTH_TOKEN_SECRET;

    expect(() => createToken(user)).toThrow("AUTH_TOKEN_SECRET must be set");
  });

  it("accepts a configured production token secret", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.AUTH_TOKEN_SECRET = "a-production-secret-with-at-least-32-characters";

    expect(createToken(user)).toMatch(/^stockers\./);
  });
});
