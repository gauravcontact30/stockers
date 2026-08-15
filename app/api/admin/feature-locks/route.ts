import { NextResponse } from "next/server";
import { userFromRequest } from "../../../lib/store";
import { AI_FEATURES, isFeatureKey, readFeatureLocks, setFeatureLock } from "../../../lib/subscription";

export async function GET() {
  return NextResponse.json({ locks: await readFeatureLocks(), features: AI_FEATURES });
}

/**
 * Locks or unlocks one AI feature. Admin only — the check is here on the server, not merely in
 * the UI that hides the toggle, so a non-admin calling this endpoint directly is still refused.
 */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { feature, locked } = (body ?? {}) as { feature?: unknown; locked?: unknown };
  if (!isFeatureKey(feature)) {
    return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, locks: await setFeatureLock(feature, locked === true) });
}
