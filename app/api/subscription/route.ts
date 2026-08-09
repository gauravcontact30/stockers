import { NextResponse } from "next/server";
import { userFromRequest } from "../../lib/store";
import { AI_FEATURES, getAccessStatus, readFeatureLocks } from "../../lib/subscription";

export const dynamic = "force-dynamic";

/**
 * The caller's access state plus the current feature locks — one request that tells the client
 * everything it needs to decide what to render.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  const [status, locks] = await Promise.all([getAccessStatus(user), readFeatureLocks()]);

  return NextResponse.json({
    ...status,
    locks,
    features: AI_FEATURES,
    signedIn: user !== null,
    name: user?.name ?? null,
    email: user?.email ?? null,
  });
}
