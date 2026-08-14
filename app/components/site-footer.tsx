import Link from "next/link";
import { Logo } from "./logo";

/**
 * The footer's links.
 *
 * Every href is absolute. They used to be bare fragments — `#market-pulse` and the like — which
 * work on the landing page and go nowhere from the policy or account pages, where the footer also
 * appears. A link that silently does nothing on half the site is worse than no link.
 */
const footerColumns: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Markets & Data",
    links: [
      { href: "/dashboard#market-pulse", label: "Market Pulse" },
      { href: "/dashboard#top-picks", label: "Top Picks" },
      { href: "/dashboard#dip-winners", label: "Dip Screener" },
      { href: "/dashboard#ipos", label: "IPO Watch" },
      { href: "/dashboard#etf-board", label: "ETFs" },
      { href: "/news", label: "Market News" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact Us" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/dashboard#support", label: "Getting Started" },
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

export function SiteFooter() {
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
          <p>© {new Date().getFullYear()} StockersAI — AI-powered Indian stock research.</p>
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
