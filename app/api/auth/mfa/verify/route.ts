import { NextResponse } from "next/server";
import { recordEvent, visitorIdFromRequest } from "../../../../lib/analytics";
import { verifyMfaChallenge, verifyOneTimeCode, verifyTotpCode } from "../../../../lib/auth-security";
import { recordPlatformLog } from "../../../../lib/platform-logs";
import { createToken, findUserById, updateUser } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { challengeToken?: unknown; code?: unknown } | null;
    const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    const challenge = verifyMfaChallenge(challengeToken);
    if (!challenge || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Enter the 6-digit security code." }, { status: 400 });
    }

    const user = await findUserById(challenge.userId);
    if (!user) {
      return NextResponse.json({ error: "This sign-in challenge is no longer valid." }, { status: 401 });
    }

    const ok =
      challenge.mode === "totp"
        ? verifyTotpCode(user.mfaTotpSecret, code)
        : Boolean(
            user.mfaOtpExpiresAt &&
              Date.parse(user.mfaOtpExpiresAt) >= Date.now() &&
              verifyOneTimeCode(code, user.mfaOtpHash),
          );

    if (!ok) {
      recordPlatformLog({
        category: "security",
        severity: "warning",
        source: "Auth",
        useCase: "Security & Access: multi-factor login",
        operation: "signin.mfa_failed",
        message: "A second-factor code was rejected.",
        statusCode: 401,
        userId: user.id,
        path: "/api/auth/mfa/verify",
        method: "POST",
        metadata: { mode: challenge.mode },
      });
      return NextResponse.json({ error: "That security code is invalid or expired." }, { status: 401 });
    }

    if (challenge.mode === "sms") {
      await updateUser(user.id, { mfaOtpHash: null, mfaOtpExpiresAt: null });
    }

    await recordEvent({
      type: "signin",
      userId: user.id,
      userEmail: user.email,
      visitorId: visitorIdFromRequest(request),
      userAgent: request.headers.get("user-agent"),
    });
    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: multi-factor login",
      operation: "signin.mfa_success",
      message: "User completed multi-factor sign-in.",
      statusCode: 200,
      userId: user.id,
      path: "/api/auth/mfa/verify",
      method: "POST",
      metadata: { mode: challenge.mode },
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, mobile: user.mobile ?? null },
      token: createToken(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "MFA verification failed. Please try again." }, { status: 500 });
  }
}
