import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "AI Operations | Super Admin | Stockers",
  description: "StockersAI model spend, latency and fallback rate across every AI research surface.",
  robots: { index: false, follow: false },
};

export default function AdminAiPage() {
  return <SuperAdminDashboard active="ai" />;
}
