import { CAP_TIER_CHROME, normaliseCapTier, type CapTierKey } from "../lib/market-format";

/**
 * The cap tier, as a mark rather than a word.
 *
 * Three stacked bars, filled to the tier: one for small, two for mid, three for large. The
 * metaphor is size, which is exactly what the tier means — SEBI defines it by rank on market
 * capitalisation — so the icon carries the meaning rather than decorating it.
 *
 * The bars are always all three, with the unfilled ones left faint, because an icon that changed
 * shape between tiers would be three icons; one that changes fill is a scale a reader can read at a
 * glance without a legend.
 */
export function CapTierIcon({ tier, className = "" }: { tier: CapTierKey; className?: string }) {
  const filled = tier === "large" ? 3 : tier === "mid" ? 2 : 1;

  return (
    <svg viewBox="0 0 12 10" className={`h-2.5 w-3 shrink-0 ${className}`} aria-hidden="true" fill="currentColor">
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={index * 4.5}
          // Taller as they go right, so the shape reads as a rising scale even in one colour.
          y={6 - index * 3}
          width="3"
          height={4 + index * 3}
          rx="0.8"
          opacity={index < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

/**
 * The tier as an inline pill: the mark, then the name.
 *
 * `raw` takes whatever the exchange called it — "Large", "large", null — so a caller does not have
 * to normalise before rendering. An unknown tier renders nothing rather than a pill reading
 * "Unknown", which would be a label for an absence.
 */
export function CapTierBadge({ raw, className = "" }: { raw: string | null | undefined; className?: string }) {
  const tier = normaliseCapTier(raw);
  if (!tier) return null;

  const chrome = CAP_TIER_CHROME[tier];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${chrome.pill} ${className}`}
      title={`${chrome.label} cap`}
    >
      <CapTierIcon tier={tier} />
      {chrome.label}
    </span>
  );
}
