import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("intelligence-search");

export default function Page() {
  return <DashboardSectionPage slug="intelligence-search" />;
}
