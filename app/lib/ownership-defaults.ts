/**
 * The company the ownership board opens on.
 *
 * In its own module, and deliberately not in either component that needs it. The board itself is a
 * `"use client"` file, and a value exported from one of those does not survive being imported by a
 * Server Component — the RSC boundary hands back a client reference rather than the string, which
 * is a `symbol.toUpperCase is not a function` at prerender rather than a compile error.
 *
 * Named once, because the server prefetches exactly this symbol: if the two ever drifted apart the
 * board would render the server's company and immediately fetch a different one, which is worse
 * than not prefetching at all.
 *
 * Nothing else belongs in here. It has no imports on purpose, so both sides of the boundary can
 * take it without dragging anything across with it.
 */
export const OPENING_SYMBOL = "RELIANCE";
