import { NextResponse } from "next/server";
import { passwordProblem } from "../../../lib/auth-validation";
import { recordPlatformLog } from "../../../lib/platform-logs";
import { resetPasswordWithCode, resetPasswordWithToken } from "../../../lib/store";

/**
 * Sets a new password, from either half of recovery.
 *
 * Two ways in, because there are two ways the secret can reach a reader: the six-digit code they
 * type on the sign-in page (which arrives by mail *and* SMS), and the long token in an emailed
 * link. Same endpoint, same validation, same answer — a reader who used the link and a reader who
 * typed the code cannot tell that anything differs underneath.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: unknown;
      email?: unknown;
      code?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    const byCode = Boolean(email && code);
    const problem = password ? passwordProblem(password) : "Please choose a password.";

    if (!byCode && !token) {
      return NextResponse.json(
        { error: "Enter the 6-digit code we sent you, or use the reset link from your email." },
        { status: 400 },
      );
    }
    if (byCode && code.length !== 6) {
      return NextResponse.json({ error: "Enter the 6-digit code we sent you.", errors: { code: "Enter all 6 digits." } }, { status: 400 });
    }
    if (problem) return NextResponse.json({ error: problem, errors: { password: problem } }, { status: 400 });
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "The two passwords don't match.", errors: { confirmPassword: "The two passwords don't match." } },
        { status: 400 },
      );
    }

    const user = byCode ? await resetPasswordWithCode(email, code, password) : await resetPasswordWithToken(token, password);
    if (!user) {
      recordPlatformLog({
        category: "security",
        severity: "warning",
        source: "Auth",
        useCase: "Security & Access: password recovery",
        operation: "password_reset.rejected",
        message: "A password reset code or link was rejected.",
        statusCode: 400,
        path: "/api/auth/reset-password",
        method: "POST",
        metadata: { email, method: byCode ? "code" : "link" },
      });
      return NextResponse.json(
        {
          error: byCode
            ? "That code is wrong or has expired. Send a new one and try again."
            : "Reset link is invalid or expired.",
        },
        { status: 400 },
      );
    }

    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: password recovery",
      operation: "password_reset.completed",
      message: "User reset their password.",
      statusCode: 200,
      userId: user.id,
      path: "/api/auth/reset-password",
      method: "POST",
      metadata: { email: user.email, method: byCode ? "code" : "link" },
    });

    return NextResponse.json({ ok: true, email: user.email, message: "Password updated. You can sign in now." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Password reset failed. Please try again." }, { status: 500 });
  }
}
