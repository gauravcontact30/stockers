"use client";

export function SupportSection() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Support & onboarding</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Get started in minutes</h3>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Sign up, choose your plan, and start exploring AI-powered stock ideas, market-news context, and prediction-ready insights for your next move.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition-colors dark:border-slate-800 dark:bg-slate-950/60">
          <p className="font-semibold text-slate-900 dark:text-white">Need help?</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>• Live onboarding guidance for new investors</li>
            <li>• Email support for plan upgrades</li>
            <li>• Daily research summaries and alerts</li>
          </ul>
          <a href="/signup" className="mt-4 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Create account
          </a>
        </div>
      </div>
    </section>
  );
}
