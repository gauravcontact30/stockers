"use client";

import { useEffect, useRef, useState } from "react";
import { normaliseTicker, stockLogoUrl } from "../lib/company-logos";
import { indianStocks } from "../lib/indian-stocks";

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
 * Every real source of a company's mark, best first.
 *
 * The ticker store leads because it is keyed by the symbol the exchange publishes, so a hit is
 * unambiguously the right company. Behind it sits the favicon of the company's own website, for
 * the entries where someone has checked what that website is — a second real source, tried only
 * when the first 404s. Neither is guessed from the ticker's letters, which is the mistake this
 * component's predecessor made.
 */
// Built once. This is read on every render of every logo on the page, and a linear scan of the
// catalogue per row adds up fast on a board showing fifty of them.
let domainsBySymbol: Map<string, string | undefined> | null = null;

function checkedDomain(ticker: string): string | undefined {
  domainsBySymbol ??= new Map(indianStocks.map((stock) => [stock.symbol, stock.domain]));
  return domainsBySymbol.get(ticker);
}

function logoSources(symbol: string, override?: string | null): string[] {
  if (override) return [override];

  const ticker = normaliseTicker(symbol);
  const domain = checkedDomain(ticker);

  return [
    stockLogoUrl(ticker),
    domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null,
  ].filter((source): source is string => source !== null);
}

/**
 * The company's own logo beside its ticker, with a monogram tile when there isn't one.
 *
 * Sources are tried in turn rather than one being tried and given up on, so a small cap the ticker
 * store has never heard of can still show its own favicon. A miss on all of them is common in the
 * long tail and is not an error state — hence the fallback is styled, not apologetic.
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
  // Keyed by symbol rather than a bare index: a row that swaps one company for another (paging
  // through a list reuses these nodes) must start again at the best source for the new company
  // instead of inheriting how far the old one got.
  const [attempt, setAttempt] = useState<{ symbol: string; index: number }>({ symbol, index: 0 });

  const sources = logoSources(symbol, override);
  const index = attempt.symbol === symbol ? attempt.index : 0;
  const src = sources[index] ?? null;
  const box = { width: size, height: size };

  /**
   * The failure that happens before React is listening.
   *
   * `onError` only catches a source that fails *after* hydration attaches the handler. Now that the
   * boards are rendered on the server, these `<img>` tags arrive in the HTML and the browser starts
   * fetching them immediately — so a source that 403s quickly fires its error while the page is
   * still hydrating, and that event is gone by the time `onError` exists. The image then sits there
   * broken forever, because nothing ever advanced to the next source.
   *
   * An element that has finished loading with no intrinsic width has failed, whenever that
   * happened. Checking that on mount recovers exactly the errors the handler could not see.
   */
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) {
      setAttempt({ symbol, index: index + 1 });
    }
  }, [symbol, index, src]);

  if (src === null) {
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
      // Keyed by the URL so React swaps the element when a source fails, rather than reusing the
      // one already in its error state and never firing load for the next candidate.
      key={src}
      ref={image}
      src={src}
      alt={`${symbol} logo`}
      style={box}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setAttempt({ symbol, index: index + 1 })}
      className={`shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1 dark:border-slate-700 dark:bg-white ${className}`}
    />
  );
}
