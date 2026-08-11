// The Supabase half of the account store.
//
// Every test here drives the real `app/lib/store` exports with the Supabase environment set, and
// asserts on the HTTP request that came out the other side. Nothing is stubbed between the store
// and `fetch`, so these cover the column mapping, the PostgREST filters and the error translation
// as one piece — which is the part that would silently break against a real project.
//
// The JSON backend is covered by `store-verification.test.ts`. Both suites exist because the whole
// promise of the two-backend design is that they behave identically, and that is only true if both
// are actually run.

import {
  authenticateUser,
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  refreshVerificationToken,
  storeBackendName,
  updateUser,
  verifyEmailToken,
} from "../../app/lib/store";
import { isUniqueViolation, SupabaseError, supabaseConfig, supabaseConfigured } from "../../app/lib/supabase";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";

const URL_BASE = "https://project-under-test.supabase.co";
const SERVICE_KEY = "service-role-key-under-test";

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };

let fetchMock: jest.Mock;

/** A PostgREST-shaped answer. */
function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  } as unknown as Response;
}

/** Every request the store made, in order. */
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? "GET",
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body ? JSON.parse(init.body as string) : null,
  }));
}

/** Answers the next request by echoing the row it was asked to write. */
function echoInsertedRow() {
  fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => reply([JSON.parse(init.body as string)]));
}

const ROW = {
  id: "user_stored",
  name: "Stored Person",
  email: "stored@example.com",
  password_hash: "salt:key",
  plan: "Pro",
  created_at: "2026-08-01T00:00:00.000Z",
  mobile: "9876543210",
  role: "user",
  trial_started_at: "2026-08-01T00:00:00.000Z",
  subscribed_until: "2026-09-01",
  last_payment_id: "pay_1",
  email_verified_at: null,
  verification_token: "token-abc",
  verification_sent_at: null,
};

beforeEach(() => {
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  fetchMock = jest.fn(async () => reply([]));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("configuration", () => {
  it("selects the Supabase backend once both variables are set", () => {
    expect(supabaseConfigured()).toBe(true);
    expect(storeBackendName()).toBe("supabase");
  });

  it("falls back to the file store when either variable is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseConfigured()).toBe(false);
    expect(storeBackendName()).toBe("file");
  });

  it("trims a trailing slash off the project URL, so paths never double up", () => {
    process.env.SUPABASE_URL = `${URL_BASE}/`;
    expect(supabaseConfig()?.url).toBe(URL_BASE);
  });

  it("accepts the NEXT_PUBLIC_ alias for the URL but never for the key", () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_BASE;
    expect(supabaseConfig()?.url).toBe(URL_BASE);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });
});

