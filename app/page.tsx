import Link from "next/link";
import { BackToTop } from "./components/back-to-top";
import { BseMoversBoard } from "./components/bse-movers-board";
import { BseSectorMovers } from "./components/bse-sector-movers";
import { HeroCarousel } from "./components/hero-carousel";
import { Logo } from "./components/logo";
import { MobileNav } from "./components/mobile-nav";
import { PricingPlans } from "./components/pricing-plans";
import { SiteFooter } from "./components/site-footer";
import { SubscriptionBadge } from "./components/subscription-reminder";
import { ThemeToggle } from "./components/theme-toggle";

const navLinks = [
  { href: "#bse-movers", label: "Gainers & Losers" },
  { href: "#bse-sectors", label: "By Category" },
  { href: "#workspace", label: "Workspace" },
  { href: "/news", label: "News" },
  { href: "#pricing", label: "Pricing" },
  { href: "/dashboard#support", label: "Getting Started" },
  { href: "/dashboard", label: "AI Dashboard" },
];

// Every board now lives in the signed-in workspace, each with an AI layer on top of it. The
// landing page names them so a visitor can see what they get and land directly on the one they
// came for, rather than scrolling through a copy of the dashboard.
// Each card carries its own pale wash so the fifteen destinations read as fifteen places rather
// than one grid repeated. The tints are deliberately light — they tell cards apart at a glance
// without competing with the text sitting on them.
const CARD_TINTS = {
  emerald: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-400 dark:border-emerald-500/25 dark:bg-emerald-500/10",
  teal: "border-teal-200 bg-teal-50/70 hover:border-teal-400 dark:border-teal-500/25 dark:bg-teal-500/10",
  sky: "border-sky-200 bg-sky-50/70 hover:border-sky-400 dark:border-sky-500/25 dark:bg-sky-500/10",
  indigo: "border-indigo-200 bg-indigo-50/70 hover:border-indigo-400 dark:border-indigo-500/25 dark:bg-indigo-500/10",
  violet: "border-violet-200 bg-violet-50/70 hover:border-violet-400 dark:border-violet-500/25 dark:bg-violet-500/10",
  fuchsia: "border-fuchsia-200 bg-fuchsia-50/70 hover:border-fuchsia-400 dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10",
  rose: "border-rose-200 bg-rose-50/70 hover:border-rose-400 dark:border-rose-500/25 dark:bg-rose-500/10",
  amber: "border-amber-200 bg-amber-50/70 hover:border-amber-400 dark:border-amber-500/25 dark:bg-amber-500/10",
  lime: "border-lime-200 bg-lime-50/70 hover:border-lime-400 dark:border-lime-500/25 dark:bg-lime-500/10",
  cyan: "border-cyan-200 bg-cyan-50/70 hover:border-cyan-400 dark:border-cyan-500/25 dark:bg-cyan-500/10",
  orange: "border-orange-200 bg-orange-50/70 hover:border-orange-400 dark:border-orange-500/25 dark:bg-orange-500/10",
  blue: "border-blue-200 bg-blue-50/70 hover:border-blue-400 dark:border-blue-500/25 dark:bg-blue-500/10",
} as const;

const workspace = [
  {
    group: "AI screeners",
    tint: "text-emerald-600 dark:text-emerald-400",
    items: [
      { href: "/dashboard#intel", label: "Intelligence Search", blurb: "Ask anything about a BSE stock; get the answer in points, with sources.", tint: CARD_TINTS.lime },
      { href: "/dashboard#market-pulse", label: "Market Pulse", blurb: "Live indices and breadth with an AI read on the day's mood.", tint: CARD_TINTS.emerald },
      { href: "/dashboard#top-picks", label: "Top Picks", blurb: "The stocks our agent rates highest right now.", tint: CARD_TINTS.amber },
      { href: "/dashboard#buy-tomorrow", label: "Buy Tomorrow", blurb: "Names set up for tomorrow's session, scored overnight.", tint: CARD_TINTS.indigo },
      { href: "/dashboard#dip-winners", label: "Dip Winners", blurb: "Pullbacks whose longer trend is still intact.", tint: CARD_TINTS.rose },
      { href: "/dashboard#research", label: "Stock Research", blurb: "One company in depth, with predictions and news sentiment.", tint: CARD_TINTS.teal },
      { href: "/dashboard#compare", label: "Compare", blurb: "Two or three stocks head to head, with a call on each.", tint: CARD_TINTS.violet },
      { href: "/dashboard#etf-research", label: "ETF Research", blurb: "Every major Indian ETF, decoded by AI.", tint: CARD_TINTS.cyan },
    ],
  },
  {
    group: "Exchange boards",
    tint: "text-sky-600 dark:text-sky-400",
    items: [
      { href: "/dashboard#directory", label: "Company Directory", blurb: "All 4,900+ listed companies by name, ticker, code or ISIN.", tint: CARD_TINTS.sky },
      { href: "/dashboard#sectors", label: "Sector Trends", blurb: "Every NSE sectoral index, ranked by today's move.", tint: CARD_TINTS.lime },
      { href: "/dashboard#most-traded", label: "Most Traded", blurb: "Where the day's money actually went, by turnover.", tint: CARD_TINTS.blue },
      { href: "/dashboard#mtf", label: "MTF Watch", blurb: "Most-traded names you can buy on margin, and the cost.", tint: CARD_TINTS.orange },
      { href: "/dashboard#stock-news", label: "Stocks in News", blurb: "Today's corporate filings, grouped by sector.", tint: CARD_TINTS.fuchsia },
      { href: "/dashboard#dividends", label: "Dividends", blurb: "Declared payouts and the ex-dates still ahead of you.", tint: CARD_TINTS.teal },
      { href: "/dashboard#ipos", label: "IPO Watch", blurb: "Open and upcoming issues with live subscription figures.", tint: CARD_TINTS.indigo },
      { href: "/dashboard#etf-board", label: "ETF Board", blurb: "Every NSE ETF by asset class, ranked by money traded.", tint: CARD_TINTS.violet },
    ],
  },
];

