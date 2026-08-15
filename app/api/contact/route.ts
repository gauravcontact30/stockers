import { NextResponse } from "next/server";
import { parseEnquiry, withinRateLimit, type Topic } from "../../lib/contact";
import { enquiryEmail, sendMail } from "../../lib/mailer";
import { CONTACT } from "../../lib/policy";

/**
 * The contact form's back end.
 *
 * A public endpoint that sends mail is a spam relay unless it is treated as one from the start, so
 * three things are true of every request: the payload is validated and clamped before it is used, a
 * hidden field catches the bots that fill in everything they find, and one sender is held to a few
 * messages an hour. Those rules live in `../../lib/contact`, which the form shares.
 *
 * The visitor's address is never used as the envelope sender — that would fail authentication on
 * our own sending domain. It goes in the body, and the reply happens from the mail client.
 */

/** Where each topic is routed. Privacy has its own inbox, because the policy promises one. */
const ROUTING: Record<Topic, string> = {
  Support: CONTACT.support,
  Billing: CONTACT.support,
  Privacy: CONTACT.privacy,
  Partnership: CONTACT.support,
  Other: CONTACT.support,
};

export async function POST(request: Request) {
  const parsed = parseEnquiry(await request.json().catch(() => null));

  if ("error" in parsed) {
    // A caught bot is told the same thing a person is told on success, and nothing is sent — so a
    // crawler cannot learn which of its fields gave it away.
    if (parsed.honeypot) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!withinRateLimit(parsed.enquiry.email.toLowerCase())) {
    return NextResponse.json(
      { error: "That's a few messages in a short time. Please email us directly instead." },
      { status: 429 },
    );
  }

  const result = await sendMail({ to: ROUTING[parsed.enquiry.topic], ...enquiryEmail(parsed.enquiry) });

  // `sendMail` never throws, and records to a local outbox when no mail key is configured. Either
  // way the enquiry is kept, so the visitor is told it was received rather than being asked to
  // retry into a system that has already accepted it.
  return NextResponse.json({ ok: true, delivered: result.transport === "resend" });
}
