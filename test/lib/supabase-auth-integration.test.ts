/** @jest-environment node */

// Sign-up and sign-in, end to end, against Supabase.
//
// The unit suite next door asserts on the requests the store produces. This one runs the real
// route handlers — the same functions Next calls for POST /api/auth/signup and /api/auth/signin —
// over real HTTP, against a server that answers the way PostgREST does: the same filter grammar,
// the same `Prefer: return=representation` behaviour, the same 23505 on a duplicate address, and a
// real unique index behind it.
//
// It exists because the interesting failures in this integration are not in the store's logic but
// in the wire format between it and Postgres: a filter that does not match, a column name that is
// not there, a conflict reported as something other than what the code catches. A mocked `fetch`
// agrees with whatever the code asks of it and would not catch any of those.
//
// What it does NOT cover, and what `scripts/check-supabase.mjs` is for: that `supabase/schema.sql`
// has actually been applied to a given project, and that its constraints match these assumptions.
// Only a real Postgres can answer that.

import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { POST as signupRoute } from "../../app/api/auth/signup/route";
import { POST as signinRoute } from "../../app/api/auth/signin/route";
import { GET as verifyRoute } from "../../app/api/auth/verify/route";
import { SUPER_ADMIN_EMAIL } from "../../app/lib/admin-access";

// Sign-up sends a welcome mail and an SMS. Neither is what this suite is about, and left real they
// would append to the developer's own app/data/outbox.json on every run.
jest.mock("../../app/lib/mailer", () => ({
  appOrigin: () => "http://localhost:3000",
  sendMail: jest.fn(async () => ({ ok: true, transport: "resend" })),
  verificationEmail: () => ({ subject: "verify", html: "<p>verify</p>", text: "verify" }),
}));

jest.mock("../../app/lib/sms", () => ({
  sendSms: jest.fn(async () => ({ ok: true, transport: "twilio" })),
  welcomeSms: () => "welcome",
}));

const SERVICE_KEY = "service-role-key-for-integration";

type Row = Record<string, unknown>;

/** The stand-in for `public.users`, with the one constraint the store depends on. */
let table: Row[] = [];
let server: Server;

