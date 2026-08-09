import { NextResponse } from "next/server";
import { firstError, validateSignin } from "../../../lib/auth-validation";
import { authenticateUser, createToken } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    /**
     * Only shape is checked here, not strength.
     *
     * An account created under an older, looser password policy still has a valid password, and
     * refusing to let its owner type it would lock them out of an account they own. Whether the
     * pair is right is `authenticateUser`'s business.
     */
    const errors = validateSignin({ email, password });
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: firstError(errors), errors }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      /**
       * One message for a wrong address and a wrong password alike.
       *
       * Saying which was wrong tells anyone who asks whether a given email has an account here,
       * which is both a privacy leak and the first step of a credential-stuffing run. The error is
       * attached to both fields so the form marks them without claiming which one is at fault.
       */
      return NextResponse.json(
        { error: "Invalid email or password.", errors: { email: " ", password: "Invalid email or password." } },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, mobile: user.mobile ?? null },
      token: createToken(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Signin failed. Please try again." }, { status: 500 });
  }
}
