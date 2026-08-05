import { NextResponse } from "next/server";
import { authenticateUser, createToken } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
      token: createToken(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Signin failed. Please try again." }, { status: 500 });
  }
}
