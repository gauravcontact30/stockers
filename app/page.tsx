import type { Metadata } from "next";
import Link from "next/link";
import { BackToTop } from "./components/back-to-top";
import { StreamedTrendingBoard } from "./components/streamed-trending-board";
import { HeadToHead } from "./components/head-to-head";
import { HeaderSubscriptionCta } from "./components/header-subscription-cta";
import { LiveMarketBoard } from "./components/live-market-board";
import { Logo } from "./components/logo";
import { MobileNav } from "./components/mobile-nav";
import { StreamedOwnershipBoard } from "./components/streamed-ownership-board";
import { PendingSubscriptionCheckout } from "./components/pending-subscription-checkout";
import { PricingPlans } from "./components/pricing-plans";
import { ScrollToSection } from "./components/scroll-to-section";
import { SiteFooter } from "./components/site-footer";
import { JsonLd } from "./components/json-ld";
import { AccuracyMatrixSection } from "./components/accuracy-matrix-section";
import { StreamedClientReviews } from "./components/streamed-client-reviews";
import { StreamedMoversBoard, StreamedSectorMovers } from "./components/streamed-boards";
import { AccountMenu } from "./components/account-menu";
import { StreamedHero } from "./components/streamed-hero";
import { StreamedAiFeatures } from "./components/streamed-ai-features";
import { StreamedTierMovers } from "./components/streamed-tier-movers";
import { StreamedTopPerformers } from "./components/streamed-top-performers";
import { HOME_SECTION_ROUTES, type HomeSectionId } from "./lib/section-routes";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "./lib/seo";

export const HOME_DESCRIPTION =
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

/**
 * The header nav: the seven public section routes, and nothing else.
 *
 * "AI Dashboard" used to sit at the end of this row and no longer does. It pointed at a signed-in
 * workspace, so for the visitors this page is written for — nobody signed in yet — it was a link
 * to a sign-in wall sitting among seven links to real content. The way in is "Get started" and
 * "Sign in" on the right of the same bar, which is where somebody looks for it.
 */
const navLinks = HOME_SECTION_ROUTES.map(({ path, label }) => ({ href: path, label }));

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

function PerformanceSection({
  id,
  eyebrow,
  title,
  blurb,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-5 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

type HomeProps = {
  sectionId?: HomeSectionId;
  seo?: {
    name: string;
    description: string;
    path: string;
  };
};

/**
 * Deliberately not `async`, and that is the whole of the landing page's time to first byte.
 *
 * Every section on this page that needs the network now sits behind its own `<Suspense>` — the
 * hero included, see `./components/streamed-hero`. Nothing is awaited out here, so the shell, the
 * header and the footer are written immediately and each board arrives in its own slot. An await
 * added back at this level would put that feed in front of the entire page again.
 */
export default function Home({ sectionId, seo }: HomeProps = {}) {
  const pageSeo = seo ?? {
    name: "AI Indian stock market research",
    description: HOME_DESCRIPTION,
    path: "/",
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      {sectionId && <ScrollToSection id={sectionId} />}
      <JsonLd
        schema={graph(
          webPageSchema({
            name: pageSeo.name,
            description: pageSeo.description,
            path: pageSeo.path,
            breadcrumb: breadcrumbSchema(
              pageSeo.path === "/"
                ? [{ name: "Home", path: "/" }]
                : [
                    { name: "Home", path: "/" },
                    { name: pageSeo.name, path: pageSeo.path },
                  ],
            ),
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
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-slate-600 transition hover:bg-white hover:text-emerald-600 hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
            {/* The trial chip and the theme switch, as one control — see ./components/account-menu
                for why two separate ones were the wrong shape for this corner of the bar. */}
            <AccountMenu />
            <HeaderSubscriptionCta />
            <Link
              href="/signin"
              className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-700 transition hover:bg-slate-100 sm:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {/* An arrow into a door: the standard mark for signing in, and the one that reads
                  without its label at small sizes. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              </svg>
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] transition hover:from-emerald-500 hover:to-teal-500"
            >
              {/* A spark rather than another arrow: this is the primary action beside a secondary
                  one, and two arrows next to each other would read as the same control twice. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="m12 3 2.1 4.9L19 10l-4.9 2.1L12 17l-2.1-4.9L5 10l4.9-2.1L12 3Z" />
              </svg>
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
          <StreamedHero />
        </div>

        {/* Directly under the slider, and deliberately the first thing after it. The hero shows the
            product moving; this says what it actually consists of, feature by feature, before a
            reader has scrolled into ten boards of exchange data and formed the impression that the
            data *is* the product. Filtered against the admin's feature locks in Supabase — see
            ./components/ai-features-showcase. */}
        <StreamedAiFeatures />

        {/* Then the contest. The boards below are the evidence; this is the claim being tested, and
            a reader who plays one match has understood what the site is for better than the next
            three sections could explain it. */}
        <HeadToHead />

        {/* Straight under the contest: the claim is tested above, and this is the exchange the
            claim is made about. Streamed, so nine rankings over 4,900 scrips never hold the hero. */}
        <LiveMarketBoard />

        <BandHeading
          eyebrow="01 - Cap performance"
          title="Large, mid and small caps on their own boards"
          blurb="Each market-cap tier gets both sides of the session: top gainers and top losers, searchable and paged across the whole tier rather than just the first few visible rows."
        />

        <PerformanceSection
          id="cap-performance"
          eyebrow="Market-cap tiers"
          title="All cap types, compared side by side"
          blurb="Switch between large cap, mid cap and small cap to see which companies led and lagged inside that exact tier."
        >
          <StreamedTierMovers />
        </PerformanceSection>

        <BandHeading
          eyebrow="02 - Sector-wise performance"
          title="Every BSE category ranked by its session"
          blurb="Sectors and categories get their own performance read, with gainers, losers, standout leaders and laggards separated instead of buried in the full exchange table."
        />

        <StreamedSectorMovers />

        <BandHeading
          eyebrow="03 - Stock performance"
          title="Single-stock performance across long windows"
          blurb="Rank individual companies by one-year, three-year, five-year and whole-history returns, then flip the same board to the deepest long-window losers."
        />

        <PerformanceSection
          id="stock-performance"
          eyebrow="Stock returns"
          title="Top stock performers and non-performers"
          blurb="Search a company or page through the ranked board to see measured returns by period, with the company logo, sector, cap tier and latest price on every row."
        >
          <StreamedTopPerformers />
        </PerformanceSection>

        <BandHeading
          eyebrow="04 - The session, both ways"
          title="Every gainer and every loser on the BSE"
          blurb="Two tabs over the whole exchange: everything that closed higher, and everything that closed lower. Each is paged on its own, in descending order of the move, and filters down to a single cap tier."
        />

        {/* Both resolved on the server and streamed into their slots — see ./components/streamed-boards. */}
        <StreamedMoversBoard />

        {/* The movers board answers "what moved"; this answers "what was actually traded", which is
            a different ten — a 20% move on thin volume is not where the session's money went. */}
        <StreamedTrendingBoard />

        <BandHeading
          eyebrow="05 - Who owns what"
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
