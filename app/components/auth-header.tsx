import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function AuthHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link href="/" className="group flex items-center">
        <Logo size={40} wordmarkClassName="text-lg" showTagline gradientId="auth-header-logo" />
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          ← Back to home
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
