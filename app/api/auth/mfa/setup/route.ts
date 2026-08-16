import { NextResponse } from "next/server";
import { generateTotpSecret, totpUri, verifyTotpCode, type MfaMode } from "../../../../lib/auth-security";
import { userFromRequest, updateUser } from "../../../../lib/store";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    mode: user.mfaMode ?? "off",
    enforced: Boolean(user.mfaEnforced),
    hasAuthenticator: Boolean(user.mfaTotpSecret),
    hasMobile: Boolean(user.mobile),
  });
}

export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { mode?: unknown; code?: unknown } | null;
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (mode === "off") {
    const updated = await updateUser(user.id, { mfaMode: "off", mfaOtpHash: null, mfaOtpExpiresAt: null });
    return NextResponse.json({ ok: true, mode: updated?.mfaMode ?? "off" });
  }

  if (mode === "sms") {
    if (!user.mobile) return NextResponse.json({ error: "Add a mobile number before enabling SMS MFA." }, { status: 400 });
    const updated = await updateUser(user.id, { mfaMode: "sms" satisfies MfaMode });
    return NextResponse.json({ ok: true, mode: updated?.mfaMode ?? "sms" });
  }

  if (mode === "totp") {
    if (code) {
      if (!verifyTotpCode(user.mfaTotpSecret, code)) {
        return NextResponse.json({ error: "Authenticator code is invalid." }, { status: 400 });
      }
      const updated = await updateUser(user.id, { mfaMode: "totp" });
      return NextResponse.json({ ok: true, mode: updated?.mfaMode ?? "totp" });
    }

    const secret = generateTotpSecret();
    await updateUser(user.id, { mfaTotpSecret: secret, mfaMode: "off" });
    return NextResponse.json({
      ok: true,
      mode: "setup",
      secret,
      otpauthUri: totpUri({ issuer: "StockersAI", account: user.email, secret }),
    });
  }

  return NextResponse.json({ error: "Choose SMS, authenticator app, or off." }, { status: 400 });
}
