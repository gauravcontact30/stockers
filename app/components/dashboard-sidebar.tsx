"use client";

import { useCallback, useRef, useSyncExternalStore, type ReactElement } from "react";

type IconProps = { className?: string };

/**
 * Every AI surface the dashboard hosts.
 *
 * The first eight are the screeners the workspace was built around. The eight after them are the
 * exchange boards that used to sit on the landing page: the market data under each is still public
 * and still renders, but each now carries an AI layer, and that layer is what the feature gates.
 */
export type AiSectionId =
  | "portfolio"
  | "intel"
  | "market-pulse"
  | "top-picks"
  | "buy-tomorrow"
  | "dip-winners"
  | "research"
  | "compare"
  | "etf-research"
  | "directory"
  | "sectors"
  | "most-traded"
  | "mtf"
  | "stock-news"
  | "dividends"
  | "ipos"
  | "etf-board";

export type DashboardSectionId = "overview" | AiSectionId | "support";

type SectionChrome = {
  label: string;
  description: string;
  icon: (props: IconProps) => ReactElement;
};

export type AiSection = SectionChrome & {
  id: AiSectionId;
  /** The AI_FEATURES key this section is gated on. */
  feature: string;
  /** The admin-facing name of that feature, shown on the lock panel. */
  featureLabel: string;
  /**
   * False for a section that is only partly AI — the market pulse keeps its exchange data visible
   * and the server withholds just the AI narrative. Every exchange board that moved in from the
   * landing page sets this too: the public data a visitor could always see stays visible.
   */
  gate?: boolean;
};

export type PlainSection = SectionChrome & { id: "overview" | "support" };

export type DashboardSection = PlainSection | AiSection;

/** True for a section that has an AI layer to gate. */
export function isAiSection(section: DashboardSection): section is AiSection {
  return "feature" in section;
}

function OverviewIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function IntelIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.2-4.2" />
      <path d="m10.5 6.8 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1Z" />
    </svg>
  );
}

function PulseIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2 12h4l3-8 4 16 3-8h6" />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8Z" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m10 15 2 2 3-4" />
    </svg>
  );
}

function DipIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 7l5 7 3-3 4 5 6-11" />
      <path d="M21 5v5h-5" />
    </svg>
  );
}

function ResearchIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8.5 12.5 10.5 10l2 2 2.5-3.5" />
    </svg>
  );
}

function CompareIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="8" width="7" height="13" rx="1.5" />
      <rect x="14" y="3" width="7" height="18" rx="1.5" />
      <path d="M6.5 4.5v2M5.5 5.5h2" />
    </svg>
  );
}

function EtfIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16.5 9 5 9-5" />
    </svg>
  );
}

function DirectoryIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M8 7h7M8 11h7M8 15h4" />
    </svg>
  );
}

function SectorsIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.4 6.4" />
    </svg>
  );
}

function VolumeIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 20V12M9 20V5M14 20v-6M19 20V9" />
    </svg>
  );
}

function MarginIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3v18M3 8h18" />
      <path d="m6.5 8-3 6h6ZM17.5 8l-3 6h6Z" />
    </svg>
  );
}

function FilingIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M14 4v6h6M8 14h8M8 17h5" />
    </svg>
  );
}

function DividendIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function IpoIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3c3 2.2 4.5 5.3 4.5 9L12 16l-4.5-4c0-3.7 1.5-6.8 4.5-9Z" />
      <path d="M9.5 16 8 20l4-1.6 4 1.6-1.5-4" />
      <circle cx="12" cy="10" r="1.6" />
    </svg>
  );
}

function BasketIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 9h18l-1.8 9.3A2 2 0 0 1 17.2 20H6.8a2 2 0 0 1-2-1.7Z" />
      <path d="m8 9 2.5-5M16 9l-2.5-5M10 13v3M14 13v3" />
    </svg>
  );
}

function PortfolioIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12h18M11 12v2.5h2V12" />
    </svg>
  );
}

function LifebuoyIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

const OVERVIEW_SECTION: PlainSection = {
  id: "overview",
  label: "Overview",
  description: "Research any stock and keep an eye on your watchlist.",
  icon: OverviewIcon,
};

const SUPPORT_SECTION: PlainSection = {
  id: "support",
  label: "Getting Started",
  description: "A guided tour of the workspace, and how to reach us when you need a hand.",
  icon: LifebuoyIcon,
};

