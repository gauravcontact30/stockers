import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSuperAdminEmail } from "./admin-access";
import { findUserById, SESSION_COOKIE, verifyToken } from "./store";

export async function requireSuperAdminPage(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const id = verifyToken(token);
  const user = id ? await findUserById(id) : null;

  if (!user || !isSuperAdminEmail(user.email)) {
    redirect("/overview");
  }
}
