import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("top-picks");

export default function Page() {
  return <DashboardSectionPage slug="top-picks" />;
}
