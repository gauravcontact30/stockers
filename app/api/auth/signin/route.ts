import { after, NextResponse } from "next/server";
import { recordEvent, visitorIdFromRequest } from "../../../lib/analytics";
import { firstError, validateSignin } from "../../../lib/auth-validation";
import { createMfaChallenge, hashOneTimeCode, newOtpCode } from "../../../lib/auth-security";
import { recordPlatformLog } from "../../../lib/platform-logs";
import { mfaOtpSms, sendSms } from "../../../lib/sms";
import { authenticateUser, createToken, updateUser } from "../../../lib/store";

function runAfterSignin(task: () => Promise<void>): void {
  const run = () => void task().catch((error) => console.error("signin side effect failed", error));
  try {
    after(run);
  } catch (error) {
    if (!String(error).includes("outside a request scope")) throw error;
    run();
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    /**
     * Only shape is checked here, not strength.
     *
     * An account created under an older, looser password policy still has a valid password, and
     * refusing to let its owner type it would lock them out of an account they own. Whether the
     * pair is right is `authenticateUser`'s business.
     */
    const errors = validateSignin({ email, password });
    if (Object.keys(errors).length > 0) {
      recordPlatformLog({
        category: "security",
        severity: "warning",
        source: "Auth",
        useCase: "Security & Access: failed login attempts",
        operation: "signin.validation_failed",
        message: "A sign-in attempt failed input validation.",
        statusCode: 400,
        path: "/api/auth/signin",
        method: "POST",
        metadata: { email },
      });
      return NextResponse.json({ error: firstError(errors), errors }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      recordPlatformLog({
        category: "security",
        severity: "warning",
        source: "Auth",
        useCase: "Security & Access: failed login attempts",
        operation: "signin.failed",
        message: "A sign-in attempt failed because the credentials were invalid.",
        statusCode: 401,
        path: "/api/auth/signin",
        method: "POST",
        metadata: { email },
      });
      /**
       * One message for a wrong address and a wrong password alike.
       *
       * Saying which was wrong tells anyone who asks whether a given email has an account here,
       * which is both a privacy leak and the first step of a credential-stuffing run. The error is
       * attached to both fields so the form marks them without claiming which one is at fault.
       */
      return NextResponse.json(
        { error: "Invalid email or password.", errors: { email: " ", password: "Invalid email or password." } },
        { status: 401 },
      );
    }

    const mode = user.mfaMode && user.mfaMode !== "off" ? user.mfaMode : user.mfaEnforced && user.mobile ? "sms" : "off";
    if (mode === "totp" || mode === "sms") {
      if (mode === "totp" && !user.mfaTotpSecret) {
        return NextResponse.json({ error: "Authenticator MFA is enabled but not fully set up." }, { status: 403 });
      }

      let delivery: { ok: boolean; transport: string } | null = null;
      if (mode === "sms") {
        if (!user.mobile) {
          return NextResponse.json({ error: "SMS MFA is enabled but no mobile number is available." }, { status: 403 });
        }
        const code = newOtpCode();
        await updateUser(user.id, {
          mfaOtpHash: hashOneTimeCode(code),
          mfaOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
        delivery = await sendSms({ to: user.mobile, body: mfaOtpSms(code) });
      }

      recordPlatformLog({
        category: "security",
        severity: "info",
        source: "Auth",
        useCase: "Security & Access: multi-factor login",
        operation: "signin.mfa_required",
        message: "Password accepted and a second factor is required.",
        statusCode: 202,
        userId: user.id,
        path: "/api/auth/signin",
        method: "POST",
        metadata: { email: user.email, mode, smsTransport: delivery?.transport },
      });

      return NextResponse.json({
        ok: true,
        mfaRequired: true,
        mode,
        challengeToken: createMfaChallenge(user.id, mode),
        smsSent: delivery?.ok === true && delivery.transport === "twilio",
      });
    }

    // Counted here rather than from the browser, so the sign-in figure on the admin dashboard is
    // one that only a successful authentication can move. A failed attempt is not a sign-in and is
    // deliberately not recorded — this is a usage measure, not an audit log.
    const visitorId = visitorIdFromRequest(request);
    const userAgent = request.headers.get("user-agent");
    runAfterSignin(async () => {
      await recordEvent({ type: "signin", userId: user.id, userEmail: user.email, visitorId, userAgent });
    });
    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: successful logins",
      operation: "signin.success",
      message: "User signed in successfully.",
      statusCode: 200,
      userId: user.id,
      path: "/api/auth/signin",
      method: "POST",
      metadata: { email: user.email },
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, mobile: user.mobile ?? null },
      token: createToken(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Signin failed. Please try again." }, { status: 500 });
  }
}
