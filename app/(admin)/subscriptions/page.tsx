import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Subscription Users | Super Admin | Stockers",
  description: "Manage StockersAI subscription users, plan tiers and paid access windows.",
  robots: { index: false, follow: false },
};

export default function AdminSubscriptionsPage() {
  return <SuperAdminDashboard active="subscriptions" />;
}
