import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { JsonLd } from "../components/json-ld";
import { SiteFooter } from "../components/site-footer";
import { COMPANY, DATA_SOURCES, TERMS } from "../lib/policy";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../lib/seo";

const ABOUT_DESCRIPTION =
  "What StockersAI is, where its numbers come from, what its AI is allowed to do, and the rules it holds itself to.";

export const metadata: Metadata = pageMetadata({
  title: "About StockersAI",
  description: ABOUT_DESCRIPTION,
  path: "/about",
  keywords: ["StockersAI about", "Indian equities research desk", "AI stock research methodology"],
});

/** The rules the product is built to. Each is a claim the rest of the site has to keep. */
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Measured, never estimated",
    body: "Every figure is read from a published exchange source and shown as published. Where a number is missing we print a dash. We would rather admit a gap than fill it with something plausible, because a plausible number is indistinguishable from a real one once it is on the screen.",
  },
  {
    title: "The arithmetic decides, the AI explains",
    body: "A stance — outperform, hold, underperform — is computed from measured returns before any model is called. The model is handed that score and asked to explain it, and is not permitted to contradict it. It writes prose over figures; it does not choose them.",
  },
  {
    title: "The whole list, not a tidy top ten",
    body: "When a board says every gainer on the exchange, it means every one, paged. Trimming a list to the flattering part of it is the oldest way to mislead with real data, and it is not something we do.",
  },
  {
    title: "Sources named, always",
    body: "Every board says where its figures came from and which session they belong to. If a feed is unreachable the board says that too, rather than quietly showing you yesterday.",
  },
  {
    title: "No paid placement",
    body: "No company pays to appear anywhere on this platform. What you see on a board is whatever the ranking produced, and there is no mechanism by which that could be otherwise.",
  },
];

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "About StockersAI",
            description: ABOUT_DESCRIPTION,
            path: "/about",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "About", path: "/about" },
            ]),
          }),
        )}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <AuthHeader />

        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">About us</p>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl dark:text-white">
            A research desk for Indian equities, built on published numbers
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            {COMPANY.brand} reads what the exchanges publish, measures it, and explains what it found. It is a tool for
            seeing the market clearly and quickly — not a tip service, and not a substitute for your own judgement.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Why it exists</h2>
          <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            <p>
              Indian retail research tends to arrive in one of two shapes: a screen full of numbers with no explanation,
              or an explanation with no numbers behind it. The first assumes you have an afternoon. The second asks you to
              take someone&apos;s word for it.
            </p>
            <p>
              This sits between them. The exchange&apos;s own data is the substance — nearly five thousand listed
              companies, every session&apos;s closes, the whole corporate-actions calendar — and the AI layer on top of it
              does one job: say what the figures mean for a decision, using only the figures it was given.
            </p>
            <p>
              Whether that is worth paying for is a question you should answer before paying. Every account gets{" "}
              {TERMS.trialDays} calendar days of Starter and Pro AI access with no card, which is enough time to find out.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">How we work</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <Principle key={principle.title} {...principle} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Where the data comes from</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            All of it is public. None of these organisations endorses this service or has checked it, and each publishes
            for its own purposes rather than as a warranted data product — a limitation set out in full in the{" "}
            <Link href="/disclaimer" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
              Disclaimer
            </Link>
            .
          </p>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {DATA_SOURCES.map((source) => (
              <li key={source.name} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{source.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{source.used}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">What we are not</h2>
          <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            {COMPANY.brand} is not a SEBI-registered investment adviser or research analyst, not a broker, and not a
            portfolio manager. We do not execute trades, hold securities or handle client funds, and nothing here is
            tailored to your circumstances. Please read the{" "}
            <Link href="/disclaimer" className="font-semibold underline underline-offset-2">
              Disclaimer
            </Link>{" "}
            before acting on anything on this site.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Talk to us</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Questions, corrections and complaints all reach a person. If a figure on this site looks wrong, tell us — a
            wrong number is a bug, and we would like to fix it.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500"
          >
            Contact us →
          </Link>
          <p className="pt-2 text-xs text-slate-400 dark:text-slate-500">
            {COMPANY.legalName}, {COMPANY.address}. {COMPANY.registration}.
          </p>
        </section>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
