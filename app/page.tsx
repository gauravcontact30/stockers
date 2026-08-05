import Link from "next/link";
import { AiStockCompare } from "./components/ai-stock-compare";
import { BackToTop } from "./components/back-to-top";
import { BuyTomorrowPicks } from "./components/buy-tomorrow-picks";
import { DipWinners } from "./components/dip-winners";
import { EtfResearch } from "./components/etf-research";
import { HeroCarousel } from "./components/hero-carousel";
import { IpoListings } from "./components/ipo-listings";
import { LandingResearch } from "./components/landing-research";
import { Logo } from "./components/logo";
import { MarketPulse } from "./components/market-pulse";
import { MobileNav } from "./components/mobile-nav";
import { SiteFooter } from "./components/site-footer";
import { SupportSection } from "./components/support-section";
import { ThemeToggle } from "./components/theme-toggle";
import { TopPicksToday } from "./components/top-picks-today";

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
  { href: "#market-pulse", label: "Market Pulse" },
  { href: "/news", label: "News" },
  { href: "#top-picks", label: "Top Picks" },
  { href: "#buy-tomorrow", label: "Buy Tomorrow" },
  { href: "#ipos", label: "IPOs" },
  { href: "#research", label: "Research" },
  { href: "#pricing", label: "Pricing" },
  { href: "#support", label: "Support" },
];

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

        <div id="market-pulse" className="scroll-mt-28">
          <MarketPulse />
        </div>

        <div id="top-picks" className="scroll-mt-28">
          <TopPicksToday />
        </div>

        <div id="buy-tomorrow" className="scroll-mt-28">
          <BuyTomorrowPicks />
        </div>

        <div id="dip-winners" className="scroll-mt-28">
          <DipWinners />
        </div>

        <div id="ipos" className="scroll-mt-28">
          <IpoListings />
        </div>

        <div id="research" className="scroll-mt-28">
          <LandingResearch />
        </div>

        <div id="compare" className="scroll-mt-28">
          <AiStockCompare />
        </div>

        <div id="etfs" className="scroll-mt-28">
          <EtfResearch />
        </div>

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
