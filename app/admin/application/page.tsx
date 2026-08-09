import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Application | Super Admin | Stockers",
  description: "Review Stockers.AI operational links and current admin session.",
  robots: { index: false, follow: false },
};

export default function AdminApplicationPage() {
  return <SuperAdminDashboard active="application" />;
}
