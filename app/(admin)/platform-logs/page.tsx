import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";
import { requireSuperAdminPage } from "../../lib/super-admin-page-auth";

export const metadata: Metadata = {
  title: "Platform Logs | Super Admin | Stockers",
  description: "Super-admin only platform logs for dashboard usability, APIs, AI, upstream data, billing, security and system operations.",
  robots: { index: false, follow: false },
};

export default async function PlatformLogsPage() {
  await requireSuperAdminPage();
  return <SuperAdminDashboard active="logs" />;
}