/** Keyed by id so the dashboard can look one up without a runtime "not found" fallback. */
export const AI_SECTIONS: Record<AiSectionId, AiSection> = {
  portfolio: {
    id: "portfolio",
    label: "My Portfolio",
    description: "Track what you actually hold against the live market, with an AI read on the mix.",
    icon: PortfolioIcon,
    feature: "portfolio",
    featureLabel: "AI portfolio review",
    // The holdings are the reader's own record: managing them is never paywalled, and the lock
    // lands on the AI panels inside the section instead.
    gate: false,
  },
  intel: {
    id: "intel",
    label: "Intelligence Search",
    description: "Ask anything about a BSE-listed company and get the answer in points, with its sources.",
    icon: IntelIcon,
    feature: "intel",
    featureLabel: "AI intelligence search",
  },
  "market-pulse": {
    id: "market-pulse",
    label: "Market Pulse",
    description: "Live breadth, indices and movers with an AI read on the day's mood.",
    icon: PulseIcon,
    feature: "market-pulse",
    featureLabel: "AI market pulse",
    gate: false,
  },
  "top-picks": {
    id: "top-picks",
    label: "Top Picks",
    description: "The stocks the AI agent rates highest for today.",
    icon: StarIcon,
    feature: "top-picks",
    featureLabel: "Today's AI picks",
  },
  "buy-tomorrow": {
    id: "buy-tomorrow",
    label: "Outperform Tomorrow",
    description: "Names set up for tomorrow's session, scored overnight.",
    icon: CalendarIcon,
    feature: "buy-tomorrow",
    featureLabel: "Outperform tomorrow screener",
  },
  "dip-winners": {
    id: "dip-winners",
    label: "Dip Winners",
    description: "Quality stocks trading below their recent range.",
    icon: DipIcon,
    feature: "dip-winners",
    featureLabel: "Today's dip screener",
  },
  "research": {
    id: "research",
    label: "Stock Research",
    description: "Live Indian market data with an AI deep dive on any stock.",
    icon: ResearchIcon,
    feature: "research",
    featureLabel: "AI stock research",
  },
  "compare": {
    id: "compare",
    label: "Compare",
    description: "Put two stocks head to head and let the AI pick a side.",
    icon: CompareIcon,
    feature: "compare",
    featureLabel: "AI stock compare",
  },
  "etf-research": {
    id: "etf-research",
    label: "ETF Research",
    description: "Browse Indian ETFs and get an AI-backed read on any fund.",
    icon: EtfIcon,
    feature: "etf-research",
    featureLabel: "AI ETF research",
  },
  directory: {
    id: "directory",
    label: "Company Directory",
    description: "Every BSE-listed company, searchable — with AI calls on the names you surface.",
    icon: DirectoryIcon,
    feature: "directory",
    featureLabel: "AI company directory",
    gate: false,
  },
  sectors: {
    id: "sectors",
    label: "Sector Trends",
    description: "Where money rotated across NSE's sectoral indices today, and what it implies.",
    icon: SectorsIcon,
    feature: "sectors",
    featureLabel: "AI sector rotation",
    gate: false,
  },
  "most-traded": {
    id: "most-traded",
    label: "Most Traded",
    description: "The heaviest turnover on the exchange, with an AI read on where money went.",
    icon: VolumeIcon,
    feature: "most-traded",
    featureLabel: "AI most-traded read",
    gate: false,
  },
  mtf: {
    id: "mtf",
    label: "MTF Watch",
    description: "Most-traded names you can outperform on margin, and what the leverage really costs.",
    icon: MarginIcon,
    feature: "mtf",
    featureLabel: "AI MTF watch",
    gate: false,
  },
  "stock-news": {
    id: "stock-news",
    label: "Stocks in News",
    description: "Today's corporate filings by sector, with AI picking out the ones that matter.",
    icon: FilingIcon,
    feature: "stock-news",
    featureLabel: "AI filings digest",
    gate: false,
  },
  dividends: {
    id: "dividends",
    label: "Dividends",
    description: "Declared dividends and the ex-dates still ahead of you, read by the AI desk.",
    icon: DividendIcon,
    feature: "dividends",
    featureLabel: "AI dividend planner",
    gate: false,
  },
  ipos: {
    id: "ipos",
    label: "IPO Watch",
    description: "Open, upcoming and closed issues with live subscription figures and an AI read.",
    icon: IpoIcon,
    feature: "ipos",
    featureLabel: "AI IPO watch",
    gate: false,
  },
  "etf-board": {
    id: "etf-board",
    label: "ETF Board",
    description: "Every NSE ETF by asset class, ranked by money traded, with an AI read on each.",
    icon: BasketIcon,
    feature: "etf-board",
    featureLabel: "AI ETF board",
    gate: false,
  },
};

