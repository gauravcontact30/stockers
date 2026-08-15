import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("stock-research");

export default function Page() {
  return <DashboardSectionPage slug="stock-research" />;
}
