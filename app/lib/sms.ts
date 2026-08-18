import "server-only";

// Sending an SMS, with the same contract as ./mailer.
//
// Three gateways are implemented â€” MSG91, Twilio and Fast2SMS â€” each of them nothing but a `fetch`,
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
  /**
   * The blanks in the DLT template, for a gateway that sends by template rather than by body.
   *
   * MSG91's Flow API does not accept a message: it accepts a registered template id and the values
   * to drop into it, and the carrier renders the sentence. So a caller that wants MSG91 to send
   * has to say what the variables are as well as what the finished sentence reads like — the
   * finished sentence is still what Twilio and Fast2SMS send, and what lands in the outbox.
   */
  variables?: Record<string, string>;
  /** Overrides MSG91_TEMPLATE_ID, for a deployment that registers one template per message type. */
  templateId?: string;
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
 *   msg91      MSG91_AUTH_KEY + MSG91_TEMPLATE_ID   Flow API v5, DLT template rendered by MSG91
 *   twilio     TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
 *   fast2sms   FAST2SMS_API_KEY                     free quota, no card, transactional route
 *
 * MSG91 leads because it is the gateway this deployment is set up against deliberately, and
 * because its Flow API is the only one of the three that is DLT-correct by construction: the
 * wording lives in a registered template and MSG91 renders it. The other two send a free-text
 * body and depend on the operator having registered matching wording separately, with
 * Fast2SMS's "q" (quick) route the one exception that makes it a usable last resort.
 *
 * The DLT caveat at the top of this file still applies to all three: an Indian gateway will
 * accept the call and drop the message if the sender id and template are not registered.
 */
export function fast2smsConfigured(): boolean {
  return Boolean(process.env.FAST2SMS_API_KEY?.trim());
}

/**
 * MSG91 has two send paths and this project supports both, because an existing deployment should
 * not break to gain the new one:
 *
 *   flow    MSG91_AUTH_KEY + MSG91_TEMPLATE_ID   the current v5 API, DLT template rendered by MSG91
 *   legacy  MSG91_AUTH_KEY + MSG91_SENDER_ID     the v2 sendsms endpoint, message sent as free text
 *
 * Flow wins when both are set. It is the path MSG91 documents today, and it is the only one that
 * is actually DLT-correct: v2 will accept a free-text body, hand back `"type":"success"`, and let
 * the carrier drop the message for not matching a registered template — the exact failure this
 * whole module exists to stop being invisible.
 */
export function msg91FlowConfigured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_TEMPLATE_ID?.trim());
}

export function msg91Configured(): boolean {
  return msg91FlowConfigured() || Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_SENDER_ID?.trim());
}

/** True when *some* gateway can deliver, which is the only question the callers ask. */
export function smsConfigured(): boolean {
  return twilioConfig() !== null || fast2smsConfigured() || msg91Configured();
}

/** Which gateway is doing the sending, for the admin health report. */
export function smsTransportName(): SmsTransport | null {
  if (msg91Configured()) return "msg91";
  if (twilioConfig()) return "twilio";
  if (fast2smsConfigured()) return "fast2sms";
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

/**
 * MSG91 Flow API (v5) — the current way MSG91 sends a transactional SMS in India.
 *
 * Unlike every other sender here it is handed variables rather than a message: the wording lives
 * in a DLT-registered template on the MSG91 panel, and `template_id` selects it. That is what
 * makes the message survive the carrier, and it is also why `SmsMessage.variables` exists.
 *
 * Two details worth keeping. The mobile goes with its country code (`919876543210`), not as the
 * bare ten digits the legacy v2 endpoint and Fast2SMS want. And MSG91 answers 200 with
 * `"type":"error"` for a refused template, so the status alone is not the verdict.
 */
async function msg91FlowSend(
  templateId: string,
  nationalNumber: string,
  variables: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sender = process.env.MSG91_SENDER_ID?.trim();
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: process.env.MSG91_AUTH_KEY?.trim() ?? "",
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        // MSG91 renamed this field from `flow_id` to `template_id` between doc revisions and still
        // takes either. Sending both costs nothing and means the call does not quietly depend on
        // which revision the account happens to be on.
        template_id: templateId,
        flow_id: templateId,
        // Optional: a template already carries its approved sender. Sent when the operator has
        // named one, because an account with several registered senders needs to be told which.
        ...(sender ? { sender } : {}),
        short_url: "0",
        realTimeResponse: "1",
        recipients: [{ mobiles: `91${nationalNumber}`, ...variables }],
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

/** MSG91's legacy v2 endpoint, kept for deployments configured with a sender id and no template. */
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

  // MSG91 leads: it is the gateway this deployment is configured against on purpose, so it should
  // be the one that actually sends. Twilio and Fast2SMS stay behind it as fallbacks, which is what
  // keeps an MSG91 outage costing a retry rather than a locked-out account.
  if (msg91Configured()) {
    const templateId = message.templateId?.trim() || process.env.MSG91_TEMPLATE_ID?.trim() || "";
    attempts.push({
      transport: "msg91",
      send: () =>
        templateId
          ? msg91FlowSend(templateId, national, message.variables ?? {})
          : msg91Send(national, message.body),
    });
  }
  if (config) attempts.push({ transport: "twilio", send: () => twilioSend(config, to, message.body) });
  if (fast2smsConfigured()) attempts.push({ transport: "fast2sms", send: () => fast2smsSend(national, message.body) });

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

/**
 * The reset code as a whole message: the sentence, and the blanks MSG91 renders it from.
 *
 * Recovery is the one flow that must not depend on a single channel, so this is what the
 * forgot-password route sends rather than a bare string. `OTP` and `MIN` are the variable names to
 * register the DLT template with — the template text is `passwordResetSms` above, with those two
 * values replaced by `##OTP##` and `##MIN##`, so what MSG91 renders reads exactly like what every
 * other gateway sends verbatim.
 *
 * MSG91_RESET_TEMPLATE_ID is optional: without it the shared MSG91_TEMPLATE_ID is used, which is
 * the right default for an account that registered one template for everything.
 */
export function passwordResetSmsMessage(code: string, minutes: number): Omit<SmsMessage, "to"> {
  return {
    body: passwordResetSms(code, minutes),
    variables: { OTP: code, MIN: String(minutes) },
    templateId: process.env.MSG91_RESET_TEMPLATE_ID?.trim() || undefined,
  };
}

/** The message sent once a subscription payment has been captured. */
export function subscriptionSms(params: { name: string; plan: string; until: string }): string {
  return `Hi ${params.name}, your StockersAI ${params.plan} subscription is active until ${params.until}. Thank you for subscribing.`;
}
