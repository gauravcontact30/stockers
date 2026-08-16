import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * ---------------------------------------------------------------------------
 * Why `script-src` carries 'unsafe-inline' rather than a nonce
 * ---------------------------------------------------------------------------
 *
 * The stricter policy — a per-request nonce with 'strict-dynamic' — cannot be used here, and the
 * reason is structural rather than a matter of effort. Next injects the nonce into the HTML while
 * it renders. Every page on this site is deliberately prerendered: the landing page and its six
 * section routes are built from `use cache` components on the `market` profile below, so the HTML
 * a visitor gets was rendered minutes ago and carries a minutes-old nonce, while the response
 * header would carry a fresh one. They never match, and every script on the page is blocked.
 * Nonces and prerendering are mutually exclusive; the Next docs say so outright.
 *
 * Cache Components does not change this. Partial Prerendering still serves a prerendered shell —
 * that is the entire point of it — so the shell's scripts carry whatever nonce was current when it
 * was built. Moving caching from the route to the component changed which parts are prerendered,
 * not whether any part is.
 *
 * Hashes do not rescue it either. React streams the RSC payload down as a run of parser-inserted
 * `self.__next_f.push(...)` tags whose contents differ per page and per build, so there is no
 * stable set of hashes to enumerate.
 *
 * What this policy does still buy, which is most of the value:
 *
 *   - no script may be *loaded* from an origin not named here, so the usual injected
 *     `<script src="//evil.example/x.js">` is refused;
 *   - no `eval` in production, which removes the string-to-code path a payload needs;
 *   - `object-src 'none'` kills the Flash/applet legacy bypasses;
 *   - `base-uri 'self'` stops an injected `<base>` from re-pointing every relative script URL;
 *   - `frame-ancestors 'none'` refuses framing, so clickjacking a signed-in dashboard is out;
 *   - `form-action` bounds where a form may post, so an injected form cannot exfiltrate to
 *     an attacker's host.
 *
 * The gap that remains is an inline `<script>` written into the page by an XSS. That is a real gap
 * and worth naming plainly rather than implying the policy closes it: the defence against it here
 * is React's own escaping, and the single `dangerouslySetInnerHTML` in app/layout.tsx, whose
 * contents are a build-time constant with no interpolation.
 *
 * ---------------------------------------------------------------------------
 * Where each third-party origin comes from
 * ---------------------------------------------------------------------------
 *
 * Nothing here is speculative — every entry is an origin the browser is already asked to reach:
 *
 *   checkout.razorpay.com   the checkout script, loaded on first click by
 *                           `loadCheckoutScript` in app/components/razorpay-checkout.tsx
 *   api.razorpay.com        the iframe that checkout opens, its XHRs, and the bank form it posts
 *   *.razorpay.com          lumberjack.* telemetry the checkout bundle beacons to; wildcarded
 *                           because the subdomain it picks varies by payment method
 *   images.dhan.co          the ticker logo store — app/lib/company-logos.ts
 *   logo.clearbit.com       logos in the AI report — app/components/ai-report-modal.tsx
 *   www.google.com          the s2 favicon fallback in app/components/company-logo.tsx
 *   *.gstatic.com           where that s2 favicon request *lands*. `www.google.com/s2/favicons`
 *                           answers with a 302 to `t0`–`t3.gstatic.com`, and a redirect is checked
 *                           against `img-src` again at its destination — naming only the origin the
 *                           request was addressed to blocks every one of these at the second hop.
 *                           Measured on the landing page: every hand-checked domain in
 *                           app/lib/indian-stocks.ts (bosch.in, lg.com, hitachienergy.com,
 *                           myvi.in, solargroup.com …) failed this way, each one logging a CSP
 *                           violation to the console and leaving the company's logo undrawn.
 *                           Wildcarded because Google picks the `tN` subdomain per request.
 *   assets-netstorage.groww.in,
 *   static.tickertape.in    the two extra logo sources `preferReal` tries in
 *                           app/components/company-logo.tsx before falling back to a monogram.
 *                           Referenced in that file since it was written, never named here, so
 *                           the `preferReal` path could not draw anything but a monogram.
 *
 * `blob:` in `img-src` is the profile-picture preview in app/components/admin-client-reviews.tsx,
 * which calls `URL.createObjectURL`. `data:` covers inlined SVG and the font subsets.
 *
 * `style-src` needs 'unsafe-inline' for the `style={{ ... }}` props used throughout the boards:
 * a nonce cannot authorise a style *attribute*, only a `<style>` element.
 */
