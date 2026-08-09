import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Feature Locks | Super Admin | Stockers",
  description: "Manage Stockers.AI AI feature availability by plan surface.",
  robots: { index: false, follow: false },
};

export default function AdminFeaturesPage() {
  return <SuperAdminDashboard active="features" />;
}
