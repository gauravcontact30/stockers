import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("most-traded");

export default function Page() {
  return <DashboardSectionPage slug="most-traded" />;
}
