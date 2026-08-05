import type { Metadata } from "next";
import { GatedSection } from "../components/ai-gate";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { MarketNews } from "../components/market-news";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = {
  title: "Market news · Stockers",
  description:
    "Live Indian market headlines from leading financial publishers, with an AI read on how each story lands for investors.",
};

export default function NewsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-6 text-slate-700 transition-colors sm:px-6 lg:px-8 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
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
