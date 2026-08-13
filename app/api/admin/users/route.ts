import { NextResponse } from "next/server";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "../../../lib/admin-access";
import { deleteUser, findUserById, listUsers, updateUser, userFromRequest, type AppUser, type AdminUserView } from "../../../lib/store";
import { renewedUntil, SUBSCRIPTION_DAYS } from "../../../lib/subscription";
import { todayIST } from "../../../lib/nse-client";

export const dynamic = "force-dynamic";
export { SUPER_ADMIN_EMAIL };

/**
 * Managing the people who have signed up.
 *
 * Every handler re-checks the caller's role on the server. The dashboard hides itself from
 * non-admins, but that is presentation: the check that actually matters is this one, because these
 * routes can be called directly.
 */
async function requireAdmin(request: Request): Promise<AppUser | null> {
  const user = await userFromRequest(request);
  return user && (user.role === "admin" || isSuperAdminEmail(user.email)) ? user : null;
}

function isSuperAdmin(user: AppUser): boolean {
  return isSuperAdminEmail(user.email);
}

/**
 * Built per call, never shared.
 *
 * A NextResponse carries a body stream that can only be read once, so a single module-level
 * instance answered the first caller correctly and handed every caller after that a 403 with an
 * empty body — the client then showed its generic failure text instead of the real reason.
 */
const forbidden = () => NextResponse.json({ error: "Admin access required." }, { status: 403 });

function summaryFor(users: AdminUserView[], today: string) {
  return {
    total: users.length,
    verified: users.filter((user) => user.emailVerified).length,
    subscribed: users.filter((user) => user.subscribedUntil && user.subscribedUntil >= today).length,
    admins: users.filter((user) => user.role === "admin").length,
    pro: users.filter((user) => user.plan === "Pro").length,
    elite: users.filter((user) => user.plan === "Elite").length,
  };
}

async function rosterResponse(admin: AppUser, extra: Record<string, unknown> = {}) {
  const users = await listUsers();
  const today = todayIST();
  return NextResponse.json({
    ...extra,
    users,
    summary: summaryFor(users, today),
    today,
    permissions: { canDeleteUsers: isSuperAdmin(admin) },
  });
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  return rosterResponse(admin);
}

/** The fields an admin is allowed to change, and nothing else. */
type Patch = {
  id?: unknown;
  plan?: unknown;
  role?: unknown;
  emailVerified?: unknown;
  /** "grant" adds a subscription period from today; "revoke" clears it. */
  subscription?: unknown;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: Patch;
  try {
    body = (await request.json()) as Patch;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id, plan, role, emailVerified, subscription } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "A user id is required." }, { status: 400 });
  }

  // An admin removing their own admin rights would be locked out of this page immediately, with no
  // way back in short of editing the data file by hand. Refused rather than warned about.
  if (id === admin.id && role === "user") {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  }

  const patch: Partial<AppUser> = {};

  if (plan === "Starter" || plan === "Pro" || plan === "Elite") patch.plan = plan;
  // "" is the no-plan state the select offers, for undoing a plan granted by mistake. Distinct
  // from the field being absent, which means this request is not about the plan at all.
  else if (plan === "") patch.plan = null;
  if (role === "admin" || role === "user") patch.role = role;

  if (emailVerified === true || emailVerified === false) {
    // Marking someone verified by hand is for the case where the mail genuinely cannot reach them;
    // clearing it puts them back to unconfirmed.
    patch.emailVerifiedAt = emailVerified ? new Date().toISOString() : null;
  }

  if (subscription === "grant") {
    const current = (await listUsers()).find((user) => user.id === id)?.subscribedUntil ?? null;
    patch.subscribedUntil = renewedUntil(current, todayIST(), SUBSCRIPTION_DAYS);
  } else if (subscription === "revoke") {
    patch.subscribedUntil = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const updated = await updateUser(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  return rosterResponse(admin, { ok: true });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: "Only the super admin can delete users." }, { status: 403 });
  }

  let body: { id?: unknown } = {};
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    body = {};
  }

  const id = typeof body.id === "string" ? body.id : new URL(request.url).searchParams.get("id");
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "A user id is required." }, { status: 400 });
  }

  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json({ error: "No such user." }, { status: 404 });
  }

  if (isSuperAdminEmail(target.email)) {
    return NextResponse.json({ error: "The super admin account cannot be deleted." }, { status: 400 });
  }

  await deleteUser(id);
  return rosterResponse(admin, { ok: true });
}
