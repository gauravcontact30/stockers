import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClientReview, deleteClientReview, listClientReviews } from "../../../lib/client-reviews";
import { userFromRequest } from "../../../lib/store";

async function requireAdmin(request: Request) {
  const user = await userFromRequest(request);
  return user && user.role === "admin" ? user : null;
}

const forbidden = () => NextResponse.json({ error: "Admin access required." }, { status: 403 });

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  return NextResponse.json({ reviews: await listClientReviews() });
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();

  try {
    const review = await createClientReview(await request.formData());
    revalidatePath("/");
    return NextResponse.json({ ok: true, review, reviews: await listClientReviews() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save client review." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "A review id is required." }, { status: 400 });
  }

  const deleted = await deleteClientReview(body.id);
  if (!deleted) return NextResponse.json({ error: "No uploaded review matched that id." }, { status: 404 });

  revalidatePath("/");
  return NextResponse.json({ ok: true, reviews: await listClientReviews() });
}
