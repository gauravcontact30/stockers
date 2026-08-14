import { sectorLabel } from "../lib/market-format";

/**
 * The industry a company is filed under, as a coloured pill with a mark.
 *
 * There are roughly thirty sector names between the hand-classified catalogue and BSE's own
 * industry list — far too many to give each its own colour and stay readable. They are grouped into
 * nine families instead, matched on the words in the name rather than on a key, because the two
 * sources spell the same industry differently ("Information Technology" and "IT — Software") and a
 * key table would need extending every time the exchange renamed a bucket.
 *
 * The family decides the colour and the glyph; the pill still shows the sector's own full name, so
 * grouping never costs the reader precision.
 */

type Family = {
  key: string;
  /** Lower-case fragments that place a sector in this family, tried in order. */
  match: string[];
  chrome: string;
  icon: React.ReactNode;
};

/** 16x16 viewBox, `currentColor`, so each glyph takes the pill's own text colour. */
const path = (d: string) => <path d={d} />;

const FAMILIES: Family[] = [
  {
    key: "finance",
    match: ["financ", "bank", "insur", "nbfc"],
    chrome: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    // A classical facade: columns under a pediment.
    icon: path("M8 1 1 5v1.5h14V5L8 1ZM3 8v5H2v1.5h12V13h-1V8h-2v5H9V8H7v5H5V8H3Z"),
  },
  {
    key: "tech",
    match: ["technolog", " it", "it —", "software", "data cent", "digital"],
    chrome: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    // A chip with legs.
    icon: path("M5 1v1.5H4A2 2 0 0 0 2 4.5v1H0.5V7H2v2H0.5v1.5H2v1a2 2 0 0 0 2 2h1V15h1.5v-1.5h2V15H10v-1.5h1a2 2 0 0 0 2-2v-1h1.5V9H13V7h1.5V5.5H13v-1a2 2 0 0 0-2-2h-1V1H8.5v1.5h-2V1H5Zm0 4h6v6H5V5Z"),
  },
  {
    key: "energy",
    match: ["energy", "oil", "gas", "power", "utilit", "coal"],
    chrome: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    // A lightning bolt.
    icon: path("M9.5 1 3 9h4l-.5 6L13 7H9l.5-6Z"),
  },
  {
    key: "health",
    match: ["health", "pharma", "hospital", "medical", "diagnost"],
    chrome: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
    // A medical cross.
    icon: path("M6 1h4v5h5v4h-5v5H6v-5H1V6h5V1Z"),
  },
  {
    key: "auto",
    match: ["auto", "vehicle", "tyre", "aviation", "airline"],
    chrome: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
    // A car in profile.
    icon: path("M3 7l1.4-3.2A1.5 1.5 0 0 1 5.8 3h4.4a1.5 1.5 0 0 1 1.4.8L13 7h1v4h-1.5a1.5 1.5 0 0 1-3 0h-3a1.5 1.5 0 0 1-3 0H2V7h1Zm1.7-.5h6.6l-.9-2H5.6l-.9 2Z"),
  },
  {
    key: "materials",
    match: ["metal", "chemical", "cement", "material", "mining", "steel", "paint", "forest", "textile"],
    chrome: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
    // A flask.
    icon: path("M6 1v4.2L1.6 12.4A1.6 1.6 0 0 0 3 15h10a1.6 1.6 0 0 0 1.4-2.6L10 5.2V1H6Zm1.5 1.5h1V6l1.6 2.6H5.9L7.5 6V2.5Z"),
  },
  {
    key: "consumer",
    match: ["consumer", "retail", "fmcg", "durable", "jewell", "food", "beverage", "toys"],
    chrome: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    // A shopping basket.
    icon: path("M5.5 1 4 4H1v1.5h1L3 14h10l1-8.5h1V4h-3l-1.5-3h-1l1.5 3h-4L6.5 1h-1Z"),
  },
  {
    key: "infra",
    match: ["realty", "real estate", "construct", "infra", "port", "logistic", "capital goods", "industrial"],
    chrome: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
    // A tower block.
    icon: path("M2 15V3l6-2v14H2Zm7 0V6l5 2v7H9ZM4 5h2v2H4V5Zm0 4h2v2H4V9Zm7 0h2v2h-2V9Z"),
  },
  {
    key: "media",
    match: ["telecom", "media", "entertain", "broadcast"],
    chrome: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
    // Rising signal bars.
    icon: path("M1 11h3v4H1v-4Zm4.5-3h3v7h-3V8ZM10 4h3v11h-3V4Z"),
  },
];

/** Anything the families do not claim — including "Unclassified", which is an honest answer. */
const OTHER = {
  chrome: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
  icon: path("M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 2.5A3.5 3.5 0 1 1 8 11.5 3.5 3.5 0 0 1 8 4.5Z"),
};

export function familyFor(sector: string): { chrome: string; icon: React.ReactNode } {
  const needle = sector.toLowerCase();
  return FAMILIES.find((family) => family.match.some((fragment) => needle.includes(fragment))) ?? OTHER;
}

export function SectorPill({ sector, className = "" }: { sector: string | null | undefined; className?: string }) {
  const label = sectorLabel(sector);
  // No pill at all for a company the exchange has not filed. An empty pill would be a label for
  // nothing, and a "—" would look like a sector called "—".
  if (!label) return null;

  const family = familyFor(label);

  return (
    <span
      className={`inline-flex max-w-full shrink items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${family.chrome} ${className}`}
      title={label}
    >
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0" fill="currentColor" aria-hidden="true">
        {family.icon}
      </svg>
      <span className="truncate">{label}</span>
    </span>
  );
}
