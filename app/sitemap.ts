import type { MetadataRoute } from "next";
import { absoluteUrl } from "./lib/seo";

/**
 * The list of pages worth indexing, served at `/sitemap.xml`.
 *
 * A sitemap does not make a page rank. What it does is tell a crawler a page exists without waiting
 * for it to be found by following links, and give it a date to decide whether re-crawling is worth
 * the trip. That second part is the reason `lastModified` below is not `new Date()` for everything:
 * a sitemap that claims every page changed at the moment it was requested is a sitemap whose dates
 * carry no information, and crawlers learn to ignore them. Each entry states when that page's
 * content actually moves.
 *
 * Eight URLs, listed by hand rather than by walking the `app` directory. The directory also holds
 * eight admin routes and every API handler, and a filesystem walk would have to be taught to
 * exclude them — a rule that fails silently the first time somebody adds a route it does not know
 * about. The cost of the explicit list is remembering to add a page to it; the cost of the clever
 * version is quietly publishing the admin dashboard's URL.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // The boards on these pages re-read the exchange continuously, so "last modified" for them is
  // the deploy, not a content edit. Build time is the honest answer.
  const built = new Date();

  /** The legal pages carry their own revision date in `lib/policy`; they change when it does. */
  const policyUpdated = new Date("2026-08-09");

  return [
    {
      url: absoluteUrl("/"),
      lastModified: built,
      // Every board on it re-reads the session. There is genuinely something new here daily.
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/news"),
      lastModified: built,
      // Headlines, pulled live. Nothing on this site turns over faster.
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: policyUpdated,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/contact"),
      lastModified: policyUpdated,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // The four legal pages. Low priority is not a judgement on how important they are — priority is
    // read as a hint about crawl order within this site, and a policy page that changes twice a year
    // should not be re-crawled ahead of the board that changed this morning.
    {
      url: absoluteUrl("/privacy-policy"),
      lastModified: policyUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/disclaimer"),
      lastModified: policyUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/refund-policy"),
      lastModified: policyUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/return-policy"),
      lastModified: policyUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
