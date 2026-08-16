"use server";

import { cookies } from "next/headers";
import { isSuperAdminEmail } from "../lib/admin-access";
import {
  blockIp,
  flushSecurityThreatLogs,
  getSecurityThreatReport,
  securityThreatsToCsv,
  type SecurityThreatReport,
} from "../lib/security-threats";
import { findUserById, SESSION_COOKIE, verifyToken, type AppUser } from "../lib/store";

async function requireSuperAdminAction(): Promise<AppUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const id = verifyToken(token);
  const user = id ? await findUserById(id) : null;

  if (!user || !isSuperAdminEmail(user.email)) {
    throw new Error("SUPER_ADMIN access required.");
  }

  return user;
}

export async function fetchSecurityThreatReportAction(): Promise<SecurityThreatReport> {
  await requireSuperAdminAction();
  return getSecurityThreatReport();
}

export async function blockThreatIpAction(ip: string, reason = "Blocked from App Hackers monitor") {
  const user = await requireSuperAdminAction();
  return blockIp(ip, reason, user.id);
}

export async function flushSecurityThreatLogsAction(): Promise<SecurityThreatReport> {
  const user = await requireSuperAdminAction();
  await flushSecurityThreatLogs(user.id);
  return getSecurityThreatReport();
}

export async function exportSecurityThreatCsvAction(): Promise<string> {
  await requireSuperAdminAction();
  const report = await getSecurityThreatReport();
  return securityThreatsToCsv(report.logs);
}
