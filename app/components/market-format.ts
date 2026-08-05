// Shared number formatting for the market sections, so a rupee, a percentage and a share count
// look the same everywhere on the page.

const DASH = "—";

export function formatRupee(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

/**
 * Rupee amounts in Indian market data run to billions, so they're shown in the units Indian
 * investors actually use — crore (10⁷) and lakh (10⁵) — rather than as unreadable digit strings.
 */
export function formatCrore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;

  const crore = value / 1e7;
  if (crore >= 1) return `₹${crore.toLocaleString("en-IN", { maximumFractionDigits: crore >= 100 ? 0 : 1 })} Cr`;

  const lakh = value / 1e5;
  return `₹${lakh.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
}

/** Share counts, in the crore/lakh units Indian volume data is quoted in. */
export function formatQuantity(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;

  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return value.toLocaleString("en-IN");
}

export function toneFor(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-400 dark:text-slate-500";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

export function chipFor(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  if (value > 0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  if (value < 0) return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

/** A stable colour per sector name, so an industry reads the same in every section. */
const SECTOR_TONES = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
];

export function sectorTone(sector: string): string {
  let hash = 0;
  for (let i = 0; i < sector.length; i++) hash = (hash * 31 + sector.charCodeAt(i)) % 100003;
  return SECTOR_TONES[hash % SECTOR_TONES.length];
}

/** Compact relative age, e.g. "20m ago". Empty string when the timestamp is unusable. */
export function relativeAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";

  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

export function formatDayDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const parsed = new Date(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return DASH;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
