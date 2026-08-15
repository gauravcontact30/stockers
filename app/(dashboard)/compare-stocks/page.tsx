import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("compare-stocks");

export default function Page() {
  return <DashboardSectionPage slug="compare-stocks" />;
}
