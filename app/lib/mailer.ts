// Sending mail.
//
// One provider: Resend. This app ships with three production dependencies (next, react, react-dom)
// and reaches every other service — OpenRouter, NSE, Razorpay — over plain `fetch`; sending mail
// is a JSON POST like the rest of them, and needs nothing installed.
//
// There were four, on the theory that a spare provider is insurance against an undelivered reset
// code. It was not. What actually went wrong was a chain nobody had finished configuring, so every
// fallback was unconfigured too, and the only thing four providers added was four ways to get the
// setup half-right — and a "no mail provider is set" message naming three services the operator
// had never signed up for. One provider has one setup, and one true thing to say about it.
//
// With RESEND_API_KEY unset nothing is sent and nothing throws: the message is appended to a local
// outbox file instead, so the sign-up flow can be developed and tested end to end with no
// credentials and no mail leaving the machine. `transport` on the result says which happened, so a
// caller (and a test, and the recovery panel on the sign-in page) can tell a real delivery from a
// recorded one.
//
// Sending must never be able to fail a sign-up. Every entry point here resolves to a result object
// rather than throwing, and the caller treats a failure as "the account still exists, the mail
// didn't go" — which is recoverable by resending, whereas a rejected sign-up is not.

// Reads RESEND_API_KEY. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { TRIAL_DAYS } from "./subscription-policy";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Where undelivered mail is recorded when no provider is configured. */
const outboxPath = path.join(process.cwd(), "app", "data", "outbox.json");

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Where a message actually went. Anything but "outbox" means it left this server. */
export type MailTransport = "resend" | "outbox";

export type MailResult = {
  ok: boolean;
  transport: MailTransport;
  error?: string;
};

/**
 * What Resend needs, and what it does without.
 *
 * RESEND_API_KEY on its own is enough: with MAIL_FROM empty the mail goes out from Resend's shared
 * sender, which needs no verified domain — see `RESEND_SHARED_FROM` for the catch that comes with
 * it. 3,000 emails a month free, and it takes the HTML these builders produce, so the reset code
 * arrives as the designed mail rather than as a panel template with the text dropped into it.
 *
 * What it cannot be is keyless — there is no service that will send mail on behalf of an anonymous
 * server, and pretending otherwise is what an empty outbox looks like.
 *   resend.com -> API Keys, and Domains -> add + verify the domain in MAIL_FROM
 */
const MAIL_ENV_HINT = "Set RESEND_API_KEY to deliver mail, and MAIL_FROM to send from your own domain.";

function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || "";
}

/**
 * Resend's shared sender, used when the key is set but MAIL_FROM is not.
 *
 * A key with no MAIL_FROM used to count as *unconfigured*, and that is how a deployment carrying a
 * working Resend key came to tell a locked-out reader that email was "not set up on this site
 * yet": mail was skipped over a missing variable, and the recovery panel reported the skip rather
 * than the cause. Resend accepts `onboarding@resend.dev` from any account with no domain verified,
 * so the key on its own is enough to send now.
 *
 * The limit worth stating: until a domain is verified, Resend delivers from this address only to
 * the address that owns the account and rejects every other recipient. That surfaces as "could not
 * be delivered" on the panel — still no code in that reader's inbox, but a true sentence about a
 * real attempt instead of a false one about configuration. Set MAIL_FROM to an address on a
 * verified domain to reach everybody.
 */
const RESEND_SHARED_FROM = "StockersAI <onboarding@resend.dev>";

function resendFrom(): string {
  return mailFrom() || RESEND_SHARED_FROM;
}

/** True when mail can leave this server, which is the only question the callers ask. */
export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Which provider is doing the sending, for the admin health report.
 *
 * There is only one answer left, and it is still worth asking as its own question: "mail is
 * configured" and "mail is arriving" came apart once, and the health panel names the transport so
 * that difference stays visible.
 */
export function mailTransportName(): MailTransport | null {
  return mailConfigured() ? "resend" : null;
}

