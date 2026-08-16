import { NextResponse } from "next/server";
import { validateSignin } from "../../../lib/auth-validation";
import { appOrigin, passwordResetEmail, sendMail } from "../../../lib/mailer";
import { recordPlatformLog } from "../../../lib/platform-logs";
import { issuePasswordResetToken } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const errors = validateSignin({ email, password: "placeholder" });
    if (errors.email) {
      return NextResponse.json({ error: errors.email, errors: { email: errors.email } }, { status: 400 });
    }

    const issued = await issuePasswordResetToken(email);
    if (issued) {
      const resetUrl = `${appOrigin()}/signin?reset=${issued.token}`;
      await sendMail({ to: issued.user.email, ...passwordResetEmail({ name: issued.user.name, resetUrl }) });
    }

    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: password recovery",
      operation: "password_reset.requested",
      message: "Password reset was requested.",
      statusCode: 200,
      path: "/api/auth/forgot-password",
      method: "POST",
      metadata: { email, accountFound: Boolean(issued) },
    });

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Password reset request failed. Please try again." }, { status: 500 });
  }
}
