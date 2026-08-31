import "server-only";

// The account store.
//
// One module, two backends. Which one is used is decided by configuration alone:
//
//   * Supabase (Postgres, over PostgREST) when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//   * A JSON file on disk when they are not.
//
// The file backend is what a fresh checkout runs on, and it is what the test suite exercises, so
// this repo still clones and works with no credentials. It is not suitable for production: on a
// serverless host the application directory is read-only, so every write fails, and on any host it
// is wiped by the next deploy because it lives inside the deployed tree. That is the whole reason
// the Supabase backend exists â€” see `supabase/README.md`.
//
// Everything above the backend split is shared: password hashing, session tokens, the admin-email
// promotion rule, and the shape of every record. The two backends differ only in where rows are
// kept, so an account created against one is the same object as an account created against the
// other, field for field. That is what makes it safe to develop on the file and deploy on Supabase.
//
// A configured-but-failing Supabase does NOT fall back to the file. `app/lib/supabase.ts` explains
// why at length; the short version is that a silent fallback forks the source of truth and loses
// the account, and a 500 the visitor can retry is the better failure.

// Reads AUTH_TOKEN_SECRET, and holds the user table. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.

import { promises as fs } from "node:fs";
import path from "node:path";
import { adminEmails } from "./admin-access";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normaliseMobile, type PlanName } from "./auth-validation";
import { hashOneTimeCode, newOtpCode, verifyOneTimeCode, type MfaMode, type SocialProvider } from "./auth-security";
import { eq, isUniqueViolation, supabaseConfigured, supabaseRequest } from "./supabase";

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  /**
   * The plan this account has bought, or null when it has bought none.
   *
   * Null is the state every account starts in and returns to nothing but a purchase moves it out
   * of. It used to default to "Starter", which meant a brand-new account and a paying Starter
   * subscriber were indistinguishable in the record â€” the admin's user list could not tell them
   * apart, and neither could anything else. Access is still decided by `subscribedUntil` and the
   * trial clock, not by this field; this names *what* was bought, not *whether* it is live.
   */
  plan: PlanName | null;
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
  /** When the most recent verification mail was dispatched â€” throttles resends. */
  verificationSentAt?: string | null;
  /** Single-use password reset token, or null once spent/expired. */
  passwordResetToken?: string | null;
  /** Expiry for the current reset token, as an ISO string. */
  passwordResetExpiresAt?: string | null;
  /** When the most recent password reset mail was dispatched. */
  passwordResetSentAt?: string | null;
  /** Second-factor mode selected for the account. */
  mfaMode?: MfaMode;
  /** Admin-controlled switch that forces a second factor for the account. */
  mfaEnforced?: boolean;
  /** Base32 TOTP secret for authenticator-app MFA. */
  mfaTotpSecret?: string | null;
  /** Hash of the most recently issued SMS OTP. */
  mfaOtpHash?: string | null;
  /** Expiry for the current SMS OTP, as an ISO string. */
  mfaOtpExpiresAt?: string | null;
  /** Federated providers linked to this account. */
  socialProviders?: SocialProvider[];
  /** Provider subject ids, keyed by provider name. */
  socialProviderIds?: Partial<Record<SocialProvider, string>>;
};

/**
 * Where the JSON account store lives, when the JSON backend is the one in use.
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
// anyone who knows a user's id and email. Set AUTH_TOKEN_SECRET in production; development gets an
// obvious fallback so a fresh checkout still runs locally.
const DEV_TOKEN_SECRET = "stockers-dev-only-insecure-secret";

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

// ---------------------------------------------------------------------------
// The backend contract
// ---------------------------------------------------------------------------

/**
 * The only operations either backend has to provide.
 *
 * Deliberately row-at-a-time rather than "read everything, write everything back". The JSON file
 * has no choice but to rewrite the whole array, but expressing the interface that way would have
 * forced the Postgres backend to do the same â€” turning every verification into a full table read
 * and a full table write, and making two concurrent sign-ups silently drop one of the accounts.
 */
