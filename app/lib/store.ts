import { promises as fs } from "node:fs";
import path from "node:path";
import { adminEmails } from "./admin-access";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normaliseMobile, type PlanName } from "./auth-validation";

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  plan: PlanName;
  createdAt: string;
  /**
   * The ten-digit Indian mobile number, stored without a country code or separators.
   *
   * Optional on the type rather than required because accounts created before the field existed
   * do not have one, and a stored record must describe what is actually there.
   */
  mobile?: string | null;
  /** Admins bypass every paywall and are the only accounts that can lock or unlock features. */
  role?: UserRole;
  /** When the free trial clock started. Absent on accounts created before trials existed. */
  trialStartedAt?: string;
  /** Last IST date (YYYY-MM-DD) a paid subscription covers; null or absent when unsubscribed. */
  subscribedUntil?: string | null;
  /**
   * The Razorpay payment id last credited to this account.
   *
   * Kept so a payment can only ever buy one period: the verify route and the webhook both fire for
   * the same successful payment, and whichever arrives second sees its own id here and stops.
   */
  lastPaymentId?: string | null;
  /** When the address was confirmed. Null or absent means unverified. */
  emailVerifiedAt?: string | null;
  /**
   * The single-use secret in the verification link, or null once it has been spent.
   *
   * Stored rather than derived (an HMAC over the email, say) so that verifying can be made to work
   * exactly once and a resend can invalidate the previous link.
   */
  verificationToken?: string | null;
  /** When the most recent verification mail was dispatched — throttles resends. */
  verificationSentAt?: string | null;
};

/**
 * Where the account store lives.
 *
 * Overridable because this is the one file in the app that holds real user records, and two things
 * legitimately need it somewhere else: a deployment that keeps state off the application directory,
 * and a test suite, which must never be one truncation away from taking out the developer's own
 * accounts. It also has to be per-suite: Jest runs suites in parallel workers, so two suites
 * pointed at one file interleave a `writeFile("[]")` from one into the middle of the other.
 */
const filePath = process.env.STOCKERS_USERS_FILE || path.join(process.cwd(), "app", "data", "users.json");
const SCRYPT_KEY_LENGTH = 64;

// Session tokens now gate paid features, so they carry an HMAC and can no longer be forged by
// anyone who knows a user's id and email. Set AUTH_TOKEN_SECRET in the environment; the
// development fallback is deliberately obvious so an unset secret is caught before deploy.
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "stockers-dev-only-insecure-secret";

/** Emails listed here are promoted to admin on sign-up, so the first admin needs no seeding. */
const ADMIN_EMAILS = adminEmails();

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

export async function createUser(user: {
  name: string;
  email: string;
  password: string;
  plan: PlanName;
  mobile?: string | null;
}) {
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
    // Normalised on the way in, so every stored number has the same shape whatever was typed.
    mobile: user.mobile ? normaliseMobile(user.mobile) : null,
    role: ADMIN_EMAILS.has(normalizedEmail) ? "admin" : "user",
    // The trial clock starts at sign-up and is measured in open market days, not calendar days.
    trialStartedAt: now,
    subscribedUntil: null,
    // Unverified until the link in the welcome mail is followed. Nothing is gated on this yet —
    // the trial starts either way — so a mail that never arrives cannot lock anyone out.
    emailVerifiedAt: null,
    verificationToken: newVerificationToken(),
    verificationSentAt: null,
  };

  users.push(newUser);
  await writeUsers(users);
  return newUser;
}

/** A fresh single-use secret for a verification link. */
export function newVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Spends a verification token.
 *
 * Returns the user it belonged to, or null when the token is unknown — which is also what a token
 * that has already been used looks like, since verifying clears it. Verifying twice is therefore
 * not an error the caller has to distinguish; the route reports it as "already verified" by
 * checking the address separately.
 */
export async function verifyEmailToken(token: string): Promise<AppUser | null> {
  if (!token) return null;

  const users = await readUsers();
  const index = users.findIndex((user) => user.verificationToken === token);
  if (index === -1) return null;

  users[index] = {
    ...users[index],
    emailVerifiedAt: new Date().toISOString(),
    verificationToken: null,
  };
  await writeUsers(users);
  return users[index];
}

/**
 * Issues a new verification token for one user, invalidating any previous link.
 *
 * Returns null when the id is unknown or the address is already verified — there is nothing to
 * confirm in either case.
 */
export async function refreshVerificationToken(id: string): Promise<{ user: AppUser; token: string } | null> {
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1 || users[index].emailVerifiedAt) return null;

  const token = newVerificationToken();
  users[index] = { ...users[index], verificationToken: token };
  await writeUsers(users);
  return { user: users[index], token };
}

/**
 * Every account, newest first, for the admin dashboard.
 *
 * The password hash and the live verification token are stripped here rather than at the route:
 * neither has any business leaving the server, and removing them at the single point where the
 * list is produced means a future caller cannot forget to.
 */
export type AdminUserView = Omit<AppUser, "passwordHash" | "verificationToken"> & {
  emailVerified: boolean;
};

export async function listUsers(): Promise<AdminUserView[]> {
  const users = await readUsers();

  return users
    .map(({ passwordHash: _passwordHash, verificationToken: _verificationToken, ...rest }) => ({
      ...rest,
      emailVerified: Boolean(rest.emailVerifiedAt),
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

/** Deletes one user by id. Returns false when the account is not present. */
export async function deleteUser(id: string): Promise<boolean> {
  const users = await readUsers();
  const next = users.filter((user) => user.id !== id);
  if (next.length === users.length) return false;

  await writeUsers(next);
  return true;
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
