import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Client Reviews | Super Admin | Stockers",
  description: "Upload and manage StockersAI landing page client reviews.",
  robots: { index: false, follow: false },
};

export default function AdminReviewsPage() {
  return <SuperAdminDashboard active="reviews" />;
}
