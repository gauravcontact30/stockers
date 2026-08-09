import { NextResponse } from "next/server";
import { appOrigin, sendMail, verificationEmail } from "../../../lib/mailer";
import { refreshVerificationToken, userFromRequest, verifyEmailToken } from "../../../lib/store";

export const dynamic = "force-dynamic";

/**
 * The link in the welcome mail.
 *
 * This is opened by a person in a browser, not by script, so it answers with a redirect to a page
 * they can read rather than JSON. The outcome rides in the query string; /signin renders it.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const user = await verifyEmailToken(token);

  // An unknown token is either a forgery or a link that has already been spent. Both are reported
  // the same way — the second is not an error worth alarming anyone about, and distinguishing them
  // would mean keeping spent tokens around to compare against.
  const outcome = user ? "verified" : "invalid";
  return NextResponse.redirect(`${appOrigin()}/signin?verify=${outcome}`);
}

/**
 * Sends the verification mail again, for the signed-in owner of the account.
 *
 * Deliberately not addressable by email in the body: that would let anyone spray verification mail
 * at an address they do not control. The caller must already hold a session for the account.
 */
export async function POST(request: Request) {
  const caller = await userFromRequest(request);
  if (!caller) {
    return NextResponse.json({ error: "Sign in to resend the verification email." }, { status: 401 });
  }

  if (caller.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const issued = await refreshVerificationToken(caller.id);
  if (!issued) {
    return NextResponse.json({ error: "Could not issue a new verification link." }, { status: 400 });
  }

  const verifyUrl = `${appOrigin()}/api/auth/verify?token=${issued.token}`;
  const delivery = await sendMail({
    to: issued.user.email,
    ...verificationEmail({ name: issued.user.name, verifyUrl }),
  });

  if (!delivery.ok) {
    return NextResponse.json({ error: "Couldn't send the email just now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent: delivery.transport === "resend" });
}
