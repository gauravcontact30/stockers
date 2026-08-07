"use client";

import { useCallback, useRef, useSyncExternalStore, type ReactElement } from "react";

type IconProps = { className?: string };

/** Every AI surface the dashboard hosts. */
export type AiSectionId =
  | "market-pulse"
  | "top-picks"
  | "buy-tomorrow"
  | "dip-winners"
  | "research"
  | "compare"
  | "etf-research";

export type DashboardSectionId = "overview" | AiSectionId;

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
   * and the server withholds just the AI narrative.
   */
  gate?: boolean;
};

export type DashboardSection = (SectionChrome & { id: "overview" }) | AiSection;

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

function ChevronIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

const OVERVIEW_SECTION: DashboardSection = {
  id: "overview",
  label: "Overview",
  description: "Research any stock and keep an eye on your watchlist.",
  icon: OverviewIcon,
};

/** Keyed by id so the dashboard can look one up without a runtime "not found" fallback. */
export const AI_SECTIONS: Record<AiSectionId, AiSection> = {
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
    label: "Buy Tomorrow",
    description: "Names set up for tomorrow's session, scored overnight.",
    icon: CalendarIcon,
    feature: "buy-tomorrow",
    featureLabel: "Buy tomorrow screener",
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
};

/** The overview first, then every AI section, in sidebar order. */
export const DASHBOARD_SECTIONS: DashboardSection[] = [OVERVIEW_SECTION, ...Object.values(AI_SECTIONS)];

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

/**
 * The dashboard's section switcher: full-width labels when expanded, an icon rail with hover
 * tooltips when collapsed. The choice is remembered across visits.
 */
export function DashboardSidebar({ active, onSelect }: NavProps) {
  const [collapsed, setCollapsed] = useCollapsedPreference();

  return (
    <aside
      data-collapsed={String(collapsed)}
      className={`sticky top-0 z-30 hidden h-[100dvh] shrink-0 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-[width] duration-300 ease-out sm:flex dark:border-slate-800 dark:bg-slate-900/95 ${
        collapsed ? "w-[76px]" : "w-[268px]"
      }`}
    >
      <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />

      <div className={`flex items-center gap-2 border-b border-slate-200/80 px-3 py-4 dark:border-slate-800 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">Stockers.AI</p>
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
        {DASHBOARD_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === active;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-label={section.label}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                collapsed ? "justify-center" : ""
              } ${
                isActive
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
                  isActive ? "h-0" : "h-0 group-hover:h-6"
                }`}
              />

              <Icon
                className={`relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "text-white" : "text-slate-400 group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-300"
                }`}
              />

              {!collapsed && <span className="relative min-w-0 flex-1 truncate">{section.label}</span>}
              {!collapsed && isActive && <span aria-hidden="true" className="relative h-1.5 w-1.5 shrink-0 rounded-full bg-white/90" />}

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
        })}
      </nav>

      {!collapsed && (
        <p className="border-t border-slate-200/80 px-4 py-3 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
          AI insights, not investment advice.
        </p>
      )}
    </aside>
  );
}

/** The same switcher for phones, where a rail would eat too much of the screen. */
export function DashboardSectionTabs({ active, onSelect }: NavProps) {
  return (
    <nav
      aria-label="Dashboard sections (compact)"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden [scrollbar-width:none]"
    >
      {DASHBOARD_SECTIONS.map((section) => {
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
      })}
    </nav>
  );
}