export type SectionGroup = { key: string; label: string; sections: DashboardSection[] };

/**
 * The sidebar in groups.
 *
 * Eighteen destinations in one flat column is a list nobody reads. Grouped, the reader picks a
 * kind of question first — am I screening, or am I looking something up — and the list under it
 * is short enough to scan.
 */
export const DASHBOARD_GROUPS: SectionGroup[] = [
  { key: "workspace", label: "Workspace", sections: [OVERVIEW_SECTION, AI_SECTIONS.portfolio] },
  {
    key: "screeners",
    label: "AI screeners",
    sections: [
      AI_SECTIONS.intel,
      AI_SECTIONS["market-pulse"],
      AI_SECTIONS["top-picks"],
      AI_SECTIONS["buy-tomorrow"],
      AI_SECTIONS["dip-winners"],
      AI_SECTIONS.research,
      AI_SECTIONS.compare,
      AI_SECTIONS["etf-research"],
    ],
  },
  {
    key: "boards",
    label: "Exchange boards",
    sections: [
      AI_SECTIONS.directory,
      AI_SECTIONS.sectors,
      AI_SECTIONS["most-traded"],
      AI_SECTIONS.mtf,
      AI_SECTIONS["stock-news"],
      AI_SECTIONS.dividends,
      AI_SECTIONS.ipos,
      AI_SECTIONS["etf-board"],
    ],
  },
  { key: "help", label: "Help", sections: [SUPPORT_SECTION] },
];

export const DASHBOARD_SECTIONS: DashboardSection[] = DASHBOARD_GROUPS.flatMap((group) => group.sections);

/** Every section by id, so the dashboard can look one up without a "not found" fallback. */
export const SECTION_BY_ID = Object.fromEntries(
  DASHBOARD_SECTIONS.map((section) => [section.id, section]),
) as Record<DashboardSectionId, DashboardSection>;

export function isDashboardSectionId(value: string): value is DashboardSectionId {
  return DASHBOARD_SECTIONS.some((section) => section.id === value);
}

const STORAGE_KEY = "stockers-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private-mode browsers throw on localStorage access; an unreadable preference is no
    // preference, so the sidebar opens.
    return false;
  }
}

/* istanbul ignore next -- only called while hydrating server-rendered HTML, which jsdom never does. */
const expandedOnServer = () => false;

/**
 * The remembered rail/expanded choice.
 *
 * The server can't know the preference, so it always renders the sidebar open.
 * useSyncExternalStore is built for exactly that divergence: it hydrates against the server's
 * answer and resyncs immediately after, instead of tripping a hydration mismatch the way reading
 * localStorage during render would. The store is per-instance so a remount re-reads storage.
 */
function useCollapsedPreference(): [boolean, (next: boolean) => void] {
  const store = useRef({ value: null as boolean | null, listeners: new Set<() => void>() }).current;

  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );

  const collapsed = useSyncExternalStore(subscribe, () => store.value ?? readCollapsed(), expandedOnServer);

  const setCollapsed = useCallback(
    (next: boolean) => {
      // Held in memory as well as in storage, so the toggle still works where writes throw.
      store.value = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Nothing to do: the sidebar works, it just forgets the choice after this visit.
      }
      store.listeners.forEach((listener) => listener());
    },
    [store],
  );

  return [collapsed, setCollapsed];
}

type NavProps = {
  active: DashboardSectionId;
  onSelect: (id: DashboardSectionId) => void;
};

