import { NextResponse } from "next/server";
import { ACTION_THROTTLE_MS, recordEvent, VISIT_THROTTLE_MS } from "../../../lib/analytics";
import { userFromRequest } from "../../../lib/store";

/**
 * Where the browser reports a page view, or something the reader did on one.
 *
 * Only those two. Sign-ins, sign-ups and AI feature opens are recorded on the server at the moment
 * they happen — in the auth routes and in the paywall guard — precisely so they cannot be inflated
 * by anyone posting here. This endpoint is unauthenticated by necessity (a signed-out visitor is
 * the most interesting thing it counts), so nothing it accepts is allowed to be load-bearing: the
 * action must be one of a closed list, the label must match a fixed alphabet, and the account is
 * taken from the session rather than from the body.
 *
 * It answers 204 in every case, including a body it rejected. There is nothing a caller can do
 * about a refused analytics ping, and an error code would only invite a retry loop.
 */
type Body = {
  type?: unknown;
  action?: unknown;
  label?: unknown;
  path?: unknown;
  referrer?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
};

export async function POST(request: Request) {
  const noContent = new NextResponse(null, { status: 204 });

  let body: Body | null;
  try {
    body = (await request.json()) as Body | null;
  } catch {
    return noContent;
  }

  // Resolved rather than trusted: the account is whoever the session token says it is, so a ping
  // cannot claim to be somebody else's visit.
  const user = await userFromRequest(request).catch(() => null);
  const isAction = body?.type === "action";

  await recordEvent({
    type: isAction ? "action" : "visit",
    userId: user?.id ?? null,
    // Carried so `recordEvent` can drop the operators' own page views — see ../../../lib/analytics-exclusions.
    userEmail: user?.email ?? null,
    visitorId: body?.visitorId,
    sessionId: body?.sessionId,
    action: body?.action,
    label: body?.label,
    path: body?.path,
    referrer: body?.referrer,
    userAgent: request.headers.get("user-agent"),
    // A page view folds a reload into the first view for half an hour; an action folds only a
    // double-tap of the same thing, because doing something twice on purpose is two events.
    throttleMs: isAction ? ACTION_THROTTLE_MS : VISIT_THROTTLE_MS,
  });

  return noContent;
}
