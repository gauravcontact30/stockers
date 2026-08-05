import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  plan: "Starter" | "Pro";
  createdAt: string;
  /** Admins bypass every paywall and are the only accounts that can lock or unlock features. */
  role?: UserRole;
  /** When the free trial clock started. Absent on accounts created before trials existed. */
  trialStartedAt?: string;
  /** Last IST date (YYYY-MM-DD) a paid subscription covers; null or absent when unsubscribed. */
  subscribedUntil?: string | null;
};

const filePath = path.join(process.cwd(), "app", "data", "users.json");
const SCRYPT_KEY_LENGTH = 64;

// Session tokens now gate paid features, so they carry an HMAC and can no longer be forged by
// anyone who knows a user's id and email. Set AUTH_TOKEN_SECRET in the environment; the
// development fallback is deliberately obvious so an unset secret is caught before deploy.
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "stockers-dev-only-insecure-secret";

/** Emails listed here are promoted to admin on sign-up, so the first admin needs no seeding. */
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) {
    return false;
  }
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, keyBuffer);
}

async function ensureStore() {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]", "utf8");
  }
}

async function readUsers(): Promise<AppUser[]> {
  await ensureStore();
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: AppUser[]) {
  await ensureStore();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf8");
}

export async function createUser(user: { name: string; email: string; password: string; plan: "Starter" | "Pro" }) {
  const users = await readUsers();
  const normalizedEmail = user.email.trim().toLowerCase();
  const emailTaken = users.some((entry) => entry.email === normalizedEmail);
  if (emailTaken) {
    return null;
  }

  const now = new Date().toISOString();
  const newUser: AppUser = {
    id: `user_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    name: user.name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(user.password),
    plan: user.plan,
    createdAt: now,
    role: ADMIN_EMAILS.has(normalizedEmail) ? "admin" : "user",
    // The trial clock starts at sign-up and is measured in open market days, not calendar days.
    trialStartedAt: now,
    subscribedUntil: null,
  };

  users.push(newUser);
  await writeUsers(users);
  return newUser;
}

/** Persists changes to one user, matched by id. Returns null when the id is unknown. */
export async function updateUser(id: string, patch: Partial<AppUser>): Promise<AppUser | null> {
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) return null;

  // id and passwordHash are never patchable through this path — changing either here would let a
  // caller reassign an account or overwrite a credential without going through sign-up.
  const safe = { ...patch };
  delete safe.id;
  delete safe.passwordHash;

  users[index] = { ...users[index], ...safe };
  await writeUsers(users);
  return users[index];
}

export async function findUserByEmail(email: string) {
  const users = await readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  return users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

function signPayload(payload: string) {
  return createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
}

export function createToken(user: AppUser) {
  const payload = `${user.id}.${Buffer.from(user.email).toString("base64url")}`;
  return `stockers.${payload}.${signPayload(payload)}`;
}

/**
 * Verifies a session token and returns the user id it names, or null.
 *
 * The signature is compared in constant time so the check can't be probed byte by byte, and an
 * unsigned or tampered token is rejected outright — this is what stops a paywalled endpoint from
 * being unlocked by hand-writing a token.
 */
export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "stockers") return null;

  const payload = `${parts[1]}.${parts[2]}`;
  const expected = Buffer.from(signPayload(payload), "utf8");
  const provided = Buffer.from(parts[3], "utf8");
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return parts[1];
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

/** The cookie the client mirrors its session token into. */
export const SESSION_COOKIE = "stockers_session";

function tokenFromCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Resolves the caller from an "Authorization: Bearer <token>" header, falling back to the session
 * cookie.
 *
 * The cookie exists so the dozen existing client components that call gated endpoints don't each
 * have to attach a header — the browser sends it automatically on same-origin requests. It is
 * SameSite=Lax rather than HttpOnly because the client also needs to read it; the token already
 * lives in localStorage, so this adds no new exposure.
 */
export async function userFromRequest(request: Request): Promise<AppUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;

  const id = verifyToken(bearer ?? tokenFromCookie(request));
  return id ? findUserById(id) : null;
}
