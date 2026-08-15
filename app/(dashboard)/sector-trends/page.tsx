import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("sector-trends");

export default function Page() {
  return <DashboardSectionPage slug="sector-trends" />;
}