/** One row of the rail: the hover sweep, the growing accent bar and the collapsed tooltip. */
function SectionButton({
  section,
  active,
  collapsed,
  onSelect,
}: {
  section: DashboardSection;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: DashboardSectionId) => void;
}) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-label={section.label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_14px_30px_-16px_rgba(5,150,105,0.95)]"
          : "text-slate-600 hover:-translate-y-px hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.7)] dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
      }`}
    >
      {/* A light sweeps across the item on hover. The sweep gets its own clipping box so
          the button itself can stay overflow-visible for the tooltip. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full dark:via-white/10" />
      </span>
      {/* An accent bar grows out of the left edge on hover (the active item has the fill instead). */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500 transition-all duration-200 ${
          active ? "h-0" : "h-0 group-hover:h-6"
        }`}
      />

      <Icon
        className={`relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
          active ? "text-white" : "text-slate-400 group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-300"
        }`}
      />

      {!collapsed && <span className="relative min-w-0 flex-1 truncate">{section.label}</span>}
      {!collapsed && active && <span aria-hidden="true" className="relative h-1.5 w-1.5 shrink-0 rounded-full bg-white/90" />}

      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_12px_30px_-12px_rgba(15,23,42,0.8)] transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 dark:bg-slate-700"
        >
          {section.label}
        </span>
      )}
    </button>
  );
}

/**
 * The dashboard's section switcher: full-width labels when expanded, an icon rail with hover
 * tooltips when collapsed. The choice is remembered across visits.
 */
export function DashboardSidebar({ active, onSelect }: NavProps) {
  const [collapsed, setCollapsed] = useCollapsedPreference();

  return (
    <aside
      data-collapsed={String(collapsed)}
      /*
       * The rail only appears at `lg` (1024px), not `sm` (640px).
       *
       * A 268px rail against a 640-1024px viewport left 324-500px for the boards themselves — a
       * content column narrower than the phone layout's, on a wider screen. Every tablet now gets
       * the same full-width column a phone gets, with the pill switcher above it; the rail waits
       * until there is room for both. Expanded it is a little narrower until `xl`, where the
       * content column can afford the extra 36px.
       */
      className={`sticky top-0 z-30 hidden h-[100dvh] shrink-0 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex dark:border-slate-800 dark:bg-slate-900/95 ${
        collapsed ? "w-[76px]" : "w-[232px] xl:w-[268px]"
      }`}
    >
      <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />

      <div className={`flex items-center gap-2 border-b border-slate-200/80 px-3 py-4 dark:border-slate-800 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">StockersAI</p>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">AI workspace</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
        >
          <ChevronIcon className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Scrolling is only enabled while expanded: the collapsed rail needs visible overflow so a
          hover tooltip can escape the sidebar's edge. */}
      <nav
        aria-label="Dashboard sections"
        className={`flex flex-1 flex-col gap-1 px-2.5 py-4 ${collapsed ? "" : "min-h-0 overflow-y-auto"}`}
      >
        {DASHBOARD_GROUPS.map((group, index) => (
          <div key={group.key} className={index > 0 ? "mt-3" : ""}>
            {/* Collapsed, there is no room for a heading, so a hairline keeps the grouping legible. */}
            {collapsed ? (
              index > 0 && <div aria-hidden="true" className="mx-3 mb-2 border-t border-slate-200 dark:border-slate-800" />
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.sections.map((section) => (
                <SectionButton
                  key={section.id}
                  section={section}
                  active={section.id === active}
                  collapsed={collapsed}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <p className="border-t border-slate-200/80 px-4 py-3 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
          AI insights, not investment advice.
        </p>
      )}
    </aside>
  );
}

/** The same switcher for phones and tablets, where a rail would eat too much of the screen. */
export function DashboardSectionTabs({ active, onSelect }: NavProps) {
  return (
    <nav
      aria-label="Dashboard sections (compact)"
      // Runs to `lg` to meet the rail: see the note on DashboardSidebar for why 640-1024px keeps
      // the compact switcher rather than the rail.
      // bleed-gutter/gutter rather than `-mx-4 px-4`: the pills scroll edge to edge, and that only
      // lines up with the page's padding if it cancels the same value the page actually used.
      className="bleed-gutter gutter flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none]"
    >
      {DASHBOARD_GROUPS.flatMap((group, index) => [
        // The same grouping as the rail, flattened into the scroller so a reader swiping through
        // eighteen pills still knows which family they are in.
        <span
          key={group.key}
          className={`shrink-0 self-center whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 ${
            index > 0 ? "pl-2" : ""
          }`}
        >
          {group.label}
        </span>,
        ...group.sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === active;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-transparent bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_12px_26px_-16px_rgba(5,150,105,0.95)]"
                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          );
        }),
      ])}
    </nav>
  );
}
