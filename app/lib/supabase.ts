// Talking to Supabase.
//
// There is no `@supabase/supabase-js` here, and that is deliberate. Supabase serves every table
// over PostgREST, which is an ordinary HTTP+JSON API, and this project reaches Resend, Twilio,
// OpenRouter, NSE and Razorpay the same way — over `fetch`, with three production dependencies in
// total. A client library would add a dependency tree to do what twenty lines of `fetch` already
// do, and it would be the only service in the app that needed one.
//
// Required environment to use Supabase as the account store:
//   SUPABASE_URL                 the project URL, e.g. https://abcdefgh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    the service_role key from Settings → API
//
// Without them the account store falls back to its JSON file, so a checkout of this repo still runs
// with no credentials at all. See `supabase/schema.sql` for the table these calls expect.
//
// ---------------------------------------------------------------------------
// Two things about the key, because getting either wrong is a breach and not a bug
// ---------------------------------------------------------------------------
//
// The service_role key bypasses row-level security. It must never be given a `NEXT_PUBLIC_` name
// and must never reach the browser: everything in this file runs in route handlers, which are
// server-only, and nothing here is imported by a client component.
//
// The `users` table must have RLS enabled with no policies granting the `anon` role anything. It
// holds password hashes and live verification tokens, and a Supabase project's anon key is public
// by design — it ships in the browser bundle of any app that uses one. RLS on with no policy is
// what makes the anon key useless against this table. `supabase/schema.sql` does this; if you
// create the table by hand, do it there too.

const REQUEST_TIMEOUT_MS = 10_000;

export type SupabaseConfig = {
  /** The project URL, with any trailing slash removed. */
  url: string;
  /** The service_role key. Server-side only. */
  serviceKey: string;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/**
 * The project credentials, or null when the environment has none — which is not an error.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is accepted as an alias for the URL because that is the name
 * Supabase's own guides use, and the URL is not a secret — it is in the browser bundle of every
 * Supabase app. The *key* has no public alias, for the reason in the header.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
  return url && serviceKey ? { url: url.replace(/\/+$/, ""), serviceKey } : null;
}

export function supabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

/**
 * Raised when Supabase is configured but a request to it did not succeed.
 *
 * This throws rather than degrading to the JSON file, which is the opposite of what `sendMail` and
 * `sendSms` do, and the difference is on purpose. A dropped email is recoverable — the account
 * exists and the mail can be resent. A write that silently lands in a different store is not: the
 * two copies diverge from that moment on, and the one the next deploy reads is missing an account
 * whose owner was told they had signed up. Better a 500 the visitor can retry than a sign-up that
 * appears to work and is gone tomorrow.
 */
export class SupabaseError extends Error {
  readonly status: number;
  /** The PostgREST error code, when it sent one. "23505" is a unique-constraint violation. */
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
  }
}

/** PostgREST's error body. Every field is optional — a gateway error has none of them. */
type PostgrestError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

async function failureFrom(response: Response): Promise<SupabaseError> {
  let message = "";
  let code: string | null = null;

  try {
    const body = (await response.json()) as PostgrestError;
    if (typeof body?.message === "string") message = body.message;
    if (typeof body?.code === "string") code = body.code;
    if (typeof body?.details === "string" && body.details) message = `${message} ${body.details}`.trim();
  } catch {
    // A proxy timeout or a 502 from in front of PostgREST has an HTML body, not JSON. The status
    // is still worth reporting, so this is not fatal.
  }

  return new SupabaseError(
    message || `Supabase responded with ${response.status}.`,
    response.status,
    code,
  );
}

/** True when the failure is the `users.email` unique index refusing a duplicate address. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof SupabaseError && (error.code === "23505" || error.status === 409);
}

/**
 * True when the table itself is not in the project — the schema has not been applied.
 *
 * Worth telling apart from every other failure because it is not transient and retrying will never
 * fix it: somebody has to run `supabase/schema.sql`. PostgREST reports it as PGRST205 ("could not
 * find the table in the schema cache") or PGRST106 for a schema that is not exposed, and answers
 * 404 for both. Without this check the route returns a bare 500 and the reader is told to try
 * again, which is advice that cannot work.
 */
export function isMissingTable(error: unknown): boolean {
  return (
    error instanceof SupabaseError &&
    (error.code === "PGRST205" || error.code === "PGRST106" || (error.status === 404 && error.code === null))
  );
}

/**
 * The message to show when a table is missing, naming the table and the fix.
 *
 * Kept here rather than written out at each call site so every surface says the same thing, and so
 * the instruction stays correct if the schema file is ever renamed.
 */
export function missingTableMessage(table: string): string {
  return `The \`${table}\` table has not been created in Supabase yet. Apply supabase/schema.sql in the SQL editor — it is safe to run more than once — then reload.`;
}

type RequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path and query below /rest/v1, e.g. `users?id=eq.user_1&select=*`. */
  path: string;
  body?: unknown;
  /**
   * Ask PostgREST to send the affected rows back. Off for reads (which return rows anyway) and on
   * for writes, so a caller gets the stored record rather than the one it hoped it wrote.
   */
  returnRepresentation?: boolean;
  /**
   * Turn a POST into an upsert: a row that collides with a unique constraint updates it instead of
   * being refused.
   *
   * Postgres decides the winner, which is the point. The alternative — read, then insert or update
   * — has a gap between the two statements that two simultaneous writes from the same account (two
   * tabs, a double-tap) both fit through. Pair it with `?on_conflict=<columns>` in the path so
   * PostgREST knows which constraint it is resolving against.
   */
  merge?: boolean;
};

/**
 * One PostgREST call, returning the rows it produced.
 *
 * Always throws a `SupabaseError` on anything other than success — see the class comment for why
 * this does not fall back to anything.
 */
export async function supabaseRequest<T>(options: RequestOptions): Promise<T[]> {
  const config = supabaseConfig();
  if (!config) {
    throw new SupabaseError("Supabase is not configured.", 0);
  }

  const headers: Record<string, string> = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
  };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  // Both travel in one `Prefer` header, comma-separated, because a second assignment would replace
  // the first rather than add to it.
  const prefer = [
    options.returnRepresentation ? "return=representation" : "",
    options.merge ? "resolution=merge-duplicates" : "",
  ].filter(Boolean);
  if (prefer.length > 0) headers.Prefer = prefer.join(",");

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/${options.path}`, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Route handlers are not cached for these methods, but a GET against PostgREST is exactly
      // the shape Next would happily cache. An account read must never be served from a cache.
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SupabaseError(`Could not reach Supabase: ${String(error)}`, 0);
  }

  if (!response.ok) throw await failureFrom(response);

  // A DELETE or PATCH without `Prefer: return=representation` answers 204 with an empty body,
  // which is not JSON and must not be parsed as it.
  if (response.status === 204) return [];

  try {
    const payload = (await response.json()) as T[] | T | null;
    if (payload === null) return [];
    return Array.isArray(payload) ? payload : [payload];
  } catch (error) {
    throw new SupabaseError(`Supabase returned an unreadable body: ${String(error)}`, response.status);
  }
}

/** The value half of a PostgREST `column=eq.value` filter, escaped for the query string. */
export function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/**
 * A one-request health check, for `scripts/check-supabase.mjs` and the setup docs.
 *
 * Counts rows without transferring any: `HEAD`-like behaviour via a zero-width range. Reports the
 * failure as a string rather than throwing, because its whole job is to explain what is wrong.
 */
export async function supabaseHealth(): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured()) {
    return { ok: false, error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set." };
  }

  try {
    await supabaseRequest({ method: "GET", path: "users?select=id&limit=1" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
