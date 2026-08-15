import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("ipos");

export default function Page() {
  return <DashboardSectionPage slug="ipos" />;
}
