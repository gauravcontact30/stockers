// Sending mail.
//
// Still no new dependency: this app ships with three production dependencies (next, react,
// react-dom) and reaches every other service â€” OpenRouter, NSE, Razorpay â€” over plain `fetch`.
// Three of the four providers below are a JSON POST, and the fourth is ./smtp, ~120 lines of
// `node:tls` rather than a megabyte of nodemailer.
//
// Four providers rather than one, because a deployment with none configured is not a hypothetical:
// it is what "the password reset email never arrives" turned out to mean. See the note on the
// provider order below for what each one costs (nothing, at this volume) and what it needs.
//
// With none of them configured nothing is sent and nothing throws: the message is appended to a
// local outbox file instead, so the sign-up flow can be developed and tested end to end with no
// credentials and no mail leaving the machine. `transport` on the result says which happened, so a
// caller (and a test, and the recovery panel on the sign-in page) can tell a real delivery from a
// recorded one.
//
// Sending must never be able to fail a sign-up. Every entry point here resolves to a result object
// rather than throwing, and the caller treats a failure as "the account still exists, the mail
// didn't go" â€” which is recoverable by resending, whereas a rejected sign-up is not.

// Reads RESEND_API_KEY. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { sendSmtpMail, smtpConfig } from "./smtp";
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
export type MailTransport = "resend" | "brevo" | "sendgrid" | "smtp" | "outbox";

export type MailResult = {
  ok: boolean;
  transport: MailTransport;
  error?: string;
};

/**
 * The mail providers, in the order they are tried.
 *
 * More than one, because "no mail is arriving" was a real report against a deployment that had
 * none configured, and the fix has to be something the operator can complete in five minutes. Each
 * of these has a free tier that comfortably covers this app's volume, and the last one needs no
 * new account at all — just a mailbox the operator already owns:
 *
 *   resend     RESEND_API_KEY + MAIL_FROM        3,000/month free, needs a verified domain
 *   brevo      BREVO_API_KEY + MAIL_FROM         300/day free, sends from any verified address
 *   sendgrid   SENDGRID_API_KEY + MAIL_FROM      100/day free
 *   smtp       SMTP_HOST/USER/PASSWORD           a Gmail app password, or the domain's own mailbox
 *
 * The first one configured wins; a configured provider that *fails* falls through to the next, so
 * a provider having a bad afternoon costs a retry rather than a locked-out account. What none of
 * them can be is keyless — there is no service that will send mail on behalf of an anonymous
 * server, and pretending otherwise is what an empty outbox looks like.
 */
const MAIL_ENV_HINT =
  "Set RESEND_API_KEY, BREVO_API_KEY, SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASSWORD (with MAIL_FROM) to deliver mail.";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "";
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && mailFrom());
}

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && mailFrom());
}

export function sendgridConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim() && mailFrom());
}

/** True when *some* provider can deliver, which is the only question the callers ask. */
export function mailConfigured(): boolean {
  return resendConfigured() || brevoConfigured() || sendgridConfigured() || smtpConfig() !== null;
}

/** Which provider is doing the sending, for the admin health report. */
export function mailTransportName(): MailTransport | null {
  if (resendConfigured()) return "resend";
  if (brevoConfigured()) return "brevo";
  if (sendgridConfigured()) return "sendgrid";
  if (smtpConfig()) return "smtp";
  return null;
}

/** `Name <address>` split into the pair the JSON APIs want. */
function fromParts(): { email: string; name?: string } {
  const value = mailFrom();
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: value };
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

/** One provider attempt: the reason string is what lands in the outbox if everything fails. */
type Attempt = { transport: MailTransport; send: () => Promise<{ ok: boolean; error?: string }> };

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) return { ok: true };
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `responded ${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

function attemptsFor(message: MailMessage): Attempt[] {
  const from = fromParts();
  const attempts: Attempt[] = [];

  if (resendConfigured()) {
    attempts.push({
      transport: "resend",
      send: () =>
        postJson(
          RESEND_ENDPOINT,
          { Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}` },
          { from: mailFrom(), to: [message.to], subject: message.subject, html: message.html, text: message.text },
        ),
    });
  }

  if (brevoConfigured()) {
    attempts.push({
      transport: "brevo",
      send: () =>
        postJson(
          BREVO_ENDPOINT,
          { "api-key": process.env.BREVO_API_KEY?.trim() ?? "" },
          {
            sender: { email: from.email, ...(from.name ? { name: from.name } : {}) },
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text,
          },
        ),
    });
  }

  if (sendgridConfigured()) {
    attempts.push({
      transport: "sendgrid",
      send: () =>
        postJson(
          SENDGRID_ENDPOINT,
          { Authorization: `Bearer ${process.env.SENDGRID_API_KEY?.trim()}` },
          {
            personalizations: [{ to: [{ email: message.to }] }],
            from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
            subject: message.subject,
            content: [
              { type: "text/plain", value: message.text },
              { type: "text/html", value: message.html },
            ],
          },
        ),
    });
  }

  const smtp = smtpConfig();
  if (smtp) {
    attempts.push({
      transport: "smtp",
      send: () => sendSmtpMail(smtp, { from: mailFrom() || smtp.user, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
  }

  return attempts;
}

/**
 * Sends one message through the first provider that takes it.
 *
 * Never throws and never rejects: a caller in the middle of a sign-up or a password reset must not
 * fail because a mail server did. A message no provider accepted is recorded to the local outbox
 * with every provider's complaint attached, which is what makes a misconfiguration diagnosable
 * instead of merely silent.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const attempts = attemptsFor(message);
  if (attempts.length === 0) {
    return recordToOutbox(message, `No mail provider configured. ${MAIL_ENV_HINT}`);
  }

  const failures: string[] = [];
  for (const attempt of attempts) {
    const result = await attempt.send();
    if (result.ok) return { ok: true, transport: attempt.transport };
    failures.push(`${attempt.transport} ${result.error ?? "failed"}`);
  }

  await recordToOutbox(message, failures.join(" | "));
  return { ok: false, transport: attempts[attempts.length - 1].transport, error: `Mail provider rejected the message: ${failures[0]}` };
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

