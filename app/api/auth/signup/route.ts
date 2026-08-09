import { NextResponse } from "next/server";
import { firstError, normaliseMobile, validateSignup, type SignupFields } from "../../../lib/auth-validation";
import { appOrigin, sendMail, verificationEmail } from "../../../lib/mailer";
import { sendSms, welcomeSms } from "../../../lib/sms";
import { createToken, createUser, updateUser } from "../../../lib/store";

/** Whatever arrived, as strings, so the shared validator can judge it rather than the parser. */
function fieldsFrom(body: unknown): SignupFields {
  const raw = body as Partial<Record<keyof SignupFields, unknown>> | null | undefined;
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    name: text(raw?.name),
    email: text(raw?.email),
    mobile: text(raw?.mobile),
    password: text(raw?.password),
    // A caller that sends only a password is confirming it by definition; the browser form always
    // sends both, and the server's job is to check the rules, not to insist on the form's shape.
    confirmPassword: raw?.confirmPassword === undefined ? text(raw?.password) : text(raw?.confirmPassword),
  };
}

export async function POST(request: Request) {
  try {
    const fields = fieldsFrom(await request.json());

    /**
     * Validated against the same rules the form uses, not a looser copy.
     *
     * The errors go back field by field as well as in a single sentence, so a form can mark the
     * offending input rather than only printing a message under the button — and so a caller that
     * is not our form still gets something it can act on.
     */
    const errors = validateSignup(fields);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: firstError(errors), errors }, { status: 400 });
    }

    const user = await createUser({
      name: fields.name,
      email: fields.email,
      password: fields.password,
      // Everyone starts on the free trial. A plan is chosen at checkout, where its price and what
      // it buys are both on screen — not on a form before they have seen a single board.
      plan: "Starter",
      mobile: normaliseMobile(fields.mobile),
    });

    if (!user) {
      return NextResponse.json(
        { error: "An account already exists for this email.", errors: { email: "This email is already registered." } },
        { status: 409 },
      );
    }

    // The account exists and the session below is valid whether or not this mail goes out. A
    // provider outage must not turn a successful sign-up into an error the visitor has to retry —
    // and retrying would fail anyway, because the address is now taken. So the result is reported
    // alongside the session rather than thrown, and the address can be confirmed later.
    const verifyUrl = `${appOrigin()}/api/auth/verify?token=${user.verificationToken}`;

    // Both go out together — neither waits on the other, and neither can fail the sign-up. The SMS
    // is sent to the number just registered; `sendSms` degrades to a local outbox when no gateway
    // is configured, exactly as the mailer does.
    const [delivery, text] = await Promise.all([
      sendMail({ to: user.email, ...verificationEmail({ name: user.name, verifyUrl }) }),
      user.mobile ? sendSms({ to: user.mobile, body: welcomeSms(user.name) }) : Promise.resolve(null),
    ]);

    if (delivery.ok) {
      await updateUser(user.id, { verificationSentAt: new Date().toISOString() });
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, mobile: user.mobile ?? null },
      token: createToken(user),
      // Lets the sign-up page say "check your inbox" only when something was really sent.
      verificationEmailSent: delivery.ok && delivery.transport === "resend",
      // Lets the page say "we've texted you" only when a gateway really accepted it.
      welcomeSmsSent: text?.ok === true && text.transport === "twilio",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
