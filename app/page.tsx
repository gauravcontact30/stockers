import type { Metadata } from "next";
import Link from "next/link";
import { BackToTop } from "./components/back-to-top";
import { HeadToHead } from "./components/head-to-head";
import { HeaderSubscriptionCta } from "./components/header-subscription-cta";
import { HeroCarousel } from "./components/hero-carousel";
import { LiveMarketBoard } from "./components/live-market-board";
import { Logo } from "./components/logo";
import { MobileNav } from "./components/mobile-nav";
import { StreamedOwnershipBoard } from "./components/streamed-ownership-board";
import { PendingSubscriptionCheckout } from "./components/pending-subscription-checkout";
import { PricingPlans } from "./components/pricing-plans";
import { SiteFooter } from "./components/site-footer";
import { JsonLd } from "./components/json-ld";
import { AccuracyMatrixSection } from "./components/accuracy-matrix-section";
import { StreamedClientReviews } from "./components/streamed-client-reviews";
import { StreamedMoversBoard, StreamedSectorMovers } from "./components/streamed-boards";
import { SubscriptionBadge } from "./components/subscription-reminder";
import { ThemeToggle } from "./components/theme-toggle";
import { getDipLeaders } from "./lib/dip-leaders";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "./lib/seo";
import { getCachedPerformanceSummaries } from "./lib/stock-performance";

export const revalidate = 60;

const HOME_DESCRIPTION =
  "AI research on Indian equities with BSE gainers and losers, market news sentiment, shareholding data, returns, comparisons, and subscription plans.";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "AI Indian stock market research",
    description: HOME_DESCRIPTION,
    path: "/",
    keywords: [
      "AI stock research India",
      "BSE gainers and losers",
      "Indian stock market research",
      "StockersAI",
    ],
  }),
  title: {
    absolute: "StockersAI | AI Indian stock market research",
  },
};

const navLinks = [
  { href: "#head-to-head", label: "Beat the AI" },
  { href: "#live-market", label: "Live market" },
  { href: "#bse-movers", label: "Gainers & Losers" },
  { href: "#bse-sectors", label: "By Category" },
  { href: "#ownership", label: "Who owns what" },
  { href: "#accuracy", label: "Accuracy" },
  { href: "#pricing", label: "Pricing" },
  { href: "/dashboard", label: "AI Dashboard" },
];

const HERO_PERFORMANCE_SYMBOLS = ["HAL", "MAZDOCK", "PARAS", "NETWEB", "POWERINDIA", "LT"];

async function getHeroInitialData() {
  const [initialPerformance, initialDipLeaders] = await Promise.all([
    getCachedPerformanceSummaries(HERO_PERFORMANCE_SYMBOLS).catch(() => []),
    getDipLeaders().catch(() => null),
  ]);

  return { initialPerformance, initialDipLeaders };
}

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

export default async function Home() {
  const { initialPerformance, initialDipLeaders } = await getHeroInitialData();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "AI Indian stock market research",
            description: HOME_DESCRIPTION,
            path: "/",
            breadcrumb: breadcrumbSchema([{ name: "Home", path: "/" }]),
          }),
        )}
      />
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
            <HeaderSubscriptionCta />
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
          <HeroCarousel initialPerformance={initialPerformance} initialDipLeaders={initialDipLeaders} />
        </div>

        {/* Straight under the slider, before any of the boards. The boards are the evidence; this is
            the claim being tested, and a reader who plays one match has understood what the site is
            for better than the next three sections could explain it. */}
        <HeadToHead />

        {/* Straight under the contest: the claim is tested above, and this is the exchange the
            claim is made about. Streamed, so nine rankings over 4,900 scrips never hold the hero. */}
        <LiveMarketBoard />

        <BandHeading
          eyebrow="01 · The session, both ways"
          title="Every gainer and every loser on the BSE"
          blurb="Two tabs over the whole exchange: everything that closed higher, and everything that closed lower. Each is paged on its own, in descending order of the move, and filters down to a single cap tier."
        />

        {/* Both resolved on the server and streamed into their slots — see ./components/streamed-boards. */}
        <StreamedMoversBoard />

        <StreamedSectorMovers />

        <BandHeading
          eyebrow="02 · Who owns what"
          title="Every shareholder class, as the company files it"
          blurb="Promoters, foreign portfolio investors, domestic institutions, the government and several million individual shareholders. Search a company to see how its register splits, how many people are behind each slice, and how the promoter stake has moved over eight filed quarters."
        />

        <StreamedOwnershipBoard />

        <AccuracyMatrixSection />

        <PricingPlans />

        {/* Last thing before the footer: the boards make the case, the reviews close it. */}
        <StreamedClientReviews />

        <SiteFooter />
      </div>
      </div>

      <BackToTop />
      <PendingSubscriptionCheckout />
    </main>
  );
}
