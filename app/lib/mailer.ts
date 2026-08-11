// Sending mail.
//
// There is deliberately no SMTP client and no new dependency here. This app ships with three
// production dependencies (next, react, react-dom) and reaches every other service — OpenRouter,
// NSE, Razorpay — over plain `fetch`. Mail is no different: Resend's HTTP API takes a JSON POST,
// which is the whole transport.
//
// Required environment to actually deliver:
//   RESEND_API_KEY   the API key from resend.com
//   MAIL_FROM        the verified sender, e.g. "StockersAI <hello@yourdomain.com>"
//
// Without them nothing is sent and nothing throws: the message is appended to a local outbox file
// instead, so the sign-up flow can be developed and tested end to end with no credentials and no
// mail leaving the machine. `transport` on the result says which of the two happened, so a caller
// (and a test) can tell a real delivery from a recorded one.
//
// Sending must never be able to fail a sign-up. Every entry point here resolves to a result object
// rather than throwing, and the caller treats a failure as "the account still exists, the mail
// didn't go" — which is recoverable by resending, whereas a rejected sign-up is not.

import { promises as fs } from "node:fs";
import path from "node:path";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Where undelivered mail is recorded when no provider is configured. */
const outboxPath = path.join(process.cwd(), "app", "data", "outbox.json");

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailResult = {
  ok: boolean;
  /** "resend" when it really went out, "outbox" when it was only recorded locally. */
  transport: "resend" | "outbox";
  error?: string;
};

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
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
      // No outbox yet, or it is unreadable — start a fresh one rather than losing the message.
    }

    // Newest first, and capped: this is a development aid, not a mail archive.
    existing.unshift({ ...message, reason, recordedAt: new Date().toISOString() });
    await fs.writeFile(outboxPath, JSON.stringify(existing.slice(0, 50), null, 2), "utf8");

    return { ok: true, transport: "outbox" };
  } catch (error) {
    return { ok: false, transport: "outbox", error: String(error) };
  }
}

/**
 * Sends one message, or records it if no provider is configured.
 *
 * Never throws and never rejects.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailConfigured()) {
    return recordToOutbox(message, "RESEND_API_KEY or MAIL_FROM not set");
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // The provider refused it. Keep the message rather than dropping it on the floor, so the
      // body can be inspected and resent once the configuration is fixed.
      const detail = await response.text().catch(() => "");
      await recordToOutbox(message, `resend responded ${response.status}: ${detail.slice(0, 200)}`);
      return { ok: false, transport: "resend", error: `Mail provider returned ${response.status}.` };
    }

    return { ok: true, transport: "resend" };
  } catch (error) {
    await recordToOutbox(message, `network error: ${String(error).slice(0, 200)}`);
    return { ok: false, transport: "resend", error: "Could not reach the mail provider." };
  }
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
    "Your free trial runs for five open market days — weekends and NSE holidays don't count against it.",
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
            Your free trial runs for five open market days — weekends and NSE holidays don't count against it.
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

  return { subject: `Confirm your email · ${BRAND}`, html, text };
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
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#059669">${BRAND} · ${topic}</p>
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
