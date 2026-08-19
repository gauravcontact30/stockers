import { NextResponse } from "next/server";
import { isAdminEmail, isSuperAdminEmail } from "../../../lib/admin-access";
import { runDailyPredictionLock } from "../../../lib/bse-ai-prediction-accuracy";
import { userFromRequest } from "../../../lib/store";

/**
 * The 8:50 AM IST daily lock, as a scheduled endpoint.
 *
 * The picks are meant to exist *before* anyone looks at them — 25 minutes ahead of the 9:15 open —
 * which a page load cannot guarantee, since the first visitor of the day may well arrive at
 * eleven. So the schedule (`vercel.json`, or any external cron hitting this URL) owns the run and
 * the page only reads what it left behind.
 *
 * Nothing here is destructive twice over: the run is idempotent, and a day that is already locked
 * is reported back untouched rather than re-predicted.
 */

/** Vercel's scheduler sends the secret as a bearer token; other schedulers tend to use a header. */
function presentedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return bearer || request.headers.get("x-cron-secret")?.trim() || null;
}

/**
 * Vercel stamps its own scheduled invocations with this header, and only sends the bearer token
 * when `CRON_SECRET` is set.
 *
 * Accepting it is what makes the schedule in `vercel.json` work on a deployment where the secret
 * was never configured — which is the state this repository ships in, and which used to answer 401
 * to the scheduler every morning while looking, from the outside, exactly like a lock that had
 * simply not run. The header is not proof of anything on its own, so it opens only the plain
 * idempotent run: a day that is already locked is left alone, and `force` still needs the secret
 * or an admin. The worst a forged one can do is ask for the list that was going to be built anyway.
 */
function looksLikeVercelCron(request: Request): boolean {
  return request.headers.get("x-vercel-cron") !== null;
}

async function isAdmin(request: Request): Promise<boolean> {
  const user = await userFromRequest(request);
  return Boolean(user && (user.role === "admin" || isAdminEmail(user.email) || isSuperAdminEmail(user.email)));
}

async function authorize(request: Request, force: boolean): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && presentedSecret(request) === secret) return true;

  if (!force && looksLikeVercelCron(request)) return true;

  // Admins can also fire it by hand — to re-lock after a failed morning, or to see the list a day
  // early on a fresh deployment.
  return isAdmin(request);
}

async function handle(request: Request): Promise<NextResponse> {
  // `force` re-locks a day that already has a list. Deliberate, admin-triggered, and the one way
  // the ten stocks can change between one 8:50 and the next.
  const force = new URL(request.url).searchParams.get("force") === "true";

  if (!(await authorize(request, force))) {
    return NextResponse.json({ error: "Scheduler credentials or an admin session are required." }, { status: 401 });
  }

  const run = await runDailyPredictionLock(new Date(), { force });

  return NextResponse.json(run, { status: run.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
