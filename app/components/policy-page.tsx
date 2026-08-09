import Link from "next/link";
import { AuthHeader } from "./auth-header";
import { BackToTop } from "./back-to-top";
import { SiteFooter } from "./site-footer";

/**
 * The shared frame for the four policy pages.
 *
 * They are one document set and should read as one: the same measure, the same heading scale, the
 * same "last updated" line in the same place, and the same row of links to their siblings at the
 * foot. Writing that chrome four times would guarantee it drifts.
 *
 * The measure is deliberately narrower than the market pages. Those are tables a reader scans;
 * these are prose a reader has to actually read, and a 40em column is where that stops being work.
 */

export const POLICY_PAGES: { href: string; label: string }[] = [
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/return-policy", label: "Return Policy" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/disclaimer", label: "Disclaimer" },
];

/** A section heading, so every page's structure is built the same way. */
export function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</div>
    </section>
  );
}

/** A bulleted list in the policy voice — spaced for reading rather than for scanning. */
export function PolicyList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A two-column table of facts — storage keys, processors, sources.
 *
 * Scrolls inside its own container rather than widening the page: these carry long explanations,
 * and on a phone a table that pushes the body sideways makes the whole document unreadable.
 */
export function PolicyTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            {head.map((column) => (
              <th key={column} scope="col" className="py-2 pr-4 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 align-top dark:border-slate-800/70">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`py-2.5 pr-4 ${cellIndex === 0 ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A point the reader must not skim past.
 *
 * Used sparingly — for the two facts that change what someone might do: that this service is not
 * registered investment advice, and that a policy page still carries unfilled placeholders.
 */
export function PolicyCallout({ tone = "amber", children }: { tone?: "amber" | "rose"; children: React.ReactNode }) {
  const chrome =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
      : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";

  return <div className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${chrome}`}>{children}</div>;
}

export function PolicyPage({
  eyebrow,
  title,
  summary,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  /** One paragraph saying what the page covers, so a reader knows before committing to it. */
  summary: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <AuthHeader />

        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl dark:text-white">{title}</h1>
          <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400">{summary}</p>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Last updated {updated}</p>
        </header>

        <article className="space-y-6">{children}</article>

        {/* The sibling policies, so a reader who lands on one can reach the others without going
            back to the footer. The page they are on is named but not linked to itself. */}
        <nav aria-label="Other policies" className="border-t border-slate-200 pt-6 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            The other policies
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {POLICY_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  aria-current={page.label === title ? "page" : undefined}
                  className={`inline-block rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    page.label === title
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
