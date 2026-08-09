import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Application Users | Super Admin | Stockers",
  description: "Manage Stockers.AI application users, verification, plans and admin roles.",
  robots: { index: false, follow: false },
};

export default function AdminUsersPage() {
  return <SuperAdminDashboard active="users" />;
}
