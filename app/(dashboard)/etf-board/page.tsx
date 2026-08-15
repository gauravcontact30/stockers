import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("etf-board");

export default function Page() {
  return <DashboardSectionPage slug="etf-board" />;
}
