import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("portfolio");

export default function Page() {
  return <DashboardSectionPage slug="portfolio" />;
}
