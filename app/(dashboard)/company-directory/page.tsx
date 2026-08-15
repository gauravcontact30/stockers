import DashboardSectionPage, { dashboardSectionMetadata } from "../../lib/dashboard-section-page";

export const metadata = dashboardSectionMetadata("company-directory");

export default function Page() {
  return <DashboardSectionPage slug="company-directory" />;
}
