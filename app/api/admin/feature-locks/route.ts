import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { logAuditEvent, logSecurityEvent } from "../../../lib/application-logger";
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
  const path = new URL(request.url).pathname;
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    logSecurityEvent({
      level: "warn",
      useCase: "Security & Access: admin feature lock access",
      operation: "feature_lock.denied",
      message: "Non-admin caller attempted to change a feature lock.",
      userId: user?.id ?? null,
      statusCode: 403,
      path,
      method: request.method,
      metadata: { role: user?.role ?? null },
    });
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

  const nextLocked = locked === true;
  const locks = await setFeatureLock(feature, nextLocked);
  logAuditEvent({
    useCase: "Feature lock administration",
    operation: "feature_lock.update",
    message: `Admin ${nextLocked ? "locked" : "unlocked"} an AI feature.`,
    userId: user.id,
    statusCode: 200,
    path,
    method: request.method,
    metadata: { feature, locked: nextLocked },
  });

  return NextResponse.json({ ok: true, locks });
}
