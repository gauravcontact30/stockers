import type { Metadata } from "next";
import Home from "../page";
import { HOME_SECTION_ROUTES, type HomeSectionId } from "./section-routes";
import { pageMetadata } from "./seo";

function getHomeSection(id: HomeSectionId) {
  const route = HOME_SECTION_ROUTES.find((item) => item.id === id);
  if (!route) {
    throw new Error(`Unknown home section: ${id}`);
  }
  return route;
}

export function homeSectionMetadata(id: HomeSectionId): Metadata {
  const route = getHomeSection(id);

  return pageMetadata({
    title: route.title,
    description: route.description,
    path: route.path,
    keywords: [route.title, route.label, ...route.keywords],
  });
}

export default function HomeSectionPage({ id }: { id: HomeSectionId }) {
  const route = getHomeSection(id);

  return (
    <Home
      sectionId={route.id}
      seo={{
        name: route.title,
        description: route.description,
        path: route.path,
      }}
    />
  );
}