type StoreBackend = {
  all(): Promise<AppUser[]>;
  byId(id: string): Promise<AppUser | null>;
  byEmail(email: string): Promise<AppUser | null>;
  byVerificationToken(token: string): Promise<AppUser | null>;
  byPasswordResetToken(token: string): Promise<AppUser | null>;
  /** Returns null when the email is already registered. */
  insert(user: AppUser): Promise<AppUser | null>;
  /** Returns null when the id is unknown. */
  patch(id: string, patch: Partial<AppUser>): Promise<AppUser | null>;
  remove(id: string): Promise<boolean>;
  /** Deletes every account whose email address has not been confirmed. */
  removeUnverified(): Promise<number>;
  /**
   * Spends a verification token: confirms the address and clears the token, in one step.
   *
   * Part of the contract rather than composed from `byVerificationToken` + `patch` because on
   * Postgres it is a single conditional UPDATE, and that atomicity is the thing that makes a
   * verification link work exactly once even if it is clicked twice in the same instant.
   */
  spendVerificationToken(token: string): Promise<AppUser | null>;
  /** Issues a new token, but only for an account that exists and is not yet verified. */
  reissueVerificationToken(id: string, token: string): Promise<AppUser | null>;
};

// ---------------------------------------------------------------------------
// Backend: JSON file
// ---------------------------------------------------------------------------

async function ensureStore() {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(/* turbopackIgnore: true */ filePath);
  } catch {
    await fs.writeFile(/* turbopackIgnore: true */ filePath, "[]", "utf8");
  }
}

async function readUsers(): Promise<AppUser[]> {
  await ensureStore();
  const raw = await fs.readFile(/* turbopackIgnore: true */ filePath, "utf8");
  try {
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: AppUser[]) {
  await ensureStore();
  await fs.writeFile(/* turbopackIgnore: true */ filePath, JSON.stringify(users, null, 2), "utf8");
}

const fileBackend: StoreBackend = {
  all: readUsers,

  async byId(id) {
    return (await readUsers()).find((user) => user.id === id) ?? null;
  },

  async byEmail(email) {
    return (await readUsers()).find((user) => user.email === email) ?? null;
  },

  async byVerificationToken(token) {
    return (await readUsers()).find((user) => user.verificationToken === token) ?? null;
  },

  async byPasswordResetToken(token) {
    return (await readUsers()).find((user) => user.passwordResetToken === token) ?? null;
  },

  async insert(user) {
    const users = await readUsers();
    if (users.some((entry) => entry.email === user.email)) return null;

    users.push(user);
    await writeUsers(users);
    return user;
  },

  async patch(id, patch) {
    const users = await readUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) return null;

    users[index] = { ...users[index], ...patch };
    await writeUsers(users);
    return users[index];
  },

  async remove(id) {
    const users = await readUsers();
    const next = users.filter((user) => user.id !== id);
    if (next.length === users.length) return false;

    await writeUsers(next);
    return true;
  },

  async removeUnverified() {
    const users = await readUsers();
    const next = users.filter((user) => Boolean(user.emailVerifiedAt));
    const removed = users.length - next.length;
    if (removed > 0) await writeUsers(next);
    return removed;
  },

  async spendVerificationToken(token) {
    const users = await readUsers();
    const index = users.findIndex((user) => user.verificationToken === token);
    if (index === -1) return null;

    users[index] = { ...users[index], emailVerifiedAt: new Date().toISOString(), verificationToken: null };
    await writeUsers(users);
    return users[index];
  },

  async reissueVerificationToken(id, token) {
    const users = await readUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1 || users[index].emailVerifiedAt) return null;

    users[index] = { ...users[index], verificationToken: token };
    await writeUsers(users);
    return users[index];
  },
};

// ---------------------------------------------------------------------------
// Backend: Supabase / Postgres
// ---------------------------------------------------------------------------

/**
 * One row of `public.users`, in the column names Postgres actually has.
 *
 * snake_case in the database and camelCase in the app, mapped explicitly below, because those are
 * the conventions of the two places and neither should have to read like the other.
 */
