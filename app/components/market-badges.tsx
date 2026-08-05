export type MarketCapTier = "Large" | "Mid" | "Small";

const CAP_TIER_STYLE: Record<MarketCapTier, string> = {
  Large: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  Mid: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Small: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
};

// Shown on every stock card/row across the landing page so a trader can size up "how big is
// this company" at a glance without opening the full report.
export function CapTierPill({ tier, className = "" }: { tier: MarketCapTier; className?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${CAP_TIER_STYLE[tier]} ${className}`}>{tier} Cap</span>;
}

// A small pulsing dot (Tailwind's built-in ping animation, no custom CSS) signaling the price
// next to it is a live quote, not a stale/cached number — the same visual language trading
// terminals use for a "market open" indicator.
export function LiveIndicator({ label = "Live", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400 ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}
