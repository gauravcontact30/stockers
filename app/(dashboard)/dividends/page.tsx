import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("dividends");

export default function Page() {
  return <DashboardSectionPage slug="dividends" />;
}