const csp = [
  `default-src 'self'`,
  // 'unsafe-eval' is React's dev-only error overlay reconstructing server stacks. Never in prod.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://images.dhan.co https://logo.clearbit.com https://www.google.com https://*.gstatic.com https://assets-netstorage.groww.in https://static.tickertape.in https://*.razorpay.com`,
  `font-src 'self' data: https://checkout.razorpay.com`,
  // ws: is the dev server's HMR socket, and is not emitted in production.
  `connect-src 'self' https://api.razorpay.com https://*.razorpay.com${isDev ? " ws: http://localhost:*" : ""}`,
  `frame-src https://api.razorpay.com https://checkout.razorpay.com`,
  `worker-src 'self' blob:`,
  `media-src 'self'`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  // Razorpay's netbanking flow posts a real form to the gateway, so it has to be named here.
  `form-action 'self' https://api.razorpay.com`,
  `frame-ancestors 'none'`,
  // Pointless over http://localhost, and browsers exempt localhost anyway — production only.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/**
 * Headers applied to every response.
 *
 * `X-Frame-Options: DENY` is deliberately kept alongside `frame-ancestors 'none'`, which supersedes
 * it in every browser that understands CSP. It costs 22 bytes and is what an old client, or a
 * corporate proxy that strips CSP, still honours.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    // Two years, subdomains included, and preload-eligible. `preload` is a commitment: submitting
    // the domain to the browser preload list is effectively irreversible on a human timescale, so
    // it belongs here only because HTTPS is already the only way this site is served.
    //
    // Production only. Sending HSTS from a dev server that is also reachable over plain http can
    // pin localhost to https in the browser and leave every project on port 3000 unreachable.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Stops the browser second-guessing a declared Content-Type — the trick that turns an uploaded
  // "image" into executable script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Nothing on this site needs a camera, a microphone or a location, so the surface is dropped
    // outright. `payment` is left to self and Razorpay, which is the one that is actually used.
    key: "Permissions-Policy",
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://api.razorpay.com")',
  },
  {
    // Severs `window.opener` from cross-origin openers, so a page that launched this one cannot
    // reach back into it. `-allow-popups` rather than bare `same-origin` because the checkout does
    // open a bank window and would otherwise lose its handle on it.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
];