/**
 * The site's own origin, used to build links that land back here.
 *
 * Re-exported rather than defined here: the OpenRouter clients need the same value and importing
 * the mailer for it would drag `node:fs` and an outbox into nine modules that have no business
 * with either. `./app-origin` explains why the variable is `APP_URL` and not `NEXT_PUBLIC_APP_URL`.
 */
export { appOrigin } from "./app-origin";

async function recordToOutbox(message: MailMessage, reason: string): Promise<MailResult> {
  try {
    await fs.mkdir(path.dirname(outboxPath), { recursive: true });

    let existing: unknown[] = [];
    try {
      const raw = await fs.readFile(outboxPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      // No outbox yet, or it is unreadable â€” start a fresh one rather than losing the message.
    }

    // Newest first, and capped: this is a development aid, not a mail archive.
    existing.unshift({ ...message, reason, recordedAt: new Date().toISOString() });
    await fs.writeFile(outboxPath, JSON.stringify(existing.slice(0, 50), null, 2), "utf8");

    return { ok: true, transport: "outbox" };
  } catch (error) {
    return { ok: false, transport: "outbox", error: String(error) };
  }
}

async function postToResend(message: MailMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`,
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      // Long enough for a slow API, short enough that a hung request cannot hold a sign-up open.
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) return { ok: true };
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `responded ${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

/**
 * Sends one message, through Resend or into the outbox.
 *
 * Never throws and never rejects: a caller in the middle of a sign-up or a password reset must not
 * fail because a mail server did. A message Resend would not take is recorded to the local outbox
 * with its complaint attached, which is what makes a misconfiguration diagnosable instead of
 * merely silent.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailConfigured()) {
    return recordToOutbox(message, `No mail provider configured. ${MAIL_ENV_HINT}`);
  }

  const result = await postToResend(message);
  if (result.ok) return { ok: true, transport: "resend" };

  const failure = `resend ${result.error ?? "failed"}`;
  await recordToOutbox(message, failure);
  return { ok: false, transport: "resend", error: `Mail provider rejected the message: ${failure}` };
}

// ---------------------------------------------------------------------------
// The messages themselves
// ---------------------------------------------------------------------------

/** Escapes text interpolated into the HTML body, so a name with a `<` cannot break the markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND = "StockersAI";

/**
 * The welcome-and-verify message sent the moment an account is created.
 *
 * It is one mail rather than two: a separate "welcome" and "please verify" pair arriving together
 * reads as a duplicate, and the verification link is the only thing the reader has to act on.
 */
export function verificationEmail(params: { name: string; verifyUrl: string }): Omit<MailMessage, "to"> {
  const name = escapeHtml(params.name);
  const url = escapeHtml(params.verifyUrl);

  const text = [
    `Welcome to ${BRAND}, ${params.name}.`,
    "",
    "Confirm your email address to finish setting up your account:",
    params.verifyUrl,
    "",
    `Your free trial runs for ${TRIAL_DAYS} calendar days and opens every AI feature. When it ends your account stays open on the Starter plan.`,
    "",
    "If you didn't create this account, you can ignore this message.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
      <tr>
        <td style="height:4px;background:linear-gradient(90deg,#34d399,#2dd4bf,#10b981);border-radius:16px 16px 0 0"></td>
      </tr>
      <tr>
        <td style="padding:32px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#059669">${BRAND}</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Welcome, ${name}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">
            Confirm your email address to finish setting up your account.
          </p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px">
            Verify my email
          </a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b">
            Your free trial runs for ${TRIAL_DAYS} calendar days and opens every AI feature. When it ends your account stays open on the Starter plan.
          </p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all">
            If the button doesn't work, paste this into your browser:<br />${url}
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            If you didn't create this account, you can ignore this message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: `Confirm your email Â· ${BRAND}`, html, text };
}

export function passwordResetEmail(params: { name: string; resetUrl: string }): Omit<MailMessage, "to"> {
  const name = escapeHtml(params.name);
  const url = escapeHtml(params.resetUrl);

  const text = [
    `Hi ${params.name},`,
    "",
    "Use this link to reset your StockersAI password:",
    params.resetUrl,
    "",
    "This link expires in 30 minutes. If you did not request it, you can ignore this message.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
      <tr>
        <td style="height:4px;background:linear-gradient(90deg,#38bdf8,#22c55e,#f59e0b);border-radius:16px 16px 0 0"></td>
      </tr>
      <tr>
        <td style="padding:32px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#0284c7">${BRAND}</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">
            Hi ${name}, use the secure link below to choose a new password.
          </p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px">
            Reset password
          </a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all">
            If the button doesn't work, paste this into your browser:<br />${url}
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            This link expires in 30 minutes. If you did not request it, you can ignore this message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: `Reset your StockersAI password`, html, text };
}

/**
 * The six-digit recovery code, as mail.
 *
 * Deliberately linkless. A code can be read off a locked phone's notification and typed into the
 * page the reader already has open, which is the whole point of it: it survives a mail client that
 * strips links, a forwarded message, and a reader on a different device from the one they asked
 * from. It is also the half of recovery that still works when a link never arrives at all.
 *
 * The code is in the subject line too, so it can be read without opening the message.
 */
export function passwordResetCodeEmail(params: { name: string; code: string; minutes: number }): Omit<MailMessage, "to"> {
  const name = escapeHtml(params.name);
  const code = escapeHtml(params.code);

  const text = [
    `Hi ${params.name},`,
    "",
    `Your StockersAI password reset code is ${params.code}`,
    "",
    `Type it on the sign-in page to choose a new password. It expires in ${params.minutes} minutes.`,
    "If you did not ask to reset your password, you can ignore this message — your password has not changed.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
      <tr>
        <td style="height:4px;background:linear-gradient(90deg,#38bdf8,#22c55e,#f59e0b);border-radius:16px 16px 0 0"></td>
      </tr>
      <tr>
        <td style="padding:32px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#0284c7">${BRAND}</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Your password reset code</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">
            Hi ${name}, type this code on the sign-in page to choose a new password.
          </p>
          <p style="margin:0;padding:16px 24px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;font-size:32px;font-weight:800;letter-spacing:.35em;text-align:center">${code}</p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            The code expires in ${params.minutes} minutes. If you did not ask for it, you can ignore this message — your password has not changed.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: `${params.code} is your StockersAI password reset code`, html, text };
}

/**
 * An enquiry from the contact form, addressed to the desk rather than to a visitor.
 *
 * The visitor's own words are escaped before they reach the HTML body: this message is composed
 * from text a stranger typed, and it is read in a mail client, so anything that could be markup has
 * to stop being markup first. Their address goes in a Reply-To-style line in the body rather than
 * in the envelope, because the sending domain has to stay ours for the mail to be delivered at all.
 */
export function enquiryEmail(params: {
  name: string;
  email: string;
  topic: string;
  message: string;
}): Omit<MailMessage, "to"> {
  const name = escapeHtml(params.name);
  const email = escapeHtml(params.email);
  const topic = escapeHtml(params.topic);
  const message = escapeHtml(params.message);

  const text = [
    `New ${params.topic} enquiry from ${params.name} <${params.email}>`,
    "",
    params.message,
    "",
    `Reply to: ${params.email}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px">
      <tr>
        <td style="height:4px;background:linear-gradient(90deg,#34d399,#2dd4bf,#10b981);border-radius:16px 16px 0 0"></td>
      </tr>
      <tr>
        <td style="padding:32px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#059669">${BRAND} Â· ${topic}</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Enquiry from ${name}</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#475569">
            Reply to <a href="mailto:${email}" style="color:#059669">${email}</a>
          </p>
          <div style="padding:16px;background:#f8fafc;border-radius:12px;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${message}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: `[${params.topic}] Enquiry from ${params.name}`, html, text };
}

