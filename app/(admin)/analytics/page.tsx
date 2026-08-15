import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Traffic & Usage | Super Admin",
  description: "Daily visitors, sign-ins, sign-ups and AI feature usage across StockersAI.",
  robots: { index: false, follow: false },
};

export default function AdminAnalyticsPage() {
  return <SuperAdminDashboard active="analytics" />;
}
