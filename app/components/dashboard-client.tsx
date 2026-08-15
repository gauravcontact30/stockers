"use client";

import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal-lazy";
import { GatedSection } from "./ai-gate";
import { AiVerdictPanel } from "./ai-verdict-panel";
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
import { PlanPill } from "./plan-pill";
import { TrialStatusCard } from "./trial-status-card";
import { PredictionPanel } from "./prediction-panel";
import { fetchResearch } from "./research-cache";
import { StockExplorer } from "./stock-explorer";
import { syncSessionCookie, useSubscription } from "./subscription-provider";
import { WatchlistCard } from "./watchlist-card";
import { indianStocks } from "../lib/indian-stocks";
import { tierForPlan } from "../lib/plan-tiers";
import { dashboardSectionIdFromPath, dashboardSectionPath } from "../lib/section-routes";
import { track } from "../lib/track";
import { stockIcon } from "../lib/company-logos";

function PanelLoader() {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-900">
      <div className="h-5 w-48 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

const AiIntelSearch = dynamic(() => import("./ai-intel-search").then((module) => module.AiIntelSearch), { loading: PanelLoader });
const AiStockCompare = dynamic(() => import("./ai-stock-compare").then((module) => module.AiStockCompare), { loading: PanelLoader });
const BseStockDirectory = dynamic(() => import("./bse-stock-directory").then((module) => module.BseStockDirectory), { loading: PanelLoader });
const BuyTomorrowPicks = dynamic(() => import("./buy-tomorrow-picks").then((module) => module.BuyTomorrowPicks), { loading: PanelLoader });
const DipWinners = dynamic(() => import("./dip-winners").then((module) => module.DipWinners), { loading: PanelLoader });
const DividendBoard = dynamic(() => import("./dividend-board").then((module) => module.DividendBoard), { loading: PanelLoader });
const EtfBoard = dynamic(() => import("./etf-board").then((module) => module.EtfBoard), { loading: PanelLoader });
const EtfResearch = dynamic(() => import("./etf-research").then((module) => module.EtfResearch), { loading: PanelLoader });
const GettingStarted = dynamic(() => import("./getting-started").then((module) => module.GettingStarted), { loading: PanelLoader });
const IpoListings = dynamic(() => import("./ipo-listings").then((module) => module.IpoListings), { loading: PanelLoader });
const LandingResearch = dynamic(() => import("./landing-research").then((module) => module.LandingResearch), { loading: PanelLoader });
const MarketNews = dynamic(() => import("./market-news").then((module) => module.MarketNews), { loading: PanelLoader });
const MarketPulse = dynamic(() => import("./market-pulse").then((module) => module.MarketPulse), { loading: PanelLoader });
const MostTraded = dynamic(() => import("./most-traded").then((module) => module.MostTraded), { loading: PanelLoader });
const MtfTraded = dynamic(() => import("./mtf-traded").then((module) => module.MtfTraded), { loading: PanelLoader });
const PortfolioWorkspace = dynamic(() => import("./portfolio-workspace").then((module) => module.PortfolioWorkspace), { loading: PanelLoader });
const SectorShowdowns = dynamic(() => import("./sector-showdowns").then((module) => module.SectorShowdowns), { loading: PanelLoader });
const SectorTrends = dynamic(() => import("./sector-trends").then((module) => module.SectorTrends), { loading: PanelLoader });
const StocksInNews = dynamic(() => import("./stocks-in-news").then((module) => module.StocksInNews), { loading: PanelLoader });
const TopPicksToday = dynamic(() => import("./top-picks-today").then((module) => module.TopPicksToday), { loading: PanelLoader });
const TripleCompare = dynamic(() => import("./triple-compare").then((module) => module.TripleCompare), { loading: PanelLoader });

type UserData = {
  id: string;
  name: string;
  email: string;
  plan: string;
};

// Reads the session synchronously on the client so the dashboard never renders
// a flash of empty state; on the server this always returns null (no window).
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

export function DashboardClient({ initialSection = "overview" }: { initialSection?: DashboardSectionId }) {
  const router = useRouter();
  const { refresh: refreshSubscription, status: subscriptionStatus } = useSubscription();
  const [user] = useState<UserData | null>(readStoredUser);
  // Reading the URL through useSyncExternalStore keeps the server and first client render in
  // agreement, then resyncs to the real URL right after hydration.
  const section = useSyncExternalStore(
    subscribeToSection,
    () => readSectionFromLocation(initialSection),
    sectionOnServer(initialSection),
  );
  const [stock, setStock] = useState("RELIANCE");
  const [selectedSymbol, setSelectedSymbol] = useState("RELIANCE");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/signin");
    }
  }, [user, router]);

  /** The deep read of one stock: opens the report, then fills it in when the desk answers. */
  const runAnalysis = async (symbol: string) => {
    setStock(symbol);
    setLoading(true);
    setMessage(null);
    setModalOpen(true);
    setSelectedSymbol(symbol.toUpperCase());
    // The deep read is the most expensive thing the desk does, so which names people spend it on
    // is worth knowing separately from which ones they merely glanced at.
    track("ai.report", symbol.toUpperCase());

    const data = await fetchResearch(symbol);
    setLoading(false);
    setAnalysis(data);
    setMessage(`Analysis ready for ${data.stock}.`);
  };

  const handleAnalyze = (event: React.FormEvent) => {
    event.preventDefault();
    return runAnalysis(stock);
  };

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

  const analysisMeta = analysis ? indianStocks.find((s) => s.symbol === analysis.stock) : undefined;
  // The tier the server actually grants, not the plan on the account record. During the free trial
  // those disagree on purpose: nothing has been bought, so the record holds no plan, while access
  // runs at Elite for the length of the trial. Reading the record here badged a trial user "Starter" and made
  // the trial look like the cheapest plan rather than the whole product.
  const displayTier = subscriptionStatus?.tier ?? tierForPlan(user?.plan);

  const overview = (
    <div className="flex flex-col gap-6">
      <OverviewHeader name={user?.name || "investor"} />
      {/* The one place a reader can ask their own question rather than pick one of ours, so it
          sits above the standing panels rather than under them. The same panel has a section of
          its own in the rail for anyone who came here to do nothing else. */}
      <GatedSection feature="intel" label="AI intelligence search">
        <AiIntelSearch />
      </GatedSection>
      <GatedSection feature="research" label="AI stock research">
        <AiVerdictPanel section="overview" />
      </GatedSection>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <GatedSection feature="research" label="AI stock research">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">AI research</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Analyze a stock</h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Name a company, a ticker or a scrip code. The report that comes back is scored from measured returns —
            the model writes the reasoning, not the call.
          </p>
        </div>

        {/* Picking from the catalogue runs the analysis straight away — the extra click on
            "Research stock" said nothing the selection had not already said. */}
        <div className="mt-6">
          <StockExplorer selected={selectedSymbol} onSelect={runAnalysis} />
        </div>

        <form onSubmit={handleAnalyze} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={stock}
            onChange={(event) => setStock(event.target.value)}
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="e.g. HDFC BANK"
          />
          <button
            type="submit"
            className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500"
          >
            {loading ? "Researching..." : "Research stock"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>}

        <div className="mt-6">
          <PredictionPanel symbol={selectedSymbol} />
        </div>

        {analysis && (
          <div>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{analysis.summary}</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              View full AI report
            </button>
          </div>
        )}
      </section>
      </GatedSection>

      <aside className="space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">What StockersAI watches</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <li>• Earnings momentum and guidance changes</li>
            <li>• FII/DII flow and macro sentiment</li>
            <li>• Policy headlines and sector rotation</li>
            <li>• Technical breakout and support levels</li>
          </ul>
        </div>
        <WatchlistCard />
      </aside>
      </div>

      {/* News is a grid of cards with its own pager now, so it gets the full width rather than
          being squeezed into the sidebar column it used to share. */}
      <GatedSection feature="news" label="AI market news">
        <MarketNews />
      </GatedSection>

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

      <AiReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={loading}
        analysis={analysis}
        logoUrl={analysisMeta ? stockIcon(analysisMeta.symbol, analysisMeta.domain) : undefined}
        companyName={analysisMeta?.name}
      />
    </div>
  );
}
