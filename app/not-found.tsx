// The 404, and the reason it is a real page rather than the framework's default.
//
// Two things were wrong with having no `not-found.tsx`. The visible one is that a mistyped URL —
// or, far more often, a link from somewhere that has not caught up with a rename — dropped the
// reader onto Next's unstyled default: black Helvetica on white, no header, no theme, no way back
// except the browser's own button. On a site whose every other page is themed and navigable, that
// reads as broken rather than as "no such page".
//
// The one that costs more is the second: a 404 is a routine event on a public site with a large URL
// surface, and it is where crawlers spend a surprising amount of their budget. Answering it with a
// prerendered static page is close to free — this file is entirely static, so it is built once and
// served off the cache with no server render at all.
//
// Deliberately kept light. There is no market feed, no `<Suspense>` and nothing async in here: this
// page is the answer to "that URL does not exist", and it should not go and read the exchange to
// say so. It also renders under a layout that already mounts the theme provider and trackers, so a
// visitor who lands here keeps their theme and is still counted.

import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "./components/auth-header";
import { SiteFooter } from "./components/site-footer";
import { HOME_SECTION_ROUTES } from "./lib/section-routes";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Find the BSE market boards, AI research and pricing from here.",
  // A 404 must never be indexed. Without this, a soft-404 pattern — many URLs answering with the
  // same page — is one of the easier ways to have a site's crawl budget quietly wasted.
  robots: { index: false, follow: true },
};

/**
 * Where a lost reader most plausibly meant to go.
 *
 * The seven public section routes, plus the two account paths. Read from `HOME_SECTION_ROUTES`
 * rather than hand-listed so a route added later appears here without anybody remembering to.
 */
const suggestions = [
  ...HOME_SECTION_ROUTES.map(({ path, label, description }) => ({ href: path, label, description })),
  {
    href: "/news",
    label: "Market news",
    description: "Live Indian market headlines with an AI read on how each story lands.",
  },
];

export default function NotFound() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <AuthHeader />

        <header className="space-y-4">
          {/* The code itself, stated plainly. A reader who has seen a 404 before knows exactly what
              it means, and hiding it behind a cartoon costs them that recognition. */}
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">
            Error 404
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl dark:text-white">
            That page isn&apos;t here
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
            The address may have been mistyped, or the page may have moved. Nothing is wrong with your
            connection and nothing is down — every board below is working normally.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/"
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
            >
              Back to the market
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Tell us what you were looking for
            </Link>
          </div>
        </header>

        <section aria-labelledby="suggestions-heading" className="space-y-4">
          <h2
            id="suggestions-heading"
            className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400"
          >
            Or pick up where you meant to
          </h2>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-4 transition hover:-translate-y-px hover:border-emerald-300 hover:shadow-[0_18px_40px_-28px_rgba(5,150,105,0.65)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
