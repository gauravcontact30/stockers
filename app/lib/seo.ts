import type { Metadata } from "next";
import { COMPANY, CONTACT } from "./policy";
import { PLAN_LABEL, PLAN_MONTHLY, type PlanKey } from "./subscription-pricing";

/**
 * Everything the search engines and the social scrapers are told about this site.
 *
 * One module rather than a `metadata` block copied into nineteen pages, because the parts that go
 * wrong in SEO are the parts that drift: a canonical URL that still points at localhost, a page
 * whose Open Graph title says something the `<title>` no longer says, a description rewritten on
 * one page and not the two that quote it. Everything below is derived from a single public origin
 * and a single site name, so a page can only state a title, a description and its own path.
 *
 * ---------------------------------------------------------------------------
 * Why the origin is fixed
 * ---------------------------------------------------------------------------
 *
 * A canonical URL is the address this page is *the* copy at. It should not be decided from a
 * request host or a preview deployment variable, because every alternate host must still point to
 * the production site or it competes with the real site in the index.
 */

export const SITE_NAME = COMPANY.brand;

/** The suffix every page title carries, and the fallback for a page that sets none. */
export const SITE_TITLE = `${SITE_NAME} — AI stock research for Indian markets`;

/**
 * The site-level description.
 *
 * Written to the ~155 characters a result snippet shows before it is cut, and written to say what
 * a reader gets rather than what the technology is. "AI-powered platform" describes the build;
 * "every gainer and loser on the BSE" describes the page.
 */
export const SITE_DESCRIPTION =
  "AI research on Indian equities: every BSE gainer and loser, shareholding by promoter and government, market news sentiment, and measured returns across every window.";

/** Open Graph wants an underscored locale; the `<html lang>` attribute wants the hyphenated one. */
export const OG_LOCALE = "en_IN";
export const HTML_LANG = "en-IN";
export const CANONICAL_ORIGIN = "https://www.stockersai.com";

/** The whole public surface, in the order a sitemap should list it. Admin and API are not here. */
export const PUBLIC_ROUTES = [
  "/",
  "/news",
  "/about",
  "/contact",
  "/privacy-policy",
  "/disclaimer",
  "/refund-policy",
  "/return-policy",
] as const;

export const SITE_KEYWORDS = [
  "AI stock research India",
  "Indian stock market research",
  "BSE gainers and losers",
  "Indian equity research",
  "stock market sentiment India",
  "BSE market data",
  "AI investing tools",
];

export function siteUrl(): string {
  return CANONICAL_ORIGIN;
}

/**
 * A path resolved against the site's origin.
 *
 * `"/"` deliberately produces the bare origin with no trailing slash rather than `https://site/`.
 * The two are the same page to a browser and two different URLs to a crawler, so a canonical tag
 * has to pick one and every other reference to the home page here has to agree with it.
 */
export function absoluteUrl(path: string): string {
  const origin = siteUrl();
  if (path === "" || path === "/") return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The crawl directives for a page that should rank.
 *
 * The `googleBot` block is not redundant with `index`/`follow`. Google's defaults cap a text
 * snippet, forbid a large image preview in Discover, and shorten video previews; the three `-1`
 * and `large` values lift those caps. Without them a page can be indexed perfectly and still be
 * shown as a thumbnail-and-one-line result.
 */
const INDEXABLE: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
    "max-video-preview": -1,
  },
};

/**
 * The directives for a page that must not rank but whose links should still be followed.
 *
 * Sign-in and sign-up are the cases. They carry no content anybody searches for, and left indexable
 * they compete with the pages that do — a query for the brand that returns the login form is a
 * worse result than the same query returning the home page. `follow` stays on so the crawler still
 * walks the footer out of them.
 */
const UNLISTED: Metadata["robots"] = { index: false, follow: true };

export type PageSeo = {
  /** The bare page name. The root layout's template appends the site name — do not repeat it here. */
  title: string;
  description: string;
  /** Path from the site root, e.g. `/news`. Becomes the canonical URL and the `og:url`. */
  path: string;
  /** Defaults to true. False emits `noindex, follow`. */
  indexable?: boolean;
  /** Defaults to `website`. */
  ogType?: "website" | "article";
  keywords?: string[];
};

/**
 * One page's metadata: title, description, canonical, Open Graph and the Twitter card.
 *
 * The canonical link is the load-bearing part and the reason this is a function rather than a
 * convention. Every board on this site takes its state from the query string — `?tier=small&page=9`
 * and so on — and a crawler that follows those produces dozens of URLs serving one page's content.
 * Left alone, the ranking is split across all of them and none of them wins. A canonical pointing
 * at the clean path collapses them back into one.
 *
 * Open Graph and Twitter both restate the title and description rather than inheriting them,
 * because the scrapers do not read `<title>` — a page with only `<title>` set shares as a bare URL.
 * The card image itself comes from `app/opengraph-image.tsx` and is inherited, so no page needs to
 * name one.
 */
