import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("stocks-in-news");

export default function Page() {
  return <DashboardSectionPage slug="stocks-in-news" />;
}
