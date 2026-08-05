import { AuthForm } from "../components/auth-form";
import { AuthHeader } from "../components/auth-header";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-6 text-slate-700 transition-colors sm:px-6 lg:px-8 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <AuthHeader />

        <div className="flex flex-1 flex-col gap-10 lg:flex-row lg:items-center">
          <section className="max-w-xl space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Stockers.AI</p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl dark:text-white">
              Start your intelligent research journey today.
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Unlock a polished dashboard that combines news-driven insights, risk awareness, and stock suggestions for Indian markets.
            </p>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <li>• Free Starter plan, upgrade to Pro any time</li>
              <li>• Secure account creation with hashed password storage</li>
              <li>• Instant access to your investor dashboard</li>
            </ul>
          </section>
          <div className="w-full max-w-md">
            <AuthForm mode="signup" />
          </div>
        </div>
      </div>
    </main>
  );
}