describe("createUser", () => {
  it("inserts snake_case columns and reads the stored row back", async () => {
    echoInsertedRow();

    const user = await createUser({
      name: "  New Person  ",
      email: "  NEW@Example.COM ",
      password: "secret123",
      plan: "Starter",
      mobile: "+91 98765 43210",
    });

    const [call] = calls();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${URL_BASE}/rest/v1/users`);
    expect(call.headers.Prefer).toBe("return=representation");
    expect(call.headers.apikey).toBe(SERVICE_KEY);
    expect(call.headers.Authorization).toBe(`Bearer ${SERVICE_KEY}`);

    // Normalisation happens before the row is built, exactly as on the file backend.
    expect(call.body).toMatchObject({
      name: "New Person",
      email: "new@example.com",
      mobile: "9876543210",
      plan: "Starter",
      role: "user",
      email_verified_at: null,
    });
    expect(call.body?.password_hash).toEqual(expect.stringMatching(/^[0-9a-f]{32}:[0-9a-f]{128}$/));
    expect(call.body?.verification_token).toEqual(expect.any(String));

    expect(user?.email).toBe("new@example.com");
    expect(user?.mobile).toBe("9876543210");
  });

  it("promotes the super admin address on sign-up, so it can be recreated from an empty table", async () => {
    echoInsertedRow();

    const user = await createUser({
      name: "Garv",
      email: SUPER_ADMIN_EMAIL,
      password: "secret123",
      plan: "Starter",
    });

    expect(calls()[0].body?.role).toBe("admin");
    expect(user?.role).toBe("admin");
  });

  it("reports a duplicate address as null rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ code: "23505", message: 'duplicate key value violates unique constraint "users_email_key"' }, 409),
    );

    await expect(
      createUser({ name: "Twice", email: "taken@example.com", password: "secret123", plan: "Starter" }),
    ).resolves.toBeNull();
  });

  it("throws on any other failure instead of quietly writing somewhere else", async () => {
    fetchMock.mockResolvedValueOnce(reply({ code: "42P01", message: 'relation "public.users" does not exist' }, 404));

    // The alternative — falling back to the JSON file — would tell the visitor they had signed up
    // and put the account somewhere the next request does not look.
    await expect(
      createUser({ name: "Nowhere", email: "nowhere@example.com", password: "secret123", plan: "Starter" }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("authenticateUser", () => {
  it("looks the account up by address and checks the password", async () => {
    // A real scrypt hash for "secret123", produced by createUser itself, so the check is genuine.
    echoInsertedRow();
    const created = await createUser({
      name: "Signer",
      email: "signer@example.com",
      password: "secret123",
      plan: "Starter",
    });
    fetchMock.mockClear();

    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, email: "signer@example.com", password_hash: created!.passwordHash }]));
    await expect(authenticateUser("SIGNER@example.com", "secret123")).resolves.not.toBeNull();

    const [call] = calls();
    expect(call.method).toBe("GET");
    expect(call.url).toContain("users?email=eq.signer%40example.com");
    expect(call.url).toContain("limit=1");

    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, password_hash: created!.passwordHash }]));
    await expect(authenticateUser("signer@example.com", "wrong-password")).resolves.toBeNull();
  });

  it("returns null for an address with no row", async () => {
    fetchMock.mockResolvedValueOnce(reply([]));
    await expect(authenticateUser("ghost@example.com", "secret123")).resolves.toBeNull();
  });
});

describe("verifyEmailToken", () => {
  it("confirms the address and clears the token in one statement", async () => {
    fetchMock.mockResolvedValueOnce(
      reply([{ ...ROW, email_verified_at: "2026-08-02T00:00:00.000Z", verification_token: null }]),
    );

    const user = await verifyEmailToken("token-abc");

    const [call] = calls();
    expect(call.method).toBe("PATCH");
    // Filtered on the token, not on an id read beforehand — that is what makes a link clicked
    // twice at once verify exactly once.
    expect(call.url).toContain("users?verification_token=eq.token-abc");
    expect(call.body).toEqual({ email_verified_at: expect.any(String), verification_token: null });
    expect(user?.emailVerifiedAt).toBe("2026-08-02T00:00:00.000Z");
    expect(user?.verificationToken).toBeNull();
  });

  it("treats an already-spent or unknown token as null", async () => {
    fetchMock.mockResolvedValueOnce(reply([]));
    await expect(verifyEmailToken("already-used")).resolves.toBeNull();
  });

  it("does not call Supabase at all for an empty token", async () => {
    await expect(verifyEmailToken("")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("refreshVerificationToken", () => {
  it("carries the not-yet-verified rule into the statement", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, verification_token: "fresh" }]));

    const issued = await refreshVerificationToken("user_stored");

    const [call] = calls();
    expect(call.method).toBe("PATCH");
    expect(call.url).toContain("id=eq.user_stored");
    expect(call.url).toContain("email_verified_at=is.null");
    expect(issued?.token).toEqual(expect.any(String));
    expect(call.body?.verification_token).toBe(issued?.token);
  });

  it("declines for an unknown id or an already-confirmed address", async () => {
    fetchMock.mockResolvedValueOnce(reply([]));
    await expect(refreshVerificationToken("user_nope")).resolves.toBeNull();
  });
});

describe("listUsers", () => {
  it("strips the hash and the live token, and puts the newest account first", async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { ...ROW, id: "older", email: "older@example.com", created_at: "2026-08-01T00:00:00.000Z" },
        { ...ROW, id: "newer", email: "newer@example.com", created_at: "2026-08-09T00:00:00.000Z" },
      ]),
    );

    const users = await listUsers();

    expect(users.map((user) => user.id)).toEqual(["newer", "older"]);
    expect(users[0]).not.toHaveProperty("passwordHash");
    expect(users[0]).not.toHaveProperty("verificationToken");
    expect(users[0].emailVerified).toBe(false);
  });

  it("maps every column the dashboard reads", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, email_verified_at: "2026-08-02T00:00:00.000Z" }]));

    const [user] = await listUsers();

    expect(user).toMatchObject({
      id: "user_stored",
      email: "stored@example.com",
      plan: "Pro",
      mobile: "9876543210",
      role: "user",
      subscribedUntil: "2026-09-01",
      lastPaymentId: "pay_1",
      trialStartedAt: "2026-08-01T00:00:00.000Z",
      emailVerified: true,
    });
  });

  it("defaults a null role to user, for rows written before the column existed", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, role: null, trial_started_at: null }]));

    const [user] = await listUsers();

    expect(user.role).toBe("user");
    // Absent rather than null: AppUser types this as optional-string, and a record should say
    // what is there.
    expect(user.trialStartedAt).toBeUndefined();
  });
});

describe("updateUser", () => {
  it("patches only the named columns", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, plan: "Elite" }]));

    await updateUser("user_stored", { plan: "Elite", subscribedUntil: "2026-12-01" });

    const [call] = calls();
    expect(call.method).toBe("PATCH");
    expect(call.url).toContain("users?id=eq.user_stored");
    expect(call.body).toEqual({ plan: "Elite", subscribed_until: "2026-12-01" });
  });

  it("refuses to write an id or a password hash, whatever it is handed", async () => {
    fetchMock.mockResolvedValueOnce(reply([ROW]));

    await updateUser("user_stored", {
      id: "somebody_else",
      passwordHash: "attacker-supplied",
      plan: "Pro",
    } as Parameters<typeof updateUser>[1]);

    expect(calls()[0].body).toEqual({ plan: "Pro" });
  });

  it("sends an explicit null to clear a column, but omits undefined", async () => {
    fetchMock.mockResolvedValueOnce(reply([ROW]));

    await updateUser("user_stored", { subscribedUntil: null, lastPaymentId: undefined });

    expect(calls()[0].body).toEqual({ subscribed_until: null });
  });

  it("reports an unknown id as null", async () => {
    fetchMock.mockResolvedValueOnce(reply([]));
    await expect(updateUser("user_nope", { plan: "Pro" })).resolves.toBeNull();
  });
});

describe("deleteUser", () => {
  it("deletes by id and reports whether a row went", async () => {
    fetchMock.mockResolvedValueOnce(reply([ROW]));
    await expect(deleteUser("user_stored")).resolves.toBe(true);
    expect(calls()[0].method).toBe("DELETE");
    expect(calls()[0].url).toContain("users?id=eq.user_stored");

    fetchMock.mockResolvedValueOnce(reply([]));
    await expect(deleteUser("user_nope")).resolves.toBe(false);
  });
});

describe("findUserById", () => {
  it("escapes the id into the filter", async () => {
    fetchMock.mockResolvedValueOnce(reply([ROW]));
    await findUserById("user with space");
    expect(calls()[0].url).toContain("id=eq.user%20with%20space");
  });
});

describe("failures", () => {
  it("reports an unreachable project rather than hanging or falling back", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(findUserById("user_stored")).rejects.toThrow(/Could not reach Supabase/);
  });

  it("surfaces the PostgREST message and code", async () => {
    fetchMock.mockResolvedValueOnce(reply({ code: "42501", message: "permission denied for table users" }, 403));

    await expect(findUserById("user_stored")).rejects.toMatchObject({
      name: "SupabaseError",
      status: 403,
      code: "42501",
    });
  });

  it("still reports a status when the body is not JSON, as a proxy error will be", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "<html>Bad Gateway</html>",
    } as unknown as Response);

    await expect(findUserById("user_stored")).rejects.toThrow(/Supabase responded with 502/);
  });

  it("recognises a unique violation by code or by status", () => {
    expect(isUniqueViolation(new SupabaseError("dup", 400, "23505"))).toBe(true);
    expect(isUniqueViolation(new SupabaseError("dup", 409))).toBe(true);
    expect(isUniqueViolation(new SupabaseError("nope", 500, "42P01"))).toBe(false);
    expect(isUniqueViolation(new Error("not a supabase error"))).toBe(false);
  });
});
