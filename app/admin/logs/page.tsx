import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Platform Logs | Super Admin | Stockers",
  description: "StockersAI operational logs for dashboard usage, APIs, AI, data feeds, billing and security.",
  robots: { index: false, follow: false },
};

export default function AdminLogsPage() {
  return <SuperAdminDashboard active="logs" />;
}
