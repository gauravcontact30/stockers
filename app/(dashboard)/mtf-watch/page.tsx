import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("mtf-watch");

export default function Page() {
  return <DashboardSectionPage slug="mtf-watch" />;
}
