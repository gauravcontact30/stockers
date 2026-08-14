import { NextResponse } from "next/server";
import { touchPresence } from "../../../lib/presence";
import { userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * Where an open tab says it is still there.
 *
 * The sibling of `../track`, and unauthenticated for the same reason: a signed-out reader is a
 * person on the site, and a live count that only knew about signed-in ones would answer a
 * different question from the one it is labelled with. Nothing it accepts is load-bearing — the
 * account comes from the session token rather than from the body, the path is stripped of its
 * query string, and the ids are only accepted in the shape this app issues.
 *
 * The worst a caller can do by posting here is claim to be one more anonymous browser, which is
 * also the worst they can do by opening the site in a second tab.
 *
 * It answers 204 in every case, including a body it rejected: there is nothing a browser can do
 * about a refused heartbeat, and an error status would only invite a retry loop.
 */
type Body = {
  path?: unknown;
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

  const user = await userFromRequest(request).catch(() => null);

  await touchPresence({
    userId: user?.id ?? null,
    visitorId: body?.visitorId,
    sessionId: body?.sessionId,
    path: body?.path,
    userAgent: request.headers.get("user-agent"),
  });

  return noContent;
}
