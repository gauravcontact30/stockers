export type HomeSectionId =
  | "head-to-head"
  | "live-market"
  | "bse-movers"
  | "bse-sectors"
  | "ownership"
  | "accuracy"
  | "pricing";

export type HomeSectionRoute = {
  id: HomeSectionId;
  path: string;
  label: string;
  title: string;
  description: string;
  keywords: string[];
};

export const HOME_SECTION_ROUTES: HomeSectionRoute[] = [
  {
    id: "head-to-head",
    path: "/beat-the-ai",
    label: "Beat the AI",
    title: "Beat the AI stock picker",
    description: "Pick Indian stocks against StockersAI and compare performance with AI-selected BSE ideas.",
    keywords: ["AI stock picker India", "Indian stock picking game", "BSE AI stock picks", "beat AI stocks"],
  },
  {
    id: "live-market",
    path: "/live-market",
    label: "Live market",
    title: "Live BSE market dashboard",
    description: "Track live BSE market breadth, indices, movers and weekly performance in one Indian market dashboard.",
    keywords: ["live BSE market", "BSE market dashboard", "BSE market breadth", "live Indian stock market"],
  },
  {
    id: "bse-movers",
    path: "/bse-gainers-losers",
    label: "Gainers & Losers",
    title: "BSE gainers and losers",
    description: "See every BSE gainer and loser by market cap tier, move size and performance window.",
    keywords: ["BSE gainers today", "BSE losers today", "BSE top movers", "BSE stock performance"],
  },
  {
    id: "bse-sectors",
    path: "/bse-sectors",
    label: "BSE sectors",
    title: "BSE sector movers",
    description: "Compare BSE sector performance and category rotation across Indian stocks.",
    keywords: ["BSE sectors", "BSE sector movers", "Indian sector rotation", "sector performance India"],
  },
  {
    id: "ownership",
    path: "/shareholding",
    label: "Shareholding",
    title: "BSE shareholding and promoter ownership",
    description: "Research promoter, FPI, DII, government and public ownership for BSE-listed companies.",
    keywords: ["BSE shareholding pattern", "promoter holding India", "FPI DII holdings", "public shareholding India"],
  },
  {
    id: "accuracy",
    path: "/accuracy",
    label: "Accuracy",
    title: "StockersAI accuracy and measured returns",
    description: "Review measured stock return windows and accuracy signals behind StockersAI research.",
    keywords: ["stock prediction accuracy India", "AI stock accuracy", "measured stock returns", "StockersAI accuracy"],
  },
  {
    id: "pricing",
    path: "/pricing",
    label: "Pricing",
    title: "StockersAI pricing",
    description: "Compare StockersAI plans for AI Indian stock research, BSE screens, IPOs, ETFs and market intelligence.",
    keywords: ["StockersAI pricing", "AI stock research subscription India", "Indian stock research plans", "BSE screener pricing"],
  },
];

const homeSectionByPath = new Map(HOME_SECTION_ROUTES.map((route) => [route.path, route]));

export function homeSectionPath(id: HomeSectionId): string {
  return HOME_SECTION_ROUTES.find((route) => route.id === id)?.path ?? "/";
}

export function homeSectionRouteByPath(path: string): HomeSectionRoute | undefined {
  return homeSectionByPath.get(path);
}

export type DashboardSectionRoute = {
  id: string;
  slug: string;
  path: string;
  label: string;
  title: string;
  description: string;
};

