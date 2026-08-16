import "server-only";

// Where this app is reachable from the outside.
//
// Read on the server only â€” by the mailer, to build the verification link that goes into a welcome
// email, and by every OpenRouter call, which sends it as `HTTP-Referer` for attribution. Nothing
// in the browser needs it: a page already knows its own origin.
//
// ---------------------------------------------------------------------------
// Why APP_URL and not NEXT_PUBLIC_APP_URL
// ---------------------------------------------------------------------------
//
// `NEXT_PUBLIC_` does not mean "available everywhere". It means Next replaces every
// `process.env.NEXT_PUBLIC_X` with a string literal *at build time*, in server code as well as
// client code, and the built output then stops responding to the environment entirely. Changing
// the value on the host does nothing until the project is rebuilt â€” which is a genuinely confusing
// half hour when a production deploy keeps emailing localhost links after the variable was
// obviously, visibly corrected in the dashboard.
//
// An unprefixed name is read from `process.env` at request time, so correcting it on the host and
// restarting is enough. Since no client component reads this, the prefix bought nothing and cost
// that.
//
// `NEXT_PUBLIC_APP_URL` is still honoured, second in line. It is what existing deployments have
// set, and a rename that silently reverted them to `http://localhost:3000` would put a localhost
// link into every welcome email until someone noticed.

/** The default. A development sign-up produces a link that works, rather than one pointing nowhere. */
const LOCAL_ORIGIN = "http://localhost:3000";

/**
 * One variable, trimmed, treating whitespace as absent.
 *
 * Each candidate has to be trimmed *before* the fallback chain rather than after it. An
 * `APP_URL=" "` â€” which is what a variable left empty in a hosting dashboard often really
 * contains â€” is a truthy string, so trimming afterwards lets it shadow a perfectly good
 * `NEXT_PUBLIC_APP_URL` and quietly collapses the whole chain to localhost. Same shape as `env()`
 * in ./razorpay and ./supabase, for the same reason.
 */
function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * The site's own origin, with any trailing slashes removed.
 *
 * Trimmed with a loop rather than `/\/+$/`, which backtracks super-linearly on a pathological
 * input â€” this value comes from the environment, so it is not worth the regex.
 */
export function appOrigin(): string {
  const configured = env("APP_URL") || env("NEXT_PUBLIC_APP_URL");

  let origin = configured || LOCAL_ORIGIN;
  while (origin.endsWith("/")) origin = origin.slice(0, -1);

  // A value of only slashes would trim away to nothing, which would produce links like
  // "/api/auth/verify?token=..." in an email, where a relative URL means nothing.
  return origin || LOCAL_ORIGIN;
}
