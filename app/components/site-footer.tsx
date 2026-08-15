import Link from "next/link";
import { cacheLife } from "next/cache";
import { Logo } from "./logo";

/**
 * The year in the copyright line.
 *
 * `new Date()` read straight into the markup is a value that changes between renders, and under
 * Cache Components that fails the prerender rather than quietly baking a stale year into every
 * page — which is exactly what it used to do. Reading it inside a cached scope makes the staleness
 * bounded and explicit instead: `days` revalidates once a day, so the line is correct within a day
 * of midnight on the 31st of December, and costs nothing on any of the other 364.
 *
 * Deliberately not `connection()` + `<Suspense>`. That would make the footer a dynamic hole on
 * every page on the site, and pay a request-time render forever, to get a number right four hours
 * sooner once a year.
 */
async function copyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");

  return new Date().getFullYear();
}

/**
 * The footer's links.
 *
 * Every href is absolute so the footer behaves as a site map from every page.
 */
const footerColumns: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Markets & Data",
    links: [
      { href: "/live-market", label: "Live BSE market" },
      { href: "/bse-gainers-losers", label: "BSE gainers & losers" },
      { href: "/bse-sectors", label: "BSE sector movers" },
      { href: "/shareholding", label: "BSE shareholding" },
      { href: "/news", label: "Indian market news" },
      { href: "/market-pulse", label: "AI market pulse" },
      { href: "/top-picks", label: "AI top stock picks" },
      { href: "/ipos", label: "Indian IPO watch" },
      { href: "/etf-board", label: "Indian ETF board" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact Us" },
      { href: "/pricing", label: "AI stock research pricing" },
      { href: "/getting-started", label: "Getting Started" },
      { href: "/signin", label: "Sign in" },
      { href: "/signup", label: "Sign up" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/refund-policy", label: "Refund Policy" },
      { href: "/return-policy", label: "Return Policy" },
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export async function SiteFooter() {
  const year = await copyrightYear();

  return (
    <footer className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-10 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <Logo size={36} wordmarkClassName="text-lg" gradientId="footer-logo" />
          </Link>
          <p className="mt-4 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            AI-powered research for Indian equities, IPOs, and ETFs — market context, sentiment, and predictions in one place.
          </p>
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            For research purposes only — not investment advice
          </span>
        </div>

        {footerColumns.map((column) => (
          <div key={column.heading}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{column.heading}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  {/* Not prefetched on sight. The footer is on every page and these links enter
                      the viewport together the moment anybody scrolls to the bottom — two dozen
                      route prefetches fired at once, for policy pages that are read about as often
                      as policy pages ever are. `false` keeps the prefetch on hover, which is the
                      point at which somebody has actually shown an interest in one. */}
                  <Link
                    href={link.href}
                    prefetch={false}
                    className="text-slate-600 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-slate-800 dark:text-slate-400">
        <div className="space-y-1">
          <p>© {year} StockersAI — AI-powered Indian stock research.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Not a SEBI-registered investment adviser or research analyst. Market risk applies —{" "}
            <Link href="/disclaimer" prefetch={false} className="underline underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400">
              read the disclaimer
            </Link>
            .
          </p>
        </div>
        <a
          href="#"
          className="inline-flex w-fit items-center gap-1.5 font-medium text-slate-600 transition hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400"
        >
          Back to top <span aria-hidden>↑</span>
        </a>
      </div>
    </footer>
  );
}
