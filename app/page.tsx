import Link from "next/link";
import { BackToTop } from "./components/back-to-top";
import { BseMarketBoard } from "./components/bse-market-board";
import { BseStockDirectory } from "./components/bse-stock-directory";
import { DividendBoard } from "./components/dividend-board";
import { EtfBoard } from "./components/etf-board";
import { HeroCarousel } from "./components/hero-carousel";
import { IpoListings } from "./components/ipo-listings";
import { Logo } from "./components/logo";
import { MobileNav } from "./components/mobile-nav";
import { MostTraded } from "./components/most-traded";
import { MtfTraded } from "./components/mtf-traded";
import { SectorTrends } from "./components/sector-trends";
import { SiteFooter } from "./components/site-footer";
import { StocksInNews } from "./components/stocks-in-news";
import { SubscriptionBadge } from "./components/subscription-reminder";
import { SupportSection } from "./components/support-section";
import { ThemeToggle } from "./components/theme-toggle";

const pricing = [
  {
    name: "Starter",
    price: "₹499",
    period: "/month",
    features: ["3 AI stock scans", "Daily market pulse", "Basic sentiment board"],
  },
  {
    name: "Pro",
    price: "₹1499",
    period: "/month",
    featured: true,
    features: ["Unlimited stock research", "Positive/negative news tracker", "Priority alerts"],
  },
  {
    name: "Elite",
    price: "₹4999",
    period: "/year",
    features: ["Annual insights bundle", "Advanced prediction view", "Dedicated investor workspace"],
  },
];

const navLinks = [
  { href: "#bse-board", label: "BSE Board" },
  { href: "#bse-directory", label: "Companies" },
  { href: "#sectors", label: "Sectors" },
  { href: "#most-traded", label: "Most Traded" },
  { href: "#mtf", label: "MTF" },
  { href: "/news", label: "News" },
  { href: "#stocks-in-news", label: "Stock News" },
  { href: "#dividends", label: "Dividends" },
  { href: "#ipos", label: "IPOs" },
  { href: "#most-bought-etfs", label: "ETFs" },
  { href: "#pricing", label: "Pricing" },
  { href: "/dashboard", label: "AI Dashboard" },
];

// Coverage claims worth stating up front: each one is what the sections below actually deliver.
const coverage = [
  { figure: "4,900+", label: "BSE-listed companies", note: "Every active equity on the exchange" },
  { figure: "Top 10", label: "Gainers & losers", note: "Whole market and per cap tier" },
  { figure: "SEBI", label: "Cap classification", note: "Top 100 large · next 150 mid · rest small" },
  { figure: "Official", label: "Exchange sources", note: "BSE scrip master, Bhavcopy and NSE feeds" },
];

// The AI surfaces now live in the signed-in dashboard; the landing page points at them by name so
// a visitor can still see what they get, and land directly on the one they came for.
const aiFeatures = [
  { href: "/dashboard#market-pulse", label: "AI market pulse", blurb: "Live breadth and indices with an AI read on the day's mood." },
  { href: "/dashboard#top-picks", label: "Today's AI picks", blurb: "The stocks our agent rates highest right now." },
  { href: "/dashboard#buy-tomorrow", label: "Buy tomorrow", blurb: "Names set up for tomorrow's session, scored overnight." },
  { href: "/dashboard#dip-winners", label: "Dip winners", blurb: "Quality stocks trading below their recent range." },
  { href: "/dashboard#research", label: "AI stock research", blurb: "A deep dive with predictions and news sentiment." },
  { href: "/dashboard#compare", label: "AI stock compare", blurb: "Two stocks head to head, with an AI verdict." },
  { href: "/dashboard#etf-research", label: "AI ETF research", blurb: "Every major Indian ETF, decoded by AI." },
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
      <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-900/80">
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

      <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <HeroCarousel />
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {coverage.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur transition hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-sky-500/40"
            >
              <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{item.figure}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{item.note}</p>
            </div>
          ))}
        </section>

        <BandHeading
          eyebrow="01 · The exchange, end to end"
          title="BSE market research"
          blurb="The full listed universe, the session's biggest moves in both directions, and a company lookup — sourced from the exchange's own files."
        />

        <BseMarketBoard />

        <BseStockDirectory />

        <BandHeading
          eyebrow="02 · Around the market"
          title="Sectors, flows, news and issues"
          blurb="Where money rotated, what traded heaviest, which companies made news, and what is coming to market."
        />

        <div className="scroll-mt-28">
          <SectorTrends />
        </div>

        <div className="scroll-mt-28">
          <MostTraded />
        </div>

        <div className="scroll-mt-28">
          <MtfTraded />
        </div>

        <div className="scroll-mt-28">
          <StocksInNews />
        </div>

        <div className="scroll-mt-28">
          <DividendBoard />
        </div>

        <div id="ipos" className="scroll-mt-28">
          <IpoListings />
        </div>

        <div className="scroll-mt-28">
          <EtfBoard />
        </div>

        <BandHeading
          eyebrow="03 · Where the AI lives"
          title="Your signed-in workspace"
          blurb="Everything above is exchange data, free and open. The AI screeners, research and comparisons run in the dashboard."
        />

        <section id="ai" className="scroll-mt-28 overflow-hidden rounded-[32px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-[0_20px_60px_-30px_rgba(5,150,105,0.45)] transition-colors sm:p-8 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">AI workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Seven AI tools, one dashboard</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Picks, screeners, research and head-to-head comparisons sit side by side in a signed-in workspace, each on its
                own tab.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
            >
              Open AI dashboard →
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-emerald-500/40"
              >
                <p className="text-sm font-semibold text-slate-900 transition group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                  {feature.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{feature.blurb}</p>
              </Link>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-28 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Pricing</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Flexible plans for every investor</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Flexible monthly and yearly options for every investing style.</p>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-3xl border p-6 transition-colors ${
                  plan.featured
                    ? "border-emerald-300 bg-emerald-50 shadow-[0_20px_40px_-25px_rgba(5,150,105,0.5)] dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 right-6 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <p className="text-xl font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-semibold text-emerald-600 dark:text-emerald-400">{plan.price}</span>
                  <span className="pb-1 text-slate-500 dark:text-slate-400">{plan.period}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <Link href="/signup" className="mt-6 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                  Choose {plan.name}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div id="support" className="scroll-mt-28">
          <SupportSection />
        </div>

        <SiteFooter />
      </div>
      </div>

      <BackToTop />
    </main>
  );
}
