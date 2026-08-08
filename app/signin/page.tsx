import { AuthForm } from "../components/auth-form";
import { AuthHeader } from "../components/auth-header";

export default function SigninPage() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <AuthHeader />

        <div className="flex flex-1 flex-col gap-10 lg:flex-row lg:items-center">
          <section className="max-w-xl space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Stockers.AI</p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl dark:text-white">
              Research smarter with AI-backed market intelligence.
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Access a responsive workspace for Indian equity research, market news sentiment, and portfolio-ready trading ideas.
            </p>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <li>• AI-generated stock ideas based on current market news</li>
              <li>• Positive and negative catalysts for every idea</li>
              <li>• Personalized dashboard for tracking your portfolio</li>
            </ul>
          </section>
          <div className="w-full max-w-md">
            <AuthForm mode="signin" />
          </div>
        </div>
      </div>
    </main>
  );
}