type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  plan: string;
  created_at: string;
  mobile: string | null;
  role: string | null;
  trial_started_at: string | null;
  subscribed_until: string | null;
  last_payment_id: string | null;
  email_verified_at: string | null;
  verification_token: string | null;
  verification_sent_at: string | null;
  password_reset_token: string | null;
  password_reset_expires_at: string | null;
  password_reset_sent_at: string | null;
  mfa_mode: string | null;
  mfa_enforced: boolean | null;
  mfa_totp_secret: string | null;
  mfa_otp_hash: string | null;
  mfa_otp_expires_at: string | null;
  social_providers: string[] | null;
  social_provider_ids: Partial<Record<SocialProvider, string>> | null;
};

const COLUMN: Record<keyof AppUser, keyof UserRow> = {
  id: "id",
  name: "name",
  email: "email",
  passwordHash: "password_hash",
  plan: "plan",
  createdAt: "created_at",
  mobile: "mobile",
  role: "role",
  trialStartedAt: "trial_started_at",
  subscribedUntil: "subscribed_until",
  lastPaymentId: "last_payment_id",
  emailVerifiedAt: "email_verified_at",
  verificationToken: "verification_token",
  verificationSentAt: "verification_sent_at",
  passwordResetToken: "password_reset_token",
  passwordResetExpiresAt: "password_reset_expires_at",
  passwordResetSentAt: "password_reset_sent_at",
  mfaMode: "mfa_mode",
  mfaEnforced: "mfa_enforced",
  mfaTotpSecret: "mfa_totp_secret",
  mfaOtpHash: "mfa_otp_hash",
  mfaOtpExpiresAt: "mfa_otp_expires_at",
  socialProviders: "social_providers",
  socialProviderIds: "social_provider_ids",
};

function fromRow(row: UserRow): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    // An empty string is what a NOT NULL column holds for "no plan", so both spellings of absence
    // read back as null rather than as a plan named "".
    plan: (row.plan as PlanName | null) || null,
    createdAt: row.created_at,
    mobile: row.mobile,
    role: (row.role as UserRole | null) ?? "user",
    // `undefined` rather than null: the field is optional-but-string on AppUser, and a record must
    // describe what is there. An account predating trials has no start date, not a null one.
    trialStartedAt: row.trial_started_at ?? undefined,
    subscribedUntil: row.subscribed_until,
    lastPaymentId: row.last_payment_id,
    emailVerifiedAt: row.email_verified_at,
    verificationToken: row.verification_token,
    verificationSentAt: row.verification_sent_at,
    passwordResetToken: row.password_reset_token,
    passwordResetExpiresAt: row.password_reset_expires_at,
    passwordResetSentAt: row.password_reset_sent_at,
    mfaMode: (row.mfa_mode as MfaMode | null) ?? "off",
    mfaEnforced: Boolean(row.mfa_enforced),
    mfaTotpSecret: row.mfa_totp_secret,
    mfaOtpHash: row.mfa_otp_hash,
    mfaOtpExpiresAt: row.mfa_otp_expires_at,
    socialProviders: (row.social_providers as SocialProvider[] | null) ?? [],
    socialProviderIds: row.social_provider_ids ?? {},
  };
}

function toRow(patch: Partial<AppUser>): Partial<UserRow> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = COLUMN[key as keyof AppUser];
    // `undefined` means "not being set" and must not travel as an explicit null, which would erase
    // the stored value. Postgres nulls are written by passing null, which does survive this check.
    if (column && value !== undefined) row[column] = value;
  }
  return row as Partial<UserRow>;
}

const OPTIONAL_AUTH_EXTENSION_COLUMNS: (keyof UserRow)[] = [
  "password_reset_token",
  "password_reset_expires_at",
  "password_reset_sent_at",
  "mfa_mode",
  "mfa_enforced",
  "mfa_totp_secret",
  "mfa_otp_hash",
  "mfa_otp_expires_at",
  "social_providers",
  "social_provider_ids",
];

let supabaseUsersMissingAuthExtensions = false;

