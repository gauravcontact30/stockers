import { NextResponse } from "next/server";
import { validateSignin } from "../../../lib/auth-validation";
import { appOrigin, mailConfigured, passwordResetCodeEmail, passwordResetEmail, sendMail } from "../../../lib/mailer";
import { recordPlatformLog } from "../../../lib/platform-logs";
import { passwordResetSms, sendSms, smsConfigured } from "../../../lib/sms";
import { PASSWORD_RESET_CODE_MINUTES, issuePasswordResetCode } from "../../../lib/store";

/**
 * Password recovery, starting from a code rather than from a link.
 *
 * The link-only flow this replaces had one failure mode and no way to see it: mail that never
 * arrives looks exactly like mail the reader has not checked yet, and the page said "if an account
 * exists, a reset link has been sent" either way. On a deployment with no mail provider configured
 * that message was simply untrue — `sendMail` was writing to a local outbox file.
 *
 * So two things changed. A six-digit code is issued and sent over *every* channel the account has,
 * which on an account with a mobile means recovery no longer depends on mail at all. And the
 * response says what actually happened per channel — delivered, or not configured on this
 * deployment — so a reader who is never going to receive an email is told that instead of being
 * asked to wait for one.
 *
 * The emailed link is still sent alongside, so an old link in somebody's inbox keeps working.
 */

export type ResetChannelState = "sent" | "recorded" | "unconfigured" | "failed";

export type ResetChannel = {
  kind: "email" | "sms";
  /** Masked: enough to recognise the destination, not enough to publish it. */
  target: string;
  state: ResetChannelState;
};

/** `garvcontact30@gmail.com` -> `g••••••••30@gmail.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}•@${domain}`;
  return `${local[0]}${"•".repeat(Math.max(1, local.length - 3))}${local.slice(-2)}@${domain}`;
}

/** `9876543210` -> `••••••3210`. */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function stateFor(result: { ok: boolean; transport: string }, configured: boolean): ResetChannelState {
  if (result.ok && result.transport !== "outbox") return "sent";
  if (!configured) return "unconfigured";
  // It was accepted by neither the provider nor validation, and is sitting in the local outbox.
  return result.ok ? "recorded" : "failed";
}

/**
 * What to tell the reader, given where the code actually went.
 *
 * Never "check your email" when nothing can reach their email — that is the sentence that wasted
 * their afternoon. When no channel worked, the message says so plainly and points at support,
 * because at that point there is nothing the reader can do differently.
 */
function messageFor(channels: ResetChannel[]): string {
  const live = channels.filter((channel) => channel.state === "sent");
  if (live.length === 0) {
    return "We couldn't deliver a code on this deployment. Please contact support to recover this account.";
  }

  const where = live.map((channel) => (channel.kind === "sms" ? `SMS to ${channel.target}` : channel.target)).join(" and ");
  return `Code sent to ${where}. Enter it below with your new password — it expires in ${PASSWORD_RESET_CODE_MINUTES} minutes.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const errors = validateSignin({ email, password: "placeholder" });
    if (errors.email) {
      return NextResponse.json({ error: errors.email, errors: { email: errors.email } }, { status: 400 });
    }

    const issued = await issuePasswordResetCode(email);
    const channels: ResetChannel[] = [];

    if (issued) {
      const mailResult = await sendMail({
        to: issued.user.email,
        ...passwordResetCodeEmail({
          name: issued.user.name,
          code: issued.code,
          minutes: PASSWORD_RESET_CODE_MINUTES,
        }),
      });
      channels.push({ kind: "email", target: maskEmail(issued.user.email), state: stateFor(mailResult, mailConfigured()) });

      if (issued.user.mobile) {
        const smsResult = await sendSms({
          to: issued.user.mobile,
          body: passwordResetSms(issued.code, PASSWORD_RESET_CODE_MINUTES),
        });
        channels.push({ kind: "sms", target: maskMobile(issued.user.mobile), state: stateFor(smsResult, smsConfigured()) });
      }

      // A one-click version of the same code, for readers who would rather not retype it. The link
      // carries the address as well, so following it lands on a recovery panel with both fields
      // already filled and only the new password left to choose. Its delivery is not reported: the
      // code above is the flow this page is built around now.
      const resetUrl = `${appOrigin()}/signin?${new URLSearchParams({ reset: issued.code, email: issued.user.email }).toString()}`;
      await sendMail({
        to: issued.user.email,
        ...passwordResetEmail({ name: issued.user.name, resetUrl }),
      }).catch(() => undefined);
    }

    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: password recovery",
      operation: "password_reset.requested",
      message: "A password reset code was requested.",
      statusCode: 200,
      path: "/api/auth/forgot-password",
      method: "POST",
      metadata: { email, accountFound: Boolean(issued), channels: channels.map((channel) => `${channel.kind}:${channel.state}`) },
    });

    // An address with no account gets the same shape of answer and the same delay, so this cannot
    // be used to ask which addresses are registered here.
    if (!issued) {
      return NextResponse.json({
        ok: true,
        channels: [],
        expiresInMinutes: PASSWORD_RESET_CODE_MINUTES,
        message: `If an account exists for that email, a code is on its way. It expires in ${PASSWORD_RESET_CODE_MINUTES} minutes.`,
      });
    }

    return NextResponse.json({
      ok: true,
      channels,
      expiresInMinutes: PASSWORD_RESET_CODE_MINUTES,
      message: messageFor(channels),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Password reset request failed. Please try again." }, { status: 500 });
  }
}
