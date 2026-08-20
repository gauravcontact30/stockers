"use client";

import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GatedSection } from "./ai-gate";
import { AiIntelSearch } from "./ai-intel-search";
import { AiStockCompare } from "./ai-stock-compare";
import { AiVerdictPanel } from "./ai-verdict-panel";
import { BseStockDirectory } from "./bse-stock-directory";
import { BuyTomorrowPicks } from "./buy-tomorrow-picks";
import { OverviewHeader } from "./dashboard-overview";
import {
  DashboardSectionTabs,
  DashboardSidebar,
  isAiSection,
  isDashboardSectionId,
  SECTION_BY_ID,
  type AiSectionId,
  type DashboardSection,
  type DashboardSectionId,
} from "./dashboard-sidebar";
import { DipWinners } from "./dip-winners";
import { DividendBoard } from "./dividend-board";
import { EtfBoard } from "./etf-board";
import { EtfResearch } from "./etf-research";
import { GettingStarted } from "./getting-started";
import { IpoListings } from "./ipo-listings";
import { LandingResearch } from "./landing-research";
import { MarketPulse } from "./market-pulse";
import { MostTraded } from "./most-traded";
import { MtfTraded } from "./mtf-traded";
import { PlanPill } from "./plan-pill";
import { PortfolioWorkspace } from "./portfolio-workspace";
import { SectorShowdowns } from "./sector-showdowns";
import { SectorTrends } from "./sector-trends";
import { StocksInNews } from "./stocks-in-news";
import { TrialStatusCard } from "./trial-status-card";
import { TopPicksToday } from "./top-picks-today";
import { TripleCompare } from "./triple-compare";
import { syncSessionCookie, useSubscription } from "./subscription-provider";
import { WatchlistCard } from "./watchlist-card";
import { tierForPlan } from "../lib/plan-tiers";
import { dashboardSectionIdFromPath, dashboardSectionPath } from "../lib/section-routes";
import { track } from "../lib/track";

type UserData = {
  id: string;
  name: string;
  email: string;
  plan: string;
};

// Reads the stored session after hydration. SSR cannot see localStorage, so the first render keeps
// the server and client markup identical and avoids React hydration mismatches.
function readStoredUser(): UserData | null {
  // Only reachable during real server-side rendering (no `window` global); a jsdom-based test
  // environment always provides `window`, so this branch can't be exercised from Jest.
  /* istanbul ignore next */
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem("stockers-auth");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw).user ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The open section lives in the URL
// ---------------------------------------------------------------------------
// New links use crawlable paths such as /dashboard/top-picks. Hash URLs still read correctly so
// old bookmarks and shared links do not break.

const hashListeners = new Set<() => void>();

