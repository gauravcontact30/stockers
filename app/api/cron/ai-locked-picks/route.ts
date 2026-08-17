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

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && presentedSecret(request) === secret) return true;

  // Admins can also fire it by hand — to re-lock after a failed morning, or to see the list a day
  // early on a fresh deployment. Without a configured secret this is the only way in, so an
  // unconfigured deployment is closed rather than open.
  const user = await userFromRequest(request);
  return Boolean(user && (user.role === "admin" || isAdminEmail(user.email) || isSuperAdminEmail(user.email)));
}

async function handle(request: Request): Promise<NextResponse> {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Scheduler credentials or an admin session are required." }, { status: 401 });
  }

  // `force` re-locks a day that already has a list. Deliberate, admin-triggered, and the one way
  // the ten stocks can change between one 8:50 and the next.
  const force = new URL(request.url).searchParams.get("force") === "true";
  const run = await runDailyPredictionLock(new Date(), { force });

  return NextResponse.json(run, { status: run.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