export const DASHBOARD_SECTION_ROUTES: DashboardSectionRoute[] = [
  {
    id: "overview",
    slug: "",
    path: "/overview",
    label: "Overview",
    title: "AI research dashboard",
    description: "The signed-in StockersAI workspace for Indian equity research, market screens, stock comparisons and AI analysis.",
  },
  {
    id: "portfolio",
    slug: "portfolio",
    path: "/portfolio",
    label: "My Portfolio",
    title: "AI portfolio dashboard",
    description: "Track your Indian stock holdings against live market data with an AI read on the portfolio mix.",
  },
  {
    id: "intel",
    slug: "intelligence-search",
    path: "/intelligence-search",
    label: "Intelligence Search",
    title: "AI intelligence search",
    description: "Ask questions about BSE-listed companies and get sourced StockersAI answers inside the dashboard.",
  },
  {
    id: "market-pulse",
    slug: "market-pulse",
    path: "/market-pulse",
    label: "Market Pulse",
    title: "AI market pulse",
    description: "Live market breadth, indices and movers with the StockersAI read on the session.",
  },
  {
    id: "top-picks",
    slug: "top-picks",
    path: "/top-picks",
    label: "Top Picks",
    title: "AI top stock picks",
    description: "The Indian stocks StockersAI rates highest for the current session.",
  },
  {
    id: "buy-tomorrow",
    slug: "outperform-tomorrow",
    path: "/outperform-tomorrow",
    label: "Outperform Tomorrow",
    title: "Stocks to watch tomorrow",
    description: "Names set up for tomorrow's Indian market session, scored by StockersAI.",
  },
  {
    id: "dip-winners",
    slug: "dip-winners",
    path: "/dip-winners",
    label: "Dip Winners",
    title: "AI dip winners screener",
    description: "Quality Indian stocks trading below their recent range, screened by StockersAI.",
  },
  {
    id: "research",
    slug: "stock-research",
    path: "/stock-research",
    label: "Stock Research",
    title: "AI stock research",
    description: "Run AI stock research on Indian companies with live market data and StockersAI verdicts.",
  },
  {
    id: "compare",
    slug: "compare-stocks",
    path: "/compare-stocks",
    label: "Compare",
    title: "AI stock comparison",
    description: "Compare two or three Indian stocks and let StockersAI explain which side looks stronger.",
  },
  {
    id: "etf-research",
    slug: "etf-research",
    path: "/etf-research",
    label: "ETF Research",
    title: "AI ETF research",
    description: "Browse Indian ETFs and get StockersAI research on any listed fund.",
  },
  {
    id: "directory",
    slug: "company-directory",
    path: "/company-directory",
    label: "Company Directory",
    title: "BSE company directory",
    description: "Search BSE-listed companies and open StockersAI verdicts from the company directory.",
  },
  {
    id: "sectors",
    slug: "sector-trends",
    path: "/sector-trends",
    label: "Sector Trends",
    title: "Indian sector trends",
    description: "Track sector rotation across Indian indices with StockersAI market context.",
  },
  {
    id: "most-traded",
    slug: "most-traded",
    path: "/most-traded",
    label: "Most Traded",
    title: "Most traded Indian stocks",
    description: "See the heaviest traded Indian stocks and the StockersAI read on turnover.",
  },
  {
    id: "mtf",
    slug: "mtf-watch",
    path: "/mtf-watch",
    label: "MTF Watch",
    title: "MTF stock watch",
    description: "Review most-traded margin stocks and the leverage context behind them.",
  },
  {
    id: "stock-news",
    slug: "stocks-in-news",
    path: "/stocks-in-news",
    label: "Stocks in News",
    title: "Stocks in news",
    description: "Read corporate filings and StockersAI highlights for Indian stocks in the news.",
  },
  {
    id: "dividends",
    slug: "dividends",
    path: "/dividends",
    label: "Dividends",
    title: "Dividend calendar",
    description: "Track declared dividends, ex-dates and StockersAI dividend context.",
  },
  {
    id: "ipos",
    slug: "ipos",
    path: "/ipos",
    label: "IPO Watch",
    title: "IPO watch",
    description: "Follow open, upcoming and closed Indian IPOs with live subscription figures and StockersAI notes.",
  },
  {
    id: "etf-board",
    slug: "etf-board",
    path: "/etf-board",
    label: "ETF Board",
    title: "Indian ETF board",
    description: "Rank Indian ETFs by asset class and money traded with StockersAI context.",
  },
  {
    id: "support",
    slug: "getting-started",
    path: "/getting-started",
    label: "Getting Started",
    title: "Dashboard getting started",
    description: "A guided tour of the StockersAI workspace and how to get support.",
  },
];

const dashboardRouteById = new Map(DASHBOARD_SECTION_ROUTES.map((route) => [route.id, route]));
const dashboardRouteBySlug = new Map(DASHBOARD_SECTION_ROUTES.filter((route) => route.slug).map((route) => [route.slug, route]));

/** Where the workspace sends somebody who has just signed in, and the fallback for an unknown id. */
export const DASHBOARD_HOME_PATH = "/overview";

/**
 * Every path the super-admin area occupies, and the reason this list has to exist.
 *
 * `app/(admin)` is a route group, so these pages no longer share a `/admin` prefix — the whole
 * point of the group is that the segment does not appear in the URL. Two things used to identify
 * an admin page by `pathname.startsWith("/admin")`: `VisitTracker` and `PresenceTracker`, both of
 * which exclude the admin's own tour of the site from the traffic figures so the person reading the
 * chart does not appear in it.
 *
 * With the prefix gone that test silently stops matching, and admin activity starts being counted
 * as public traffic — a bug that reports itself as plausible-looking numbers rather than as an
 * error. So membership is checked against this list instead, and `isAdminPath` is the only thing
 * either tracker should use.
 *
 * Kept beside the dashboard routes deliberately: the two namespaces are now flat and adjacent, and
 * the collision test in test/lib/route-collisions.test.ts reads both from here.
 */
export const ADMIN_ROUTE_PATHS = [
  "/console",
  "/analytics",
  "/ai",
  "/logs",
  "/users",
  "/subscriptions",
  "/reviews",
  "/features",
  "/cache",
  "/application",
] as const;

const adminPaths = new Set<string>(ADMIN_ROUTE_PATHS);

/** Whether a pathname is one of the super-admin pages. Query and trailing slash tolerant. */
export function isAdminPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return adminPaths.has(path);
}

export function dashboardSectionPath(id: string): string {
  return dashboardRouteById.get(id)?.path ?? DASHBOARD_HOME_PATH;
}

export function dashboardSectionRouteFromSlug(slug: string): DashboardSectionRoute | undefined {
  return dashboardRouteBySlug.get(slug);
}

/**
 * Which workspace section a URL is, now that the sections sit at the top level.
 *
 * The `/dashboard` prefix is gone — `app/(dashboard)` is a route group, so it organises the files
 * without appearing in the path. That means this can no longer recognise a section by its prefix
 * and has to match the path against the routes themselves, which is the honest way round anyway:
 * the list of sections is the thing that decides, not a string shape.
 *
 * A path that is not a section returns undefined, exactly as before — the marketing routes share
 * this namespace now, and `/pricing` is not a dashboard section.
 */
export function dashboardSectionIdFromPath(pathname: string): string | undefined {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return DASHBOARD_SECTION_ROUTES.find((route) => route.path === path)?.id;
}
