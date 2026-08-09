// Sending an SMS, with the same contract as ./mailer.
//
// One transport is implemented — Twilio's REST API — because it needs nothing but `fetch` and this
// project carries three production dependencies on purpose. Everything else about the shape here
// mirrors the mailer deliberately: it never throws, it degrades to a local outbox when nothing is
// configured, and it reports which of the two happened. A sign-up must not fail because an SMS
// gateway is down, and a developer with no gateway at all must still be able to see what would
// have been sent.
//
// One thing to know before switching this on for real Indian numbers: TRAI requires every
// commercial SMS to India to be sent against a DLT-registered sender id and an approved template.
// A gateway will accept the API call and silently drop the message otherwise. The body below is
// written as a fixed template with one variable so it can be registered as-is.

import { promises as fs } from "node:fs";
import path from "node:path";
import { normaliseMobile } from "./auth-validation";

const outboxPath = path.join(process.cwd(), "app", "data", "sms-outbox.json");

export type SmsMessage = {
  /** A ten-digit Indian mobile number, or one this module can normalise into that. */
  to: string;
  body: string;
};

export type SmsResult = {
  ok: boolean;
  /** "twilio" when it really went out, "outbox" when it was only recorded locally. */
  transport: "twilio" | "outbox";
  error?: string;
};

type TwilioConfig = { accountSid: string; authToken: string; from: string };

/** The gateway credentials, or null when the environment has none — which is not an error. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

export function smsConfigured(): boolean {
  return twilioConfig() !== null;
}

/** E.164, which is the only format a gateway will accept. Indian numbers, so +91. */
export function toE164(mobile: string): string | null {
  const digits = normaliseMobile(mobile);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/**
 * Records a message that could not be sent, so a developer can read what would have gone out.
 *
 * The file is gitignored. It holds a phone number and the message body, which is exactly the sort
 * of thing that should never reach a repository.
 */
async function recordToOutbox(message: SmsMessage, reason: string): Promise<SmsResult> {
  try {
    await fs.mkdir(path.dirname(outboxPath), { recursive: true });

    let existing: unknown[] = [];
    try {
      existing = JSON.parse(await fs.readFile(outboxPath, "utf8")) as unknown[];
    } catch {
      // No outbox yet, or an unreadable one. Either way this message starts a fresh list rather
      // than failing — losing an old development log is not worth failing a sign-up over.
      existing = [];
    }

    existing.push({ ...message, reason, at: new Date().toISOString() });
    await fs.writeFile(outboxPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    return { ok: true, transport: "outbox", error: reason };
  } catch (error) {
    return { ok: false, transport: "outbox", error: String(error) };
  }
}

/**
 * Sends one SMS. Never throws.
 *
 * Every failure — an unconfigured gateway, a number that is not a mobile, a refused request, a
 * network fault — resolves rather than rejecting, because every caller is doing something more
 * important than this and none of them should be brought down by it.
 */
export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  const to = toE164(message.to);
  if (!to) return { ok: false, transport: "outbox", error: "Not a valid Indian mobile number." };

  const config = twilioConfig();
  if (!config) return recordToOutbox(message, "No SMS gateway configured");

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: config.from, Body: message.body }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      return recordToOutbox(message, `Gateway responded ${response.status}: ${detail.slice(0, 200)}`);
    }

    return { ok: true, transport: "twilio" };
  } catch (error) {
    return recordToOutbox(message, String(error));
  }
}

/**
 * The message a new account gets.
 *
 * Short, and written as a fixed template with the name as the only variable, so it can be
 * registered with DLT exactly as it appears here. Nothing in it is a link: an SMS full of URLs is
 * both a phishing signal to the recipient and a reason for a carrier to filter it.
 */
export function welcomeSms(name: string): string {
  return `Welcome to StockersAI, ${name}. Your account is active and your 5-day free trial has started. Check your email to confirm your address.`;
}

/** The message sent once a subscription payment has been captured. */
export function subscriptionSms(params: { name: string; plan: string; until: string }): string {
  return `Hi ${params.name}, your StockersAI ${params.plan} subscription is active until ${params.until}. Thank you for subscribing.`;
}
