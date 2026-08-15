// The real screenshots of each AI feature, taken from this application.
//
// ---------------------------------------------------------------------------
// Why a manifest rather than a directory listing
// ---------------------------------------------------------------------------
//
// The slider wants to show a genuine picture of each feature, and the only honest source of one is
// the feature itself. `scripts/capture-feature-shots.mjs` drives a browser against a running build,
// signs in, opens each dashboard section and photographs it — so what the landing page shows is
// literally what the product renders, not a designer's impression of it.
//
// The component cannot go looking in `public/` for those files: it renders in the browser as well
// as on the server, and a missing image would arrive as a broken frame in the middle of the hero.
// So the capture script writes this manifest alongside the images, and the component asks *it*
// whether a shot exists. A feature with no entry falls back to the drawn mock panel, which is what
// every feature showed before any screenshot existed and is a perfectly good slide on its own.
//
// That fallback is the reason the manifest ships empty and is safe to commit empty: a clone that
// has never run the capture script still gets a complete, working slider.
//
// ---------------------------------------------------------------------------
// Regenerating
// ---------------------------------------------------------------------------
//
//   npm run build && npx next start -p 3100
//   node scripts/capture-feature-shots.mjs http://localhost:3100
//
// The script rewrites this file and `public/feature-shots/`. Neither is meant to be hand-edited.

import manifest from "../data/feature-shots.json";

export type FeatureShot = {
  /** Path under `public/`, ready to hand to `next/image`. */
  src: string;
  width: number;
  height: number;
  /** When the picture was taken, ISO-8601. Shown so a stale shot can be spotted. */
  capturedAt: string;
};

type ShotManifest = {
  capturedAt: string | null;
  shots: Record<string, { src?: unknown; width?: unknown; height?: unknown; capturedAt?: unknown }>;
};

const SHOTS = (manifest as ShotManifest).shots ?? {};

/** A positive integer from the manifest, or null — a zero dimension would break `next/image`. */
function size(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * The screenshot for a feature, or null when none has been captured.
 *
 * Validated rather than trusted, even though this file is generated: it is committed JSON, which
 * means it can be edited by hand and merged badly, and a half-written entry reaching `next/image`
 * is a build error rather than a missing picture.
 */
export function featureShot(key: string): FeatureShot | null {
  const entry = SHOTS[key];
  if (!entry) return null;

  const width = size(entry.width);
  const height = size(entry.height);
  const src = typeof entry.src === "string" && entry.src.startsWith("/") ? entry.src : null;

  if (!src || width === null || height === null) return null;

  return {
    src,
    width,
    height,
    capturedAt: typeof entry.capturedAt === "string" ? entry.capturedAt : ((manifest as ShotManifest).capturedAt ?? ""),
  };
}

/** How many features currently have a picture. Used by the capture script's own reporting. */
export function capturedCount(): number {
  return Object.keys(SHOTS).filter((key) => featureShot(key) !== null).length;
}
