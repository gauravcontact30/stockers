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

/**
 * The site footer.
 *
 * Reworked for weight and finish rather than for content — every link, heading and legal line is
 * the one that was here before, in the same order. What changed is the things that were making a
 * considered page end on an unconsidered note:
 *
 *   - it opened with nothing. The header carries a 3px emerald-to-teal hairline across the top of
 *     the page; the footer began at a plain border, so the two ends of a long scroll did not look
 *     like parts of the same document. The same hairline now closes it.
 *   - the brand column had no anchor. It now carries three compact trust markers, so the block
 *     reads as a product summary rather than as a stray paragraph beside three lists.
 *   - the links now sit in their own navigation grid with a clear border on small screens, which
 *     gives the three columns a top edge to line up against.
 *   - "Back to top" was a bare text link doing the work of a control, wedged against the legal
 *     copy. It is a bordered pill now, which is what it always behaved as.
 *
 * Restraint is the point. This is the footer of a financial-research product, and the regulatory
 * lines in it have to read as sober rather than styled — so the accents are hairlines and small
 * caps, not colour fills.
 */
export async function SiteFooter() {
  const year = await copyrightYear();

  return (
    <footer className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.38)] transition-colors dark:border-slate-800 dark:bg-slate-950">
      {/* The same bar the sticky header opens the page with, closing it. */}
      <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500" />

      {/* Brand summary and navigation share the same surface, with a mobile divider between them. */}
      <div>
        <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_1.85fr] lg:gap-12">
          <div className="space-y-5">
            <Link href="/" className="inline-flex items-center gap-3">
              <Logo size={40} wordmarkClassName="text-lg" gradientId="footer-logo" />
            </Link>

            {/* The trust markers below keep the footer useful without adding another section. */}
            <p className="max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              AI-powered research for Indian equities, IPOs, and ETFs — market context, sentiment, and predictions in one place.
            </p>

            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-1">
              {["BSE and NSE market data", "Plan-gated AI research", "Razorpay-secured payments"].map((item) => (
                <span
                  key={item}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  {item}
                </span>
              ))}
            </div>

            {/* A dot rather than a filled amber pill. The line is a caveat, and a caveat that shouts
                is read as decoration; this one has to still be legible as a caveat. */}
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              For research purposes only — not investment advice
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 sm:grid-cols-3 lg:border-t-0 lg:pt-0 dark:border-slate-800">
            {footerColumns.map((column) => (
              <div key={column.heading}>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {column.heading}
                </p>
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
                        className="inline-block text-slate-600 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-6 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
        <div className="space-y-1.5">
          <p className="font-medium text-slate-700 dark:text-slate-200">
            © {year} StockersAI — AI-powered Indian stock research.
          </p>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-500">
            Not a SEBI-registered investment adviser or research analyst. Market risk applies —{" "}
            <Link
              href="/disclaimer"
              prefetch={false}
              className="font-medium underline decoration-slate-300 underline-offset-2 transition hover:text-emerald-600 hover:decoration-emerald-500 dark:decoration-slate-600 dark:hover:text-emerald-400"
            >
              read the disclaimer
            </Link>
            .
          </p>
        </div>

        <a
          href="#"
          className="group inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-emerald-500/50 dark:hover:text-emerald-300"
        >
          Back to top
          <span aria-hidden="true" className="transition-transform duration-200 group-hover:-translate-y-0.5">
            ↑
          </span>
        </a>
      </div>
    </footer>
  );
}
