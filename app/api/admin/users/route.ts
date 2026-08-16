import { NextResponse } from "next/server";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "../../../lib/admin-access";
import { logAuditEvent, logSecurityEvent } from "../../../lib/application-logger";
import { appOrigin, passwordResetEmail, sendMail } from "../../../lib/mailer";
import {
  deleteUser,
  findUserById,
  issuePasswordResetToken,
  listUsers,
  updateUser,
  userFromRequest,
  type AppUser,
  type AdminUserView,
} from "../../../lib/store";
import { renewedUntil, SUBSCRIPTION_DAYS, TRIAL_DAYS } from "../../../lib/subscription";
import { todayIST } from "../../../lib/nse-client";

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
    permissions: {
      canDeleteUsers: isSuperAdmin(admin),
      canSendPasswordReset: isSuperAdmin(admin),
      canGrantFreeTrial: isSuperAdmin(admin),
    },
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
  /** "send" emails a password reset link to the selected user. Super Admin only. */
  passwordReset?: unknown;
  /** "grant5d" restarts the free trial clock for the selected user. Super Admin only. */
  freeTrial?: unknown;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();
  const path = new URL(request.url).pathname;

  let body: Patch;
  try {
    body = (await request.json()) as Patch;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id, plan, role, emailVerified, subscription, passwordReset, freeTrial } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "A user id is required." }, { status: 400 });
  }

  if (passwordReset === "send") {
    if (!isSuperAdmin(admin)) {
      logSecurityEvent({
        level: "warn",
        useCase: "Security & Access: password recovery administration",
        operation: "password_reset.admin.denied",
        message: "Admin without super-admin rights attempted to send a password reset link.",
        userId: admin.id,
        statusCode: 403,
        path,
        method: request.method,
        metadata: { targetUserId: id, role: admin.role ?? null },
      });
      return NextResponse.json({ error: "Only the super admin can send password reset links." }, { status: 403 });
    }

    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json({ error: "No such user." }, { status: 404 });
    }

    const issued = await issuePasswordResetToken(target.email);
    if (!issued) {
      return NextResponse.json({ error: "Unable to create a reset link for that account." }, { status: 500 });
    }

    const resetUrl = `${appOrigin()}/signin?reset=${issued.token}`;
    const mail = await sendMail({ to: issued.user.email, ...passwordResetEmail({ name: issued.user.name, resetUrl }) });

    logAuditEvent({
      useCase: "User account administration",
      operation: "password_reset.admin_sent",
      message: "Super admin sent a password reset link.",
      userId: admin.id,
      statusCode: 200,
      path,
      method: request.method,
      metadata: {
        targetUserId: issued.user.id,
        targetEmail: issued.user.email,
        mailTransport: mail.transport,
        mailDelivered: mail.ok,
      },
    });

    return rosterResponse(admin, {
      ok: true,
      message: `Password reset link sent to ${issued.user.email}.`,
      mailTransport: mail.transport,
    });
  }

  if (freeTrial === "grant5d") {
    if (!isSuperAdmin(admin)) {
      logSecurityEvent({
        level: "warn",
        useCase: "Security & Access: trial administration",
        operation: "free_trial.admin.denied",
        message: "Admin without super-admin rights attempted to grant a free trial.",
        userId: admin.id,
        statusCode: 403,
        path,
        method: request.method,
        metadata: { targetUserId: id, role: admin.role ?? null },
      });
      return NextResponse.json({ error: "Only the super admin can grant a 5-day free trial." }, { status: 403 });
    }

    const updated = await updateUser(id, { trialStartedAt: new Date().toISOString() });
    if (!updated) {
      return NextResponse.json({ error: "No such user." }, { status: 404 });
    }

    logAuditEvent({
      useCase: "User account administration",
      operation: "free_trial.grant5d",
      message: "Super admin granted a 5-day free trial.",
      userId: admin.id,
      statusCode: 200,
      path,
      method: request.method,
      metadata: { targetUserId: updated.id, targetEmail: updated.email, trialDays: TRIAL_DAYS },
    });

    return rosterResponse(admin, {
      ok: true,
      message: `${TRIAL_DAYS}-day free trial approved for ${updated.email}.`,
    });
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
  logAuditEvent({
    useCase: "User account administration",
    operation: "user.update",
    message: "Admin updated a user account.",
    userId: admin.id,
    statusCode: 200,
    path,
    method: request.method,
    metadata: {
      targetUserId: updated.id,
      changedFields: Object.keys(patch),
      planChanged: Object.prototype.hasOwnProperty.call(patch, "plan"),
      roleChanged: Object.prototype.hasOwnProperty.call(patch, "role"),
      subscriptionChanged: Object.prototype.hasOwnProperty.call(patch, "subscribedUntil"),
      emailVerificationChanged: Object.prototype.hasOwnProperty.call(patch, "emailVerifiedAt"),
    },
  });

  return rosterResponse(admin, { ok: true });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();
  const path = new URL(request.url).pathname;

  if (!isSuperAdmin(admin)) {
    logSecurityEvent({
      level: "warn",
      useCase: "Security & Access: user deletion access",
      operation: "user.delete.denied",
      message: "Admin without super-admin rights attempted to delete a user.",
      userId: admin.id,
      statusCode: 403,
      path,
      method: request.method,
      metadata: { role: admin.role ?? null },
    });
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
  logAuditEvent({
    useCase: "User account administration",
    operation: "user.delete",
    message: "Super admin deleted a user account.",
    userId: admin.id,
    statusCode: 200,
    path,
    method: request.method,
    metadata: { targetUserId: id },
  });
  return rosterResponse(admin, { ok: true });
}
