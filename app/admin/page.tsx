import type { Metadata } from "next";
import Link from "next/link";
import { AdminUsers } from "../components/admin-users";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { SiteFooter } from "../components/site-footer";

export const metadata: Metadata = {
  title: "User administration · Stockers",
  description: "Manage the accounts registered on Stockers.AI: verification, plans and subscriptions.",
  // Never worth indexing, and worth being explicit about on a page that lists real addresses.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <AuthHeader />

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Administration</p>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl dark:text-white">
            Everyone who has signed up
          </h1>
          <p className="max-w-2xl text-base text-slate-600 dark:text-slate-400">
            Every registered account, newest first — who has confirmed their address, who is on a paid period, and who is
            still inside their free trial. Changes here take effect immediately.
          </p>
          <Link
            href="/dashboard"
            className="inline-block text-sm font-semibold text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400"
          >
            ← Back to the AI dashboard
          </Link>
        </section>

        <AdminUsers />

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
