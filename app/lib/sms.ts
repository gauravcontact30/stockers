import "server-only";

// Sending an SMS, with the same contract as ./mailer.
//
// Three gateways are implemented â€” Twilio, Fast2SMS and MSG91 â€” each of them nothing but a `fetch`,
// because this project carries three production dependencies on purpose. Everything else about the
// shape here mirrors the mailer deliberately: it never throws, it degrades to a local outbox when nothing is
// configured, and it reports which of the two happened. A sign-up must not fail because an SMS
// gateway is down, and a developer with no gateway at all must still be able to see what would
// have been sent.
//
// One thing to know before switching this on for real Indian numbers: TRAI requires every
// commercial SMS to India to be sent against a DLT-registered sender id and an approved template.
// A gateway will accept the API call and silently drop the message otherwise. The body below is
// written as a fixed template with one variable so it can be registered as-is.

// Reads TWILIO_AUTH_TOKEN. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.

import { promises as fs } from "node:fs";
import path from "node:path";
import { TRIAL_DAYS } from "./subscription-policy";
import { normaliseMobile } from "./auth-validation";

const outboxPath = path.join(process.cwd(), "app", "data", "sms-outbox.json");

export type SmsMessage = {
  /** A ten-digit Indian mobile number, or one this module can normalise into that. */
  to: string;
  body: string;
};

/** Where a message actually went. Anything but "outbox" means it left this server. */
export type SmsTransport = "twilio" | "fast2sms" | "msg91" | "outbox";

export type SmsResult = {
  ok: boolean;
  transport: SmsTransport;
  error?: string;
};

type TwilioConfig = { accountSid: string; authToken: string; from: string };

/** The gateway credentials, or null when the environment has none â€” which is not an error. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

/**
 * The gateways, in the order they are tried.
 *
 * Twilio is the international default and needs a card even for its trial credit, which is exactly
 * the wall an operator in India hits first. So two Indian gateways sit behind it, both with a free
 * quota big enough for password recovery:
 *
 *   twilio     TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
 *   fast2sms   FAST2SMS_API_KEY                    free quota, no card, transactional route
 *   msg91      MSG91_AUTH_KEY + MSG91_SENDER_ID    free trial credits
 *
 * The DLT caveat at the top of this file applies to all three: an Indian gateway will accept the
 * call and drop the message if the sender id and template are not registered. Fast2SMS's "q"
 * (quick) route is the exception that makes it the useful one to start with — it sends without a
 * registered template, which is why it is tried before MSG91.
 */
export function fast2smsConfigured(): boolean {
  return Boolean(process.env.FAST2SMS_API_KEY?.trim());
}

export function msg91Configured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_SENDER_ID?.trim());
}

/** True when *some* gateway can deliver, which is the only question the callers ask. */
export function smsConfigured(): boolean {
  return twilioConfig() !== null || fast2smsConfigured() || msg91Configured();
}

/** Which gateway is doing the sending, for the admin health report. */
export function smsTransportName(): SmsTransport | null {
  if (twilioConfig()) return "twilio";
  if (fast2smsConfigured()) return "fast2sms";
  if (msg91Configured()) return "msg91";
  return null;
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
      // than failing â€” losing an old development log is not worth failing a sign-up over.
      existing = [];
    }

    existing.push({ ...message, reason, at: new Date().toISOString() });
    await fs.writeFile(outboxPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    return { ok: true, transport: "outbox", error: reason };
  } catch (error) {
    return { ok: false, transport: "outbox", error: String(error) };
  }
}

type SmsAttempt = { transport: SmsTransport; send: () => Promise<{ ok: boolean; error?: string }> };

async function twilioSend(config: TwilioConfig, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: config.from, Body: body }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true };
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `responded ${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

/**
 * Fast2SMS, which takes a ten-digit number rather than E.164 and answers 200 even for some
 * refusals — hence the `return` field is checked and not just the status.
 */
async function fast2smsSend(nationalNumber: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: process.env.FAST2SMS_API_KEY?.trim() ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ route: "q", message: body, language: "english", flash: 0, numbers: nationalNumber }),
      signal: AbortSignal.timeout(10_000),
    });

    const detail = await response.text().catch(() => "");
    if (response.ok && /"return"\s*:\s*true/.test(detail)) return { ok: true };
    return { ok: false, error: `responded ${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

async function msg91Send(nationalNumber: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: { authkey: process.env.MSG91_AUTH_KEY?.trim() ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: process.env.MSG91_SENDER_ID?.trim(),
        route: "4",
        country: "91",
        sms: [{ message: body, to: [nationalNumber] }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const detail = await response.text().catch(() => "");
    if (response.ok && !/"type"\s*:\s*"error"/.test(detail)) return { ok: true };
    return { ok: false, error: `responded ${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

/**
 * Sends one SMS through the first gateway that takes it. Never throws.
 *
 * Every failure — an unconfigured gateway, a number that is not a mobile, a refused request, a
 * network fault — resolves rather than rejecting, because every caller is doing something more
 * important than this and none of them should be brought down by it. A message no gateway accepted
 * is recorded locally with each gateway's complaint attached.
 */
export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  const to = toE164(message.to);
  if (!to) return { ok: false, transport: "outbox", error: "Not a valid Indian mobile number." };

  // The Indian gateways address a subscriber by the bare ten digits, not by E.164.
  const national = to.slice(3);
  const config = twilioConfig();
  const attempts: SmsAttempt[] = [];

  if (config) attempts.push({ transport: "twilio", send: () => twilioSend(config, to, message.body) });
  if (fast2smsConfigured()) attempts.push({ transport: "fast2sms", send: () => fast2smsSend(national, message.body) });
  if (msg91Configured()) attempts.push({ transport: "msg91", send: () => msg91Send(national, message.body) });

  if (attempts.length === 0) return recordToOutbox(message, "No SMS gateway configured");

  const failures: string[] = [];
  for (const attempt of attempts) {
    const result = await attempt.send();
    if (result.ok) return { ok: true, transport: attempt.transport };
    failures.push(`${attempt.transport} ${result.error ?? "failed"}`);
  }

  return recordToOutbox(message, failures.join(" | "));
}

/**
 * The message a new account gets.
 *
 * Short, and written as a fixed template with the name as the only variable, so it can be
 * registered with DLT exactly as it appears here. Nothing in it is a link: an SMS full of URLs is
 * both a phishing signal to the recipient and a reason for a carrier to filter it.
 */
export function welcomeSms(name: string): string {
  return `Welcome to StockersAI, ${name}. Your ${TRIAL_DAYS}-day free trial of every AI feature has started. Check your email to confirm your address.`;
}

export function mfaOtpSms(code: string): string {
  return `Your StockersAI sign-in code is ${code}. It expires in 5 minutes.`;
}

/**
 * The password reset code, as SMS.
 *
 * The second channel recovery runs on, and the one that still works when mail is the thing that is
 * broken. Fixed template, no link, same as every other message here — see `welcomeSms`.
 */
export function passwordResetSms(code: string, minutes: number): string {
  return `Your StockersAI password reset code is ${code}. It expires in ${minutes} minutes. Do not share this code with anyone.`;
}

/** The message sent once a subscription payment has been captured. */
export function subscriptionSms(params: { name: string; plan: string; until: string }): string {
  return `Hi ${params.name}, your StockersAI ${params.plan} subscription is active until ${params.until}. Thank you for subscribing.`;
}
