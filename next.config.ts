import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

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