export function pageMetadata({
  title,
  description,
  path,
  indexable = true,
  ogType = "website",
  keywords,
}: PageSeo): Metadata {
  const url = absoluteUrl(path);
  const image = absoluteUrl("/opengraph-image");

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: url,
      languages: {
        "en-IN": url,
      },
    },
    robots: indexable ? INDEXABLE : UNLISTED,
    openGraph: {
      type: ogType,
      url,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      // The template is not applied to Open Graph titles, so this one spells the brand out. A share
      // card reading "Market news" with no attribution is a card nobody clicks.
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} - AI stock research for Indian markets`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [absoluteUrl("/twitter-image")],
    },
  };
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------
//
// JSON-LD, which is the format Google actually documents support for. Each builder below returns a
// plain object; `<JsonLd>` in app/components/json-ld.tsx is what puts it on the page.
//
// A standing rule for everything in this section: nothing here may state a fact the site does not
// already state in prose. Structured data that flatters the product is the one kind of SEO work
// that gets a site penalised rather than ignored, and a rating or a review count invented for a
// rich snippet is the usual way it happens. So there is no `aggregateRating` here, no `award`, no
// `sameAs` pointing at social accounts that have not been confirmed to exist. The prices are the
// real ones, imported from the module that charges them.

type JsonLdObject = Record<string, unknown>;

/**
 * Who publishes the site.
 *
 * `legalName`, the postal address and the registration number are deliberately omitted rather than
 * filled from `COMPANY`, because those three fields are still the `[Registered legal entity name]`
 * placeholders that `lib/policy` marks TODO. Publishing a placeholder as structured data is worse
 * than publishing nothing: the policy pages show it to a human who can see it is unfinished, while
 * this feeds it to a machine that cannot. Fill those in and add them here in the same commit.
 */
export function organizationSchema(): JsonLdObject {
  return {
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE_NAME,
    url: siteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon.svg"),
    },
    description: SITE_DESCRIPTION,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT.support,
        areaServed: "IN",
        availableLanguage: ["en"],
      },
    ],
  };
}

export function websiteSchema(): JsonLdObject {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    inLanguage: HTML_LANG,
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
  // No `potentialAction: SearchAction`. The sitelinks search box it asks for requires a URL that
  // runs a site-wide search and renders the results as a page; every search on this site happens
  // inside a board without changing the URL. Declaring one would point Google at a route that does
  // not exist.
}

export function webPageSchema({
  name,
  description,
  path,
  breadcrumb,
}: {
  name: string;
  description: string;
  path: string;
  breadcrumb?: JsonLdObject;
}): JsonLdObject {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name,
    description,
    inLanguage: HTML_LANG,
    isPartOf: { "@id": `${siteUrl()}/#website` },
    publisher: { "@id": `${siteUrl()}/#organization` },
    ...(breadcrumb ? { breadcrumb } : {}),
  };
}

/**
 * The product itself, priced.
 *
 * `FinanceApplication` is the applicationCategory Google documents for this; the offers are built
 * from `PLAN_MONTHLY`, so a price change in the checkout cannot leave a stale price in a search
 * result. Every plan is `INR` per month, matching how the pricing section quotes it by default.
 */
export function softwareApplicationSchema(): JsonLdObject {
  const plans = Object.keys(PLAN_MONTHLY) as PlanKey[];

  return {
    "@type": "SoftwareApplication",
    "@id": `${siteUrl()}/#app`,
    name: SITE_NAME,
    url: siteUrl(),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${siteUrl()}/#organization` },
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: `${PLAN_LABEL[plan]} plan`,
      price: PLAN_MONTHLY[plan],
      priceCurrency: "INR",
      category: "monthly subscription",
      url: `${siteUrl()}/#pricing`,
    })),
  };
}

/**
 * The trail from the home page down to this one.
 *
 * Worth having on every page below the root: it is what turns the grey URL line in a result into a
 * clickable path, and it tells the crawler which page is the parent of which without relying on it
 * inferring that from the directory structure.
 */
export function breadcrumbSchema(trail: { name: string; path: string }[]): JsonLdObject {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Several schemas as one graph.
 *
 * `@graph` rather than one `<script>` per schema, so the `@id` references between them — a page
 * pointing at the website, the website pointing at its publisher — resolve. Emitted separately they
 * are three unrelated fragments and the references dangle.
 */
export function graph(...nodes: JsonLdObject[]): JsonLdObject {
  return { "@context": "https://schema.org", "@graph": nodes };
}
