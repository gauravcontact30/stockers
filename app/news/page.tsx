import type { Metadata } from "next";
import { GatedSection } from "../components/ai-gate";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { JsonLd } from "../components/json-ld";
import { MarketNews } from "../components/market-news";
import { SiteFooter } from "../components/site-footer";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../lib/seo";

const NEWS_DESCRIPTION =
  "Live Indian market headlines from leading financial publishers, with an AI read on how each story lands for investors.";

export const metadata: Metadata = pageMetadata({
  title: "Market news",
  description: NEWS_DESCRIPTION,
  path: "/news",
  keywords: ["Indian stock market news", "market news sentiment", "AI market news India"],
});

export default function NewsPage() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "Market news",
            description: NEWS_DESCRIPTION,
            path: "/news",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Market news", path: "/news" },
            ]),
          }),
        )}
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <AuthHeader />

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Market news</p>
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl dark:text-white">
            What&apos;s moving Indian markets right now
          </h1>
          <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Headlines pulled live from Indian financial publishers, ordered newest first, each labelled with an AI read on how
            it lands for investors. Every story links back to its original source.
          </p>
        </section>

        <GatedSection feature="news" label="AI market news">
          <MarketNews compact />
        </GatedSection>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
