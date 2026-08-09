import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Cache Control | Super Admin | Stockers",
  description: "Revalidate StockersAI market, AI and news cache families.",
  robots: { index: false, follow: false },
};

export default function AdminCachePage() {
  return <SuperAdminDashboard active="cache" />;
}
