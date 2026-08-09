import type { Metadata } from "next";
import { SuperAdminDashboard } from "../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Super Admin | Stockers",
  description: "Manage StockersAI accounts, subscriptions, feature locks and application operations.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <SuperAdminDashboard active="overview" />;
}
