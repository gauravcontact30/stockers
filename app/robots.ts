import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "./lib/seo";

/**
 * What crawlers are allowed to walk.
 *
 * Served at `/robots.txt`. Two things are worth being clear about, because both are routinely got
 * wrong in the opposite direction:
 *
 * `robots.txt` is a *crawl* instruction, not an *index* instruction. A disallowed URL can still be
 * indexed — from a link elsewhere — and will then appear in results with no snippet, because the
 * crawler was forbidden from fetching the page it would have written the snippet from. So the pages
 * that must not rank (`/signin`, `/signup`, every `/admin` route) carry a `noindex` meta tag of
 * their own and are *not* blocked here: the crawler has to be allowed to fetch a page to read the
 * `noindex` on it. Blocking them here would be the one thing that guarantees the tag is never seen.
 *
 * What is blocked is what has no page behind it at all. `/api` returns JSON; a crawler fetching it
 * learns nothing and spends this site's crawl budget doing it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // JSON, not documents. Nothing here belongs in an index.
          "/api/",
          // Behind an admin gate — a crawler gets a redirect or a refusal, never the dashboard.
          "/admin",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    // Names the origin this site is served from, for the crawlers that honour it, and matches the
    // canonical tags rather than leaving the choice of hostname to whichever one was linked.
    host: siteUrl(),
  };
}
