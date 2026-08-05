import { NextResponse } from "next/server";
import { createToken, createUser } from "../../../lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, plan = "Starter" } = body as {
      name?: string;
      email?: string;
      password?: string;
      plan?: "Starter" | "Pro";
    };

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Please provide your name, email, and password." },
        { status: 400 }
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const user = await createUser({ name, email, password, plan: plan === "Pro" ? "Pro" : "Starter" });
    if (!user) {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
      token: createToken(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
