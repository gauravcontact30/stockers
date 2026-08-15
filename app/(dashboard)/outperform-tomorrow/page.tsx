import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("outperform-tomorrow");

export default function Page() {
  return <DashboardSectionPage slug="outperform-tomorrow" />;
}