/**
 * The divider between groups of sections.
 *
 * The page is a long stack of data cards; without a break between them a visitor has no sense of
 * where one subject ends and the next begins.
 */
function BandHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-8 lg:flex-row lg:items-end lg:justify-between dark:border-slate-800">
      <div className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-sky-600 dark:text-sky-400">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{blurb}</p>
      </div>
      <span aria-hidden="true" className="hidden h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent lg:mb-3 lg:ml-8 lg:block dark:from-slate-800" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      {/* px-safe sits on the bar rather than on the row inside it, so it adds to that row's
          padding instead of replacing it. The background still bleeds to the screen edge; only the
          controls move in, clear of a notched phone's rounded corners in landscape. */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 px-safe shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-900/80">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 xl:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-3">
            <Logo size={28} wordmarkClassName="text-sm" stacked gradientId="header-logo" />
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-full border border-slate-200/70 bg-slate-50/80 p-1 lg:flex dark:border-slate-800 dark:bg-slate-950/50 [scrollbar-width:thin]">
            {navLinks.map((link) => {
              // Same-page anchors stay plain <a> so the browser handles smooth scrolling;
              // links to another route go through Link for client-side navigation.
              const NavTag = link.href.startsWith("/") ? Link : "a";
              return (
                <NavTag
                  key={link.href}
                  href={link.href}
                  className="shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-slate-600 transition hover:bg-white hover:text-emerald-600 hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
                >
                  {link.label}
                </NavTag>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
            <SubscriptionBadge />
            <ThemeToggle />
            <Link href="/signin" className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-700 transition hover:bg-slate-100 sm:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] transition hover:from-emerald-500 hover:to-teal-500">
              Get started
            </Link>
            <MobileNav links={navLinks} />
          </div>
        </div>
      </header>

      {/* No top padding: the carousel is meant to sit flush under the navbar, and `py-6` was
          leaving a band of page background between the two. The bottom padding stays. */}
      <div className="gutter pb-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="bleed-gutter">
          <HeroCarousel />
        </div>

        <BandHeading
          eyebrow="01 · The session, both ways"
          title="Every gainer and every loser on the BSE"
          blurb="Two tabs over the whole exchange: everything that closed higher, and everything that closed lower. Each is paged on its own, in descending order of the move, and filters down to a single cap tier."
        />

        <BseMoversBoard />

        <BseSectorMovers />

        <BandHeading
          eyebrow="02 · Everything else, in one workspace"
          title="Seventeen boards behind one sidebar"
          blurb="The board above is the free sample. Company lookup, sector rotation, turnover, filings, dividends, IPOs and ETFs each live in the signed-in dashboard now — every one of them with an AI layer reading it for you."
        />

        <section id="workspace" className="scroll-mt-28 overflow-hidden rounded-[32px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-[0_20px_60px_-30px_rgba(5,150,105,0.45)] transition-colors sm:p-8 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">AI workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Pick a question, land on the board that answers it</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Screeners score stocks for you; exchange boards show you the market as the exchanges publish it. Every link
                below opens straight onto its own tab in the dashboard.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
            >
              Open AI dashboard →
            </Link>
          </div>

          {workspace.map((band) => (
            <div key={band.group} className="mt-6">
              <p className={`text-[11px] font-bold uppercase tracking-[0.28em] ${band.tint}`}>{band.group}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {band.items.map((feature) => (
                  <Link
                    key={feature.href}
                    href={feature.href}
                    className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.6)] ${feature.tint}`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{feature.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{feature.blurb}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <Link
            href="/dashboard#support"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-white dark:border-emerald-500/40 dark:bg-slate-950/50 dark:text-emerald-400"
          >
            New here? Start with the guided tour →
          </Link>
        </section>

        <PricingPlans />

        <SiteFooter />
      </div>
      </div>

      <BackToTop />
    </main>
  );
}