function subscribeToSection(listener: () => void) {
  hashListeners.add(listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    hashListeners.delete(listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

function readSectionFromLocation(fallback: DashboardSectionId): DashboardSectionId {
  const hash = window.location.hash.replace("#", "");
  if (isDashboardSectionId(hash)) return hash;

  const pathSection = dashboardSectionIdFromPath(window.location.pathname);
  return pathSection && isDashboardSectionId(pathSection) ? pathSection : fallback;
}

/* istanbul ignore next -- only called while hydrating server-rendered HTML, which jsdom never does. */
const sectionOnServer = (initialSection: DashboardSectionId) => () => initialSection;

function openSection(id: DashboardSectionId) {
  // Which sections people actually open is what the dashboard's own shape should be argued from,
  // and a hash change is not a page view — without this the admin's traffic report would show one
  // visit to /dashboard and nothing about what happened inside it.
  track("nav.section", id);
  // pushState would make every sidebar click a history entry to walk back through. The selected
  // dashboard surface is a bookmarkable URL, so it replaces instead. No event fires for that, hence
  // the manual notify.
  window.history.replaceState(null, "", dashboardSectionPath(id));
  hashListeners.forEach((listener) => listener());
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * The heading and paywall around whichever section is open.
 *
 * Only sections with an AI layer are gated, and the exchange boards set `gate: false` so their
 * public market data still renders for a lapsed reader — the lock lands on the AI panels alone.
 */
function SectionShell({ section, children }: { section: DashboardSection; children: ReactElement }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{section.label}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
      </div>
      {isAiSection(section) ? (
        <GatedSection feature={section.feature} label={section.featureLabel}>
          {children}
        </GatedSection>
      ) : (
        children
      )}
    </div>
  );
}

const OVERVIEW_ACTIONS: { section: DashboardSectionId; label: string; detail: string }[] = [
  {
    section: "intel",
    label: "AI Intelligence Search",
    detail: "Ask a cross-market question from the dedicated intelligence workspace.",
  },
  {
    section: "research",
    label: "Stock Research",
    detail: "Open ticker search, measured outlooks and the full AI report modal.",
  },
  {
    section: "market-pulse",
    label: "Market Pulse",
    detail: "Check live breadth, index tone, movers and the market read.",
  },
  {
    section: "top-picks",
    label: "Top Picks",
    detail: "Review the current AI-ranked ideas from the live market universe.",
  },
  {
    section: "stock-news",
    label: "Stocks in News",
    detail: "Scan company-linked exchange news in its own board.",
  },
  {
    section: "portfolio",
    label: "Portfolio",
    detail: "Screen holdings, risk and allocation from the portfolio workspace.",
  },
];

function OverviewActions({ onOpen }: { onOpen: (section: DashboardSectionId) => void }) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-900">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Workspace</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Open one live tool at a time</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          The overview links into live sections instead of mounting duplicate AI panels and market feeds on page load.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {OVERVIEW_ACTIONS.map((action) => (
          <button
            key={action.section}
            type="button"
            onClick={() => onOpen(action.section)}
            className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
          >
            <span className="block text-sm font-semibold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
              {action.label}
            </span>
            <span className="mt-1.5 block text-sm leading-relaxed text-slate-500 dark:text-slate-400">{action.detail}</span>
            <span className="mt-3 inline-flex text-xs font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              Open {action.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DashboardClient({ initialSection = "overview" }: { initialSection?: DashboardSectionId }) {
  const router = useRouter();
  const { refresh: refreshSubscription, status: subscriptionStatus } = useSubscription();
  const [user, setUser] = useState<UserData | null>(null);
  // Reading the URL through useSyncExternalStore keeps the server and first client render in
  // agreement, then resyncs to the real URL right after hydration.
  const section = useSyncExternalStore(
    subscribeToSection,
    () => readSectionFromLocation(initialSection),
    sectionOnServer(initialSection),
  );
  useEffect(() => {
    const stored = readStoredUser();
    setUser(stored);
    if (!stored) {
      router.replace("/signin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stored session is a hydration-time read; later auth changes go through logout/sign-in flows.
  }, []);

  const logout = () => {
    // Reported before the session is torn down, while the server can still tell whose it was.
    track("auth.logout");
    window.localStorage.removeItem("stockers-auth");
    // The token is mirrored into a cookie that the server reads on every gated request, so
    // clearing only localStorage left the session live: the browser kept sending the cookie and
    // the API kept answering as the signed-in user. syncSessionCookie expires it once the stored
    // token is gone, and the refresh drops the cached status the UI is still rendering from.
    syncSessionCookie();
    void refreshSubscription();
    router.push("/");
  };

  // The tier the server actually grants, not the plan on the account record. During the free trial
  // those disagree on purpose: nothing has been bought, so the record holds no plan, while access
  // runs at Elite for the length of the trial. Reading the record here badged a trial user "Starter" and made
  // the trial look like the cheapest plan rather than the whole product.
  const displayTier = subscriptionStatus?.tier ?? tierForPlan(user?.plan);

  const overview = (
    <div className="flex flex-col gap-6">
      <OverviewHeader name={user?.name || "investor"} />
      <OverviewActions onOpen={openSection} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.8fr]">
        <GatedSection feature="research" label="AI stock research">
          <AiVerdictPanel section="overview" />
        </GatedSection>
        <WatchlistCard />
      </div>
    </div>
  );

  // Only the open section is mounted: each AI panel fetches its own live data, so rendering all
  // of them at once would fire every market endpoint on page load.
  const aiPanels: Record<AiSectionId, ReactElement> = {
    portfolio: <PortfolioWorkspace />,
    intel: <AiIntelSearch />,
    "market-pulse": <MarketPulse />,
    "top-picks": <TopPicksToday />,
    "buy-tomorrow": <BuyTomorrowPicks />,
    "dip-winners": <DipWinners />,
    research: <LandingResearch />,
    compare: (
      <div className="flex flex-col gap-6">
        <SectorShowdowns />
        <TripleCompare />
        <AiStockCompare />
      </div>
    ),
    "etf-research": <EtfResearch />,
    directory: <BseStockDirectory />,
    sectors: <SectorTrends />,
    "most-traded": <MostTraded />,
    mtf: <MtfTraded />,
    "stock-news": <StocksInNews />,
    dividends: <DividendBoard />,
    ipos: <IpoListings />,
    "etf-board": <EtfBoard />,
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#f8fafc_0%,_#f3f4f6_100%)] text-slate-700 transition-colors dark:bg-slate-950 dark:bg-none dark:text-slate-300">
      <div className="flex">
        <DashboardSidebar active={section} onSelect={openSection} />

        <div className="gutter min-w-0 flex-1 py-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6">
            <header className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] transition-colors md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">StockersAI</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Investor intelligence dashboard</h1>
                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
                  Research stocks with AI-backed insights, monitor the latest market narrative, and compare the positives and negatives before you act.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <p className="font-semibold">Signed in as {user?.name || "investor"}</p>
                  <p className="mt-2 flex items-center gap-2">
                    <span>Plan:</span>
                    <PlanPill tier={displayTier} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {/* Only an admin can open /admin — the page and its API both refuse anyone else —
                      so the link is shown only to the people it will actually work for. */}
                  {subscriptionStatus?.isAdmin && (
                    <Link
                      href="/console"
                      className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
                    >
                      Manage users
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </header>

            {/* Above the section tabs, so it is read before the reader goes looking for a feature
                that may be about to lock. Draws nothing for an admin. */}
            <TrialStatusCard />

            <DashboardSectionTabs active={section} onSelect={openSection} />

            {section === "overview" ? (
              overview
            ) : (
              <SectionShell section={SECTION_BY_ID[section]}>
                {section === "support" ? (
                  <GettingStarted onOpen={openSection} />
                ) : (
                  <div className="flex flex-col gap-6">
                    {section !== "compare" && <AiVerdictPanel section={section} />}
                    {aiPanels[section]}
                  </div>
                )}
              </SectionShell>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
