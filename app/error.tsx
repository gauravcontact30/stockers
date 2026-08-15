"use client";

// The route-level error boundary, and the reason it matters more here than on most sites.
//
// Five server components on the landing page read exchange feeds this application does not own —
// the BSE tape, the NSE boards, a broker scrape, a quote API. Two of them catch their own failures
// (`streamed-ownership-board` falls back to null, `streamed-hero` swallows behind a deadline) and
// two do not. Before this file, a throw from either of those had no boundary between it and the
// root, so one refusing upstream took down the entire page — header, pricing, footer and all —
// and replaced it with Next's unstyled default error screen.
//
// Partial Prerendering changes the shape of that failure rather than removing it. The shell has
// already flushed by the time a streamed segment fails, so what the reader gets is a page that
// paints and then breaks. A boundary is the only thing that contains it, and this is that boundary:
// the error is caught here, the rest of the route survives, and `reset()` re-renders the failed
// subtree without a full page load.
//
// An error boundary must be a Client Component — React needs an event handler for `reset` — and
// that is the one reason for the directive at the top of this file.

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server strips the message from a production error and leaves a `digest`, which is the
    // only handle that ties what the reader saw to the entry in the server log. Logging it here is
    // what makes an "it broke" report answerable.
    console.error("Route error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="gutter flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 py-10 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400">
          Something went wrong
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">
          This section could not be loaded
        </h1>
        {/* Said plainly, and without blaming the reader or promising a fix that may not come. Most
            failures here are an exchange feed refusing, and those genuinely do come back. */}
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          This is usually a market data feed refusing a request rather than a fault in your browser.
          Trying again often works; if it does not, the figures should be back shortly.
        </p>

        {error.digest && (
          // Shown, not hidden: it is meaningless to the reader and the only useful thing they can
          // quote when reporting it.
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 font-mono text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to the market
          </Link>
        </div>
      </div>
    </main>
  );
}
