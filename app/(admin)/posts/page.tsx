import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Blog Posts | Super Admin | Stockers",
  description: "Write, approve and publish posts for the StockersAI blog.",
  robots: { index: false, follow: false },
};

export default function AdminBlogPage() {
  return <SuperAdminDashboard active="blog" />;
}
