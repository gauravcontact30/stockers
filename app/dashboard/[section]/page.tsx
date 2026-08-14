import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardClient } from "../../components/dashboard-client";
import {
  DASHBOARD_SECTION_ROUTES,
  dashboardSectionRouteFromSlug,
  type DashboardSectionRoute,
} from "../../lib/section-routes";
import { pageMetadata } from "../../lib/seo";
import type { DashboardSectionId } from "../../components/dashboard-sidebar";

type Props = {
  params: Promise<{ section: string }>;
};

export function generateStaticParams() {
  return DASHBOARD_SECTION_ROUTES.filter((route) => route.slug).map((route) => ({ section: route.slug }));
}

function routeMetadata(route: DashboardSectionRoute): Metadata {
  return pageMetadata({
    title: route.title,
    description: route.description,
    path: route.path,
    indexable: false,
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const route = dashboardSectionRouteFromSlug(section);

  if (!route) {
    return routeMetadata(DASHBOARD_SECTION_ROUTES[0]);
  }

  return routeMetadata(route);
}

export default async function DashboardSectionPage({ params }: Props) {
  const { section } = await params;
  const route = dashboardSectionRouteFromSlug(section);

  if (!route) {
    notFound();
  }

  return <DashboardClient initialSection={route.id as DashboardSectionId} />;
}
