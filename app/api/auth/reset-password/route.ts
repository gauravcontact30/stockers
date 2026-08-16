import { NextResponse } from "next/server";
import { passwordProblem } from "../../../lib/auth-validation";
import { recordPlatformLog } from "../../../lib/platform-logs";
import { resetPasswordWithToken } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    const problem = password ? passwordProblem(password) : "Please choose a password.";
    if (!token) return NextResponse.json({ error: "Reset link is missing or invalid." }, { status: 400 });
    if (problem) return NextResponse.json({ error: problem, errors: { password: problem } }, { status: 400 });
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "The two passwords don't match.", errors: { confirmPassword: "The two passwords don't match." } },
        { status: 400 },
      );
    }

    const user = await resetPasswordWithToken(token, password);
    if (!user) {
      return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 });
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
      metadata: { email: user.email },
    });

    return NextResponse.json({ ok: true, message: "Password updated. You can sign in now." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Password reset failed. Please try again." }, { status: 500 });
  }
}
