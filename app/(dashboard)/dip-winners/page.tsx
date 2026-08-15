import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("dip-winners");

export default function Page() {
  return <DashboardSectionPage slug="dip-winners" />;
}