function withoutOptionalAuthExtensionColumns(row: Partial<UserRow>): Partial<UserRow> {
  const legacy = { ...row };
  for (const column of OPTIONAL_AUTH_EXTENSION_COLUMNS) delete legacy[column];
  return legacy;
}

function isMissingOptionalAuthColumn(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (!message.includes("schema cache") && !message.includes("column")) return false;
  return OPTIONAL_AUTH_EXTENSION_COLUMNS.some((column) => message.includes(`'${column}'`) || message.includes(`"${column}"`) || message.includes(column));
}

async function selectOne(filter: string): Promise<AppUser | null> {
  const rows = await supabaseRequest<UserRow>({ method: "GET", path: `users?${filter}&select=*&limit=1` });
  return rows.length > 0 ? fromRow(rows[0]) : null;
}

const supabaseBackend: StoreBackend = {
  async all() {
    const rows = await supabaseRequest<UserRow>({ method: "GET", path: "users?select=*" });
    return rows.map(fromRow);
  },

  byId: (id) => selectOne(`id=${eq(id)}`),
  byEmail: (email) => selectOne(`email=${eq(email)}`),
  byVerificationToken: (token) => selectOne(`verification_token=${eq(token)}`),
  byPasswordResetToken: (token) => selectOne(`password_reset_token=${eq(token)}`),

  async insert(user) {
    const body = toRow(user);
    const insertBody = supabaseUsersMissingAuthExtensions ? withoutOptionalAuthExtensionColumns(body) : body;
    try {
      const rows = await supabaseRequest<UserRow>({
        method: "POST",
        path: "users",
        body: insertBody,
        returnRepresentation: true,
      });
      return rows.length > 0 ? fromRow(rows[0]) : null;
    } catch (error) {
      // The unique index on `email` is what decides whether an address is taken â€” not a read
      // beforehand, which two simultaneous sign-ups for the same address would both pass.
      if (isUniqueViolation(error)) return null;
      if (!supabaseUsersMissingAuthExtensions && isMissingOptionalAuthColumn(error)) {
        supabaseUsersMissingAuthExtensions = true;
        const rows = await supabaseRequest<UserRow>({
          method: "POST",
          path: "users",
          body: withoutOptionalAuthExtensionColumns(body),
          returnRepresentation: true,
        });
        return rows.length > 0 ? fromRow(rows[0]) : null;
      }
      throw error;
    }
  },

  async patch(id, patch) {
    const row = toRow(patch);
    if (Object.keys(row).length === 0) return this.byId(id);

    const rows = await supabaseRequest<UserRow>({
      method: "PATCH",
      path: `users?id=${eq(id)}`,
      body: row,
      returnRepresentation: true,
    });
    return rows.length > 0 ? fromRow(rows[0]) : null;
  },

  async remove(id) {
    const rows = await supabaseRequest<UserRow>({
      method: "DELETE",
      path: `users?id=${eq(id)}`,
      returnRepresentation: true,
    });
    return rows.length > 0;
  },

  async removeUnverified() {
    const rows = await supabaseRequest<UserRow>({
      method: "DELETE",
      path: "users?email_verified_at=is.null",
      returnRepresentation: true,
    });
    return rows.length;
  },

  async spendVerificationToken(token) {
    // Filtered on the token, not the id: the row is found and cleared in one statement, so a link
    // clicked twice at once verifies once. The second UPDATE matches nothing, because the first
    // has already set the token to null.
    const rows = await supabaseRequest<UserRow>({
      method: "PATCH",
      path: `users?verification_token=${eq(token)}`,
      body: { email_verified_at: new Date().toISOString(), verification_token: null },
      returnRepresentation: true,
    });
    return rows.length > 0 ? fromRow(rows[0]) : null;
  },

  async reissueVerificationToken(id, token) {
    // `email_verified_at=is.null` carries the "not already verified" rule into the statement, so an
    // unknown id and a confirmed address both come back as zero rows â€” which is what the caller
    // has to treat as "nothing to do" anyway.
    const rows = await supabaseRequest<UserRow>({
      method: "PATCH",
      path: `users?id=${eq(id)}&email_verified_at=is.null`,
      body: { verification_token: token },
      returnRepresentation: true,
    });
    return rows.length > 0 ? fromRow(rows[0]) : null;
  },
};

