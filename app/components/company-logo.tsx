"use client";

import { useState } from "react";
import { normaliseTicker, stockLogoUrl } from "../lib/company-logos";

// A monogram is drawn whenever no real logo exists, so it has to look like a designed tile rather
// than a broken image. Giving each ticker a stable colour does that, and keeps a company looking
// the same wherever it appears on the page.
const TONES = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

/** Same ticker, same colour — every time, on the server and in the browser alike. */
export function monogramTone(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_003;
  }
  return TONES[hash % TONES.length];
}

/** Three characters is enough to tell two neighbours apart without reading as a word. */
export function monogramText(symbol: string): string {
  return normaliseTicker(symbol).slice(0, 3) || "?";
}

/**
 * The company's own logo beside its ticker, with a monogram tile when there isn't one.
 *
 * The store is keyed by the listed symbol, so a hit is genuinely that company's mark. A miss is
 * common for small caps and is not an error state — hence the fallback is styled, not apologetic.
 */
export function CompanyLogo({
  symbol,
  src: override,
  size = 36,
  className = "",
}: {
  symbol: string;
  /**
   * A known-good logo URL, for the rare case where we have one the ticker store can't give us —
   * an unlisted company with a hand-checked website. Never a guessed one.
   */
  src?: string | null;
  size?: number;
  className?: string;
}) {
  // Keyed by symbol rather than a bare boolean: a row that swaps one company for another (paging
  // through a list reuses these nodes) must try the new logo instead of inheriting the old miss.
  const [brokenFor, setBrokenFor] = useState<string | null>(null);

  const src = override ?? stockLogoUrl(symbol);
  const box = { width: size, height: size };

  if (src === null || brokenFor === symbol) {
    return (
      <span
        style={{ ...box, fontSize: Math.round(size * 0.3) }}
        className={`flex shrink-0 items-center justify-center rounded-full border border-slate-200 font-bold tracking-tight dark:border-slate-700 ${monogramTone(symbol)} ${className}`}
      >
        {monogramText(symbol)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party logo store, not part of the Next/Image domain allowlist
    <img
      src={src}
      alt={`${symbol} logo`}
      style={box}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBrokenFor(symbol)}
      className={`shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1 dark:border-slate-700 dark:bg-white ${className}`}
    />
  );
}