/**
 * Build and delivery settings.
 *
 * The blocks below are all about the same thing: how few bytes, and how little main-thread work, a
 * first-time visitor has to get through. See `app/components/hero-carousel` for the other half of
 * that story — the JavaScript this config cannot shrink is the JavaScript a component should not
 * have been running in the first place.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,

  /**
   * Cache Components: the Next 16 rendering model, and the reason most of this file's neighbours
   * changed shape.
   *
   * Before this flag, every page here was one all-or-nothing cached unit — `force-static` plus
   * `revalidate = 60` on the landing page and its six section aliases. That is why `/` shipped a
   * 442KB HTML document: the header, the footer and ten boards' worth of streamed RSC payload were
   * all the same prerender, so a visitor waited on the whole thing before anything painted (2.4s to
   * first contentful paint against a 177ms time to first byte — the gap was almost entirely parse).
   *
   * With this on, caching moves from the route to the component. `use cache` marks what may be
   * prerendered; everything else is dynamic by default and streams into the shell behind its own
   * `<Suspense>`. Partial Prerendering is the default rather than a separate flag, so the shell is
   * served immediately and the boards fill in as they resolve.
   *
   * It also unlocks `partialPrefetching` below, which is what this app needed most.
   */
  cacheComponents: true,

  /**
   * The freshness window every market feed on the site runs on.
   *
   * `revalidate = 60` used to say this, once per page. None of the built-in profiles match it —
   * `seconds` expires too fast to be worth caching an exchange read for, `minutes` holds a moving
   * market five times too long — so the window is named here and referenced by `cacheLife('market')`
   * at each call site.
   *
   * `stale` is the half that did not exist before: under Cache Components it also governs how long
   * a client-side navigation may reuse what it already has, which is why there is no
   * `experimental.staleTimes` block here. One lever, not two that can disagree.
   *
   * ---------------------------------------------------------------------------
   * Why every `expire` below is a day, and why it is not a freshness setting
   * ---------------------------------------------------------------------------
   *
   * `expire` is the one field here that does not mean what its name suggests. From the Next docs
   * (`cacheLife.md`): "After this time with no requests, the next one waits for fresh content."
   * It is not how long data may be served — that is `revalidate` — it is how long an *idle* entry
   * survives before the cache gives up on it and the next visitor is made to wait for a full
   * regeneration in the foreground.
   *
   * These used to be 5 minutes to 90 minutes, and on a site with the traffic this one has that is
   * a trap. A page nobody has requested for five minutes was hard-expired, so the next arrival —
   * a first-time visitor, a crawler, or a Lighthouse run, all of which arrive into exactly that
   * silence — paid for a cold render of the whole landing page: nine BSE reads, the ownership
   * board, and a hero that waits up to `HERO_DEADLINE_MS` (4s) on three feeds this app does not
   * own. Measured on this build, same server, same page: **first contentful paint 7.2s cold
   * against 1.8s warm**, and a reported LCP of 3.7s that lines up with the hero's 4s deadline
   * almost to the tick. No amount of bundle trimming touches that number, because the browser is
   * not the thing that is slow — it is waiting on an origin that threw its work away.
   *
   * A day means an idle entry is instead served immediately from cache and refreshed in the
   * background, so nobody ever waits on a cold render. Freshness is unchanged: `revalidate` still
   * says how old data may be before it is refetched, and it is untouched on all four profiles.
   * The one thing given up is that data older than `revalidate` but younger than `expire` may now
   * be *served once* while the refresh runs, rather than being regenerated in front of the reader
   * — which for a market board is the right trade, and the same trade `stale-while-revalidate` has
   * always made.
   */
  cacheLife: {
    market: {
      stale: 30,
      revalidate: 60,
      expire: 86_400,
    },
    /** The NSE boards — sector rotation, most-traded, ETFs, stock news. Was `revalidate = 300`. */
    board: {
      stale: 150,
      revalidate: 300,
      expire: 86_400,
    },
    /** The IPO calendar. A window opens or closes on a date, not on a tick. Was `revalidate = 600`. */
    calendar: {
      stale: 300,
      revalidate: 600,
      expire: 86_400,
    },
    /** Dividends and corporate actions, which move when a company files. Was `revalidate = 900`. */
    filings: {
      stale: 450,
      revalidate: 900,
      expire: 86_400,
    },
  },

  /**
   * Prefetch one App Shell per route instead of one full page per link.
   *
   * This is the fix for the landing page's worst prefetch cost. The seven links in the header nav
   * point at `/live-market`, `/bse-sectors`, `/beat-the-ai`, `/bse-gainers-losers`, `/shareholding`,
   * `/accuracy` and `/pricing` — and every one of those routes renders the *entire* landing page
   * through `app/lib/home-section-page.tsx`, by design, for SEO. Under the old model a static route
   * is prefetched in full, so a reader sitting on `/` quietly pulled eight near-identical copies of
   * a 442KB document as those links scrolled into view.
   *
   * Partial Prefetching fetches the route's shell once and shares it across every link pointing at
   * it; the uncached remainder streams in after the navigation instead. Requires `cacheComponents`
   * — the build fails at config validation without it.
   */
  partialPrefetching: true,

  experimental: {
    /**
     * `inlineCss` is deliberately OFF. It was tried, measured, and is a loss here.
     *
     * The argument for it is that Tailwind is atomic and the stylesheet is small, so inlining it
     * trades a render-blocking round trip for bytes you were going to download anyway. The first
     * half is true and the second is not: `app/globals.css` is 628 readable lines, but what
     * Tailwind v4 generates from it and the class soup across ~200 components is **210KB**, which
     * is squarely the "large CSS bundle" case the Next docs say to skip.
     *
     * Measured on the landing page with it on: the 210KB stylesheet was serialised into the RSC
     * payload *twice* — 436KB of the document — while the `<link rel="stylesheet">` tags stayed in
     * the `<head>` regardless, so nothing was saved and the round trip happened anyway. The
     * document went from 279KB to 961KB and total blocking time from 189ms to 1106ms.
     *
     * If the stylesheet is ever brought down to a genuinely small size, this is worth re-measuring.
     * Not before.
     */

    /**
     * Several route handlers wrap their loaders in `try/catch`. Under Cache Components a prerender
     * bail-out is a *throw*, so those blocks catch it and log it, and the build output fills with
     * errors that are not errors. This suppresses only what is emitted after a bail-out.
     */
    hideLogsAfterAbort: true,
  },

  images: {
    // AVIF first, WebP second, original last. The order is the preference order — Next picks the
    // first entry the browser's Accept header admits to supporting, and AVIF is roughly a third
    // smaller than the WebP it falls back to.
    formats: ["image/avif", "image/webp"],
    // Required from Next 16: an unrestricted allowlist lets anyone burn the optimiser on qualities
    // this site never asks for. 60 is for the review portraits, which are decorative and large; 75
    // is the default everything else uses.
    qualities: [60, 75],
    // A month, rather than the 60-second default. These are logos and portraits — they change when
    // somebody uploads a new file, which is what the content hash in the URL is for.
    minimumCacheTTL: 2_678_400,
  },

  // No custom Cache-Control for /_next/static here. Next already serves fingerprinted assets as
  // `immutable` for a year in production, and overriding it earns a build warning because the same
  // rule breaks asset reloading in dev. The bytes worth chasing were the images above.

  /**
   * Security headers, on every route.
   *
   * These run ahead of Proxy in the request chain, and apply to prerendered HTML as well as to
   * route handlers — which is the reason they live here rather than in proxy.ts. A header set in
   * Proxy would be skipped for anything served straight off the static cache.
   */
  /**
   * The old `/dashboard/*` and `/admin/*` URLs, kept working.
   *
   * Both areas moved into route groups — `app/(dashboard)` and `app/(admin)` — so their sections
   * now sit at the top level: `/portfolio` rather than `/dashboard/portfolio`, `/users` rather than
   * `/admin/users`. A route group's whole purpose is that the folder does not appear in the path.
   *
   * These are 308s rather than 307s because the move is permanent: a bookmark, a link in an old
   * email, or a search engine's index should all be updated to point at the new URL rather than
   * keep asking for the old one. The two index pages became named routes — `/dashboard` was the
   * workspace Overview and `/admin` was the console Overview, and both are real views that would
   * have been lost had they simply redirected to a sibling section.
   *
   * `:path*` on the two prefix rules covers every section in one line each, including any added
   * later, so this list does not need maintaining alongside `DASHBOARD_SECTION_ROUTES`.
   */
  async redirects() {
    return [
      { source: "/dashboard", destination: "/overview", permanent: true },
      { source: "/dashboard/:path*", destination: "/:path*", permanent: true },
      { source: "/admin", destination: "/console", permanent: true },
      { source: "/admin/:path*", destination: "/:path*", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: isDev
          ? securityHeaders.filter((header) => header.key !== "Strict-Transport-Security")
          : securityHeaders,
      },
      {
        /**
         * The reviewer photos and signatures, cached for a year.
         *
         * Anything under `public/` is served by Next with `Cache-Control: public, max-age=0`, so
         * every visitor re-fetched these on every visit — measured at `max-age=0` on the landing
         * page's two signature files, and what Lighthouse reports as "use efficient cache
         * lifetimes". `public/` gets that default because Next cannot know whether a file at a
         * fixed path is stable, and for most of `public/` it is right to be careful.
         *
         * It is safe *here* because these names now carry a hash of the file's own bytes — see
         * `saveImage` in app/lib/client-reviews.ts. Replacing a reviewer's photo writes a new
         * filename and the stored review points at it, so no URL's content ever changes and
         * `immutable` cannot serve a stale one. Scoped to `/uploads/` rather than all of `public/`
         * for exactly that reason: it is the only directory where that guarantee holds.
         */
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

/**
 * The bundle analyzer, off unless asked for.
 *
 * `npm run analyze` builds with it on and opens a treemap per bundle. Gated behind an env var
 * rather than always-on because it writes report HTML beside the build output and adds a plugin
 * pass to every production build — a cost worth paying when you are reading the numbers and not
 * when you are shipping.
 *
 * What it is for: the client bundles here are entirely first-party, so anything heavy in them is a
 * component that should be split, deferred or moved to the server, not a dependency to swap out.
 * The treemap is how you find which one.
 */
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

export default withBundleAnalyzer(nextConfig);