/**
 * The backend in force, resolved per call rather than once at import.
 *
 * Route handlers are long-lived, and reading the environment at module scope means the first
 * import of this file for the process fixes the answer forever â€” which is exactly the bug where
 * setting the Supabase variables appears to do nothing until the whole server restarts.
 */
function backend(): StoreBackend {
  return supabaseConfigured() ? supabaseBackend : fileBackend;
}

/** Which store is in use. Reported by the admin dashboard and `scripts/check-supabase.mjs`. */
export function storeBackendName(): "supabase" | "file" {
  return supabaseConfigured() ? "supabase" : "file";
}

// ---------------------------------------------------------------------------
// The store itself â€” backend-independent from here down
// ---------------------------------------------------------------------------

export async function createUser(user: {
  name: string;
  email: string;
  password: string;
  /** Omitted for an ordinary sign-up: an account starts with no plan and a live trial. */
  plan?: PlanName | null;
  mobile?: string | null;
}) {
  const normalizedEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const newUser: AppUser = {
    id: `user_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    name: user.name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(user.password),
    plan: user.plan ?? null,
    createdAt: now,
    // Normalised on the way in, so every stored number has the same shape whatever was typed.
    mobile: user.mobile ? normaliseMobile(user.mobile) : null,
    role: ADMIN_EMAILS.has(normalizedEmail) ? "admin" : "user",
    // The trial clock starts at sign-up and is measured in IST calendar days.
    trialStartedAt: now,
    subscribedUntil: null,
    // Unverified until the link in the welcome mail is followed. Nothing is gated on this yet â€”
    // the trial starts either way â€” so a mail that never arrives cannot lock anyone out.
    emailVerifiedAt: null,
    verificationToken: newVerificationToken(),
    verificationSentAt: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    mfaMode: "off",
    mfaEnforced: false,
    mfaTotpSecret: null,
    mfaOtpHash: null,
    mfaOtpExpiresAt: null,
    socialProviders: [],
    socialProviderIds: {},
  };

  return backend().insert(newUser);
}

/** A fresh single-use secret for a verification link. */
export function newVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Spends a verification token.
 *
 * Returns the user it belonged to, or null when the token is unknown â€” which is also what a token
 * that has already been used looks like, since verifying clears it. Verifying twice is therefore
 * not an error the caller has to distinguish; the route reports it as "already verified" by
 * checking the address separately.
 */
export async function verifyEmailToken(token: string): Promise<AppUser | null> {
  if (!token) return null;
  return backend().spendVerificationToken(token);
}

/**
 * Issues a new verification token for one user, invalidating any previous link.
 *
 * Returns null when the id is unknown or the address is already verified â€” there is nothing to
 * confirm in either case.
 */
export async function refreshVerificationToken(id: string): Promise<{ user: AppUser; token: string } | null> {
  const token = newVerificationToken();
  const user = await backend().reissueVerificationToken(id, token);
  return user ? { user, token } : null;
}

/**
 * Every account, newest first, for the admin dashboard.
 *
 * The password hash and the live verification token are stripped here rather than at the route:
 * neither has any business leaving the server, and removing them at the single point where the
 * list is produced means a future caller cannot forget to.
 */
export type AdminUserView = Omit<
  AppUser,
  "passwordHash" | "verificationToken" | "passwordResetToken" | "mfaTotpSecret" | "mfaOtpHash"
> & {
  emailVerified: boolean;
};

export async function listUsers(): Promise<AdminUserView[]> {
  const users = await backend().all();

  // Sorted here rather than in the query, so both backends produce the same order from the same
  // records â€” Postgres would otherwise sort by its collation and the file by JavaScript's.
  return users
    .map((user) => {
      const { passwordHash, verificationToken, passwordResetToken, mfaTotpSecret, mfaOtpHash, ...rest } = user;
      void passwordHash;
      void verificationToken;
      void passwordResetToken;
      void mfaTotpSecret;
      void mfaOtpHash;
      return {
        ...rest,
        emailVerified: Boolean(rest.emailVerifiedAt),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Persists changes to one user, matched by id. Returns null when the id is unknown. */
export async function updateUser(id: string, patch: Partial<AppUser>): Promise<AppUser | null> {
  // id and passwordHash are never patchable through this path â€” changing either here would let a
  // caller reassign an account or overwrite a credential without going through sign-up.
  const safe = { ...patch };
  delete safe.id;
  delete safe.passwordHash;

  return backend().patch(id, safe);
}

/** Deletes one user by id. Returns false when the account is not present. */
export async function deleteUser(id: string): Promise<boolean> {
  return backend().remove(id);
}

/** Deletes every account whose email address has not been confirmed. */
export async function deleteUnverifiedUsers(): Promise<number> {
  return backend().removeUnverified();
}

export async function findUserByEmail(email: string) {
  return backend().byEmail(email.trim().toLowerCase());
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

export function newPasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

export async function issuePasswordResetToken(email: string): Promise<{ user: AppUser; token: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const token = newPasswordResetToken();
  const updated = await backend().patch(user.id, {
    passwordResetToken: token,
    passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    passwordResetSentAt: new Date().toISOString(),
  });

  return updated ? { user: updated, token } : null;
}

export async function resetPasswordWithToken(token: string, password: string): Promise<AppUser | null> {
  if (!token) return null;
  const user = await backend().byPasswordResetToken(token);
  if (!user?.passwordResetToken || user.passwordResetToken !== token) return null;
  if (!user.passwordResetExpiresAt || Date.parse(user.passwordResetExpiresAt) < Date.now()) return null;

  return backend().patch(user.id, {
    passwordHash: hashPassword(password),
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    mfaOtpHash: null,
    mfaOtpExpiresAt: null,
  });
}

/**
 * The six-digit recovery code, and where it is kept.
 *
 * A code rather than only a link, because a link is useless to somebody whose mail is not arriving
 * — which is the failure this exists for. The code is short enough to read off a phone and type
 * into the page the reader is already on, and it is delivered over every channel the account has
 * rather than email alone.
 *
 * It shares the `passwordResetToken` slot with the emailed link, under a prefix, and what is
 * stored is the *hash* — the same treatment the sign-in OTP gets in `mfaOtpHash`, so a leaked
 * database row cannot be replayed into somebody's account. Sharing the slot is deliberate: issuing
 * a code invalidates any outstanding link and vice versa, so there is only ever one live way into
 * an account at a time, and it needs no new column on a deployment that has already migrated.
 */
const RESET_CODE_PREFIX = "code:";
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
/**
 * Guesses allowed before the code is destroyed.
 *
 * Six digits is a million possibilities, which sounds like plenty and is not: unlimited guessing
 * against a fifteen-minute window is a script's afternoon. Five attempts makes the code worth
 * 1-in-200,000 to an attacker and costs a reader who fat-fingers it nothing, since asking for
 * another one is a single click.
 *
 * The counter lives in the same field as the hash because it must be *stored* — a per-process
 * counter resets on every deploy and is not shared between instances, which is the same as no
 * counter at all — and this way it needs no column that a deployed database might not have.
 */
const RESET_CODE_MAX_ATTEMPTS = 5;

export const PASSWORD_RESET_CODE_MINUTES = RESET_CODE_TTL_MS / 60_000;

function storedCode(hash: string, attempts: number): string {
  return `${RESET_CODE_PREFIX}${hash}:${attempts}`;
}

function readStoredCode(value: string | null | undefined): { hash: string; attempts: number } | null {
  if (!value?.startsWith(RESET_CODE_PREFIX)) return null;
  const [hash, attempts] = value.slice(RESET_CODE_PREFIX.length).split(":");
  return hash ? { hash, attempts: Number(attempts) || 0 } : null;
}

export async function issuePasswordResetCode(email: string): Promise<{ user: AppUser; code: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const code = newOtpCode();
  const updated = await backend().patch(user.id, {
    passwordResetToken: storedCode(hashOneTimeCode(code), 0),
    passwordResetExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(),
    passwordResetSentAt: new Date().toISOString(),
  });

  return updated ? { user: updated, code } : null;
}

/**
 * Spends a recovery code, or spends one of its five attempts.
 *
 * Wrong codes are counted rather than merely refused, and the fifth wrong guess clears the code
 * outright: the reader asks for a new one, and whoever was guessing starts again from a fresh
 * million.
 */
export async function resetPasswordWithCode(email: string, code: string, password: string): Promise<AppUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const stored = readStoredCode(user.passwordResetToken);
  if (!stored) return null;
  if (!user.passwordResetExpiresAt || Date.parse(user.passwordResetExpiresAt) < Date.now()) return null;

  if (!verifyOneTimeCode(code, stored.hash)) {
    const attempts = stored.attempts + 1;
    await backend().patch(
      user.id,
      attempts >= RESET_CODE_MAX_ATTEMPTS
        ? { passwordResetToken: null, passwordResetExpiresAt: null, passwordResetSentAt: null }
        : { passwordResetToken: storedCode(stored.hash, attempts) },
    );
    return null;
  }

  return backend().patch(user.id, {
    passwordHash: hashPassword(password),
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    mfaOtpHash: null,
    mfaOtpExpiresAt: null,
  });
}

export async function findOrCreateSocialUser(params: {
  provider: SocialProvider;
  providerId: string;
  email: string;
  name: string;
}): Promise<AppUser | null> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const providers = new Set<SocialProvider>(existing.socialProviders ?? []);
    providers.add(params.provider);
    return backend().patch(existing.id, {
      socialProviders: Array.from(providers),
      socialProviderIds: { ...(existing.socialProviderIds ?? {}), [params.provider]: params.providerId },
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date().toISOString(),
    });
  }

  const now = new Date().toISOString();
  const user: AppUser = {
    id: `user_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    name: params.name.trim() || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    passwordHash: hashPassword(randomBytes(32).toString("hex")),
    plan: null,
    createdAt: now,
    mobile: null,
    role: ADMIN_EMAILS.has(normalizedEmail) ? "admin" : "user",
    trialStartedAt: now,
    subscribedUntil: null,
    lastPaymentId: null,
    emailVerifiedAt: now,
    verificationToken: null,
    verificationSentAt: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    mfaMode: "off",
    mfaEnforced: false,
    mfaTotpSecret: null,
    mfaOtpHash: null,
    mfaOtpExpiresAt: null,
    socialProviders: [params.provider],
    socialProviderIds: { [params.provider]: params.providerId },
  };

  return backend().insert(user);
}

function tokenSecret(): string {
  const configured = process.env.AUTH_TOKEN_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOKEN_SECRET must be set to at least 32 characters in production.");
  }
  return DEV_TOKEN_SECRET;
}

function signPayload(payload: string) {
  return createHmac("sha256", tokenSecret()).update(payload).digest("hex");
}

export function createToken(user: AppUser) {
  const payload = `${user.id}.${Buffer.from(user.email).toString("base64url")}`;
  return `stockers.${payload}.${signPayload(payload)}`;
}

/**
 * Verifies a session token and returns the user id it names, or null.
 *
 * The signature is compared in constant time so the check can't be probed byte by byte, and an
 * unsigned or tampered token is rejected outright â€” this is what stops a paywalled endpoint from
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
  return backend().byId(id);
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
 * have to attach a header â€” the browser sends it automatically on same-origin requests. It is
 * SameSite=Lax rather than HttpOnly because the client also needs to read it; the token already
 * lives in localStorage, so this adds no new exposure.
 */
export async function userFromRequest(request: Request): Promise<AppUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;

  const id = verifyToken(bearer ?? tokenFromCookie(request));
  return id ? findUserById(id) : null;
}
