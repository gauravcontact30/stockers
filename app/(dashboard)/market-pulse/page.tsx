import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("market-pulse");

export default function Page() {
  return <DashboardSectionPage slug="market-pulse" />;
}
