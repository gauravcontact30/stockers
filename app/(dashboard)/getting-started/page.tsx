import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("getting-started");

export default function Page() {
  return <DashboardSectionPage slug="getting-started" />;
}
