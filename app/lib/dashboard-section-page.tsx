// One workspace section, as a page. The same shape `./home-section-page` gives the marketing
// sections, and here for the same reason.
//
// This replaced a single `[section]` dynamic route, and the reason is the route group. When the
// sections lived under `/dashboard/*`, a dynamic segment was the obvious way to express eighteen
// pages that differ only by which section is open. `app/(dashboard)` removed the prefix, which put
// that segment at the **root** — where it became the router's last resort for any single-segment
// URL on the site, marketing pages included.
//
// Two things followed, and the second is why this file exists:
//
//   * Under Cache Components an unknown param is answered with an App Shell rather than blocking,
//     so `/not-a-section` returned **200** carrying the not-found body. Right page, wrong status,
//     for every typo and every crawler probe.
//   * `dynamicParams = false`, which is the usual fix, is rejected outright by `cacheComponents`.
//
// Eighteen real folders have neither problem: each section is a static route that prerenders, and
// a URL that is not one of them matches nothing and gets a genuine 404 from the router. The three
// lines of boilerplate per section buy a correct status code on every wrong URL on the site.

import type { Metadata } from "next";
import { DashboardClient } from "../components/dashboard-client";
import type { DashboardSectionId } from "../components/dashboard-sidebar";
import { dashboardSectionRouteFromSlug } from "./section-routes";
import { pageMetadata } from "./seo";

/**
 * The route behind a slug, or a thrown error.
 *
 * Throwing rather than falling back: every caller is a page file naming a slug as a literal, so an
 * unknown one is a typo in this repository rather than anything a reader can cause. Failing the
 * build is the right response to it — the alternative is a section that silently renders the wrong
 * panel. Mirrors `getHomeSection` in ./home-section-page.
 */
function getSection(slug: string) {
  const route = dashboardSectionRouteFromSlug(slug);
  if (!route) {
    throw new Error(`Unknown dashboard section: ${slug}`);
  }
  return route;
}

export function dashboardSectionMetadata(slug: string): Metadata {
  const route = getSection(slug);

  return pageMetadata({
    title: route.title,
    description: route.description,
    path: route.path,
    // The workspace is behind a sign-in; there is nothing here for an index to hold.
    indexable: false,
  });
}

export default function DashboardSectionPage({ slug }: { slug: string }) {
  return <DashboardClient initialSection={getSection(slug).id as DashboardSectionId} />;
}
