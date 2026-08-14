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
 * it renders. Every page on this site is deliberately prerendered and revalidated (`force-static`
 * plus `revalidate = 60`, see app/page.tsx and the six section routes), so the HTML a visitor gets
 * was rendered minutes ago and carries a minutes-old nonce, while the response header would carry
 * a fresh one. They never match, and every script on the page is blocked. Nonces and ISR are
 * mutually exclusive; the Next docs say so outright.
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
  `img-src 'self' data: blob: https://images.dhan.co https://logo.clearbit.com https://www.google.com https://*.razorpay.com`,
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: isDev
          ? securityHeaders.filter((header) => header.key !== "Strict-Transport-Security")
          : securityHeaders,
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
