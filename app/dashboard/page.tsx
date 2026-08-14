import type { Metadata } from "next";
import { DashboardClient } from "../components/dashboard-client";
import { DASHBOARD_SECTION_ROUTES } from "../lib/section-routes";
import { pageMetadata } from "../lib/seo";

const overviewRoute = DASHBOARD_SECTION_ROUTES[0];

export const metadata: Metadata = pageMetadata({
  title: overviewRoute.title,
  description: overviewRoute.description,
  path: overviewRoute.path,
  indexable: false,
});

export default function DashboardPage() {
  return <DashboardClient />;
}
