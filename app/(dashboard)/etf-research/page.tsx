import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("etf-research");

export default function Page() {
  return <DashboardSectionPage slug="etf-research" />;
}