/** `?col=eq.value` and `?col=is.null`, which is all the store ever sends. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [column, expression] of params) {
    if (column === "select" || column === "limit" || column === "order") continue;

    if (expression === "is.null") {
      if (row[column] !== null && row[column] !== undefined) return false;
    } else if (expression.startsWith("eq.")) {
      if (row[column] !== expression.slice(3)) return false;
    } else {
      throw new Error(`stub does not implement the filter ${column}=${expression}`);
    }
  }
  return true;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = createServer((request, response) => {
    // PostgREST authenticates on both headers; the store sends both, so the stub checks both.
    if (request.headers.apikey !== SERVICE_KEY || request.headers.authorization !== `Bearer ${SERVICE_KEY}`) {
      return json(response, 401, { message: "Invalid authentication credentials" });
    }

    const url = new URL(request.url ?? "/", "http://stub");
    if (!url.pathname.startsWith("/rest/v1/users")) {
      return json(response, 404, { code: "42P01", message: 'relation "public.users" does not exist' });
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : null;
      const wantsRows = request.headers.prefer === "return=representation";
      const selected = table.filter((row) => matches(row, url.searchParams));

      if (request.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? selected.length);
        return json(response, 200, selected.slice(0, limit));
      }

      if (request.method === "POST") {
        // The unique index on email. This is the check the store relies on instead of reading
        // first, so the stub has to enforce it rather than assume the caller checked.
        if (table.some((row) => row.email === body.email)) {
          return json(response, 409, {
            code: "23505",
            message: 'duplicate key value violates unique constraint "users_email_key"',
            details: `Key (email)=(${body.email}) already exists.`,
          });
        }
        table.push({ ...body });
        return json(response, 201, wantsRows ? [body] : null);
      }

      if (request.method === "PATCH") {
        const updated = selected.map((row) => Object.assign(row, body));
        return json(response, 200, wantsRows ? updated : null);
      }

      if (request.method === "DELETE") {
        table = table.filter((row) => !selected.includes(row));
        return json(response, 200, wantsRows ? selected : null);
      }

      return json(response, 405, { message: "not implemented by the stub" });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
});

afterAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  table = [];
});

const signup = (body: unknown) =>
  signupRoute(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const signin = (body: unknown) =>
  signinRoute(
    new Request("http://localhost/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const NEW_ACCOUNT = {
  name: "Aarav Sharma",
  email: "aarav@example.com",
  mobile: "9876543210",
  password: "Testpass123",
  confirmPassword: "Testpass123",
};

describe("sign-up", () => {
  it("creates the account in Postgres and returns a session", async () => {
    const response = await signup(NEW_ACCOUNT);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    // No plan: a new account is on the three-day trial and has bought nothing.
    expect(payload.user).toMatchObject({ name: "Aarav Sharma", email: "aarav@example.com", plan: null });
    expect(payload.token).toEqual(expect.stringMatching(/^stockers\./));

    // The row is really in the table, in the columns the schema declares.
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({
      email: "aarav@example.com",
      name: "Aarav Sharma",
      mobile: "9876543210",
      plan: null,
      role: "user",
      email_verified_at: null,
    });
    // The password is stored as a scrypt hash and never echoed back to the caller.
    expect(table[0].password_hash).toEqual(expect.stringMatching(/^[0-9a-f]{32}:[0-9a-f]{128}$/));
    expect(JSON.stringify(payload)).not.toContain(table[0].password_hash);
  });

  it("promotes the super admin address, so it can be recreated on an empty database", async () => {
    await signup({ ...NEW_ACCOUNT, email: SUPER_ADMIN_EMAIL });

    expect(table[0].role).toBe("admin");
  });

  it("refuses a second account for the same address, on the unique index", async () => {
    await signup(NEW_ACCOUNT);
    const response = await signup({ ...NEW_ACCOUNT, name: "Someone Else" });

    expect(response.status).toBe(409);
    expect((await response.json()).errors.email).toBe("This email is already registered.");
    expect(table).toHaveLength(1);
  });

  it("still validates before it touches the database", async () => {
    const response = await signup({ ...NEW_ACCOUNT, email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(table).toHaveLength(0);
  });
});

describe("sign-in", () => {
  it("accepts the password the account was created with", async () => {
    await signup(NEW_ACCOUNT);

    const response = await signin({ email: "aarav@example.com", password: "Testpass123" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user.email).toBe("aarav@example.com");
    expect(payload.token).toEqual(expect.stringMatching(/^stockers\./));
  });

  it("is case-insensitive about the address, as sign-up normalises it", async () => {
    await signup(NEW_ACCOUNT);

    const response = await signin({ email: "  AARAV@Example.COM  ", password: "Testpass123" });

    expect(response.status).toBe(200);
  });

  it("rejects a wrong password without saying which field was wrong", async () => {
    await signup(NEW_ACCOUNT);

    const response = await signin({ email: "aarav@example.com", password: "Wrongpass123" });

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid email or password.");
  });

  it("answers an unknown address exactly as it answers a wrong password", async () => {
    const unknown = await signin({ email: "nobody@example.com", password: "Testpass123" });
    await signup(NEW_ACCOUNT);
    const wrong = await signin({ email: "aarav@example.com", password: "Wrongpass123" });

    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
  });
});

describe("email verification", () => {
  it("spends the token from the welcome link and confirms the address", async () => {
    await signup(NEW_ACCOUNT);
    const token = table[0].verification_token as string;
    expect(token).toEqual(expect.any(String));

    const response = await verifyRoute(new Request(`http://localhost/api/auth/verify?token=${token}`));

    expect(response.headers.get("location")).toBe("http://localhost:3000/signin?verify=verified");
    expect(table[0].email_verified_at).toEqual(expect.any(String));
    expect(table[0].verification_token).toBeNull();
  });

  it("reports a link that has already been used as invalid", async () => {
    await signup(NEW_ACCOUNT);
    const token = table[0].verification_token as string;

    await verifyRoute(new Request(`http://localhost/api/auth/verify?token=${token}`));
    const second = await verifyRoute(new Request(`http://localhost/api/auth/verify?token=${token}`));

    expect(second.headers.get("location")).toBe("http://localhost:3000/signin?verify=invalid");
  });
});

describe("when the database is unreachable", () => {
  // Both routes log the cause before answering 500, which is what you want in production and only
  // noise here — the failure is the thing under test.
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fails the sign-up loudly rather than writing the account somewhere else", async () => {
    const url = process.env.SUPABASE_URL;
    // A port nothing is listening on, which is what a wrong SUPABASE_URL looks like in production.
    process.env.SUPABASE_URL = "http://127.0.0.1:1";

    const response = await signup(NEW_ACCOUNT);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Signup failed. Please try again.");

    process.env.SUPABASE_URL = url;
  });

  it("fails the sign-in the same way", async () => {
    const url = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "http://127.0.0.1:1";

    const response = await signin({ email: "aarav@example.com", password: "Testpass123" });

    expect(response.status).toBe(500);

    process.env.SUPABASE_URL = url;
  });
});
