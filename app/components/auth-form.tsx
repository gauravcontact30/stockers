"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "signin" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [plan, setPlan] = useState<"Starter" | "Pro">("Starter");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // If the visitor already has a session, skip the form and send them straight to the dashboard.
  useEffect(() => {
    // React effects never run during server-side rendering, so `window` is always defined by
    // the time this callback executes; the guard is defensive only and unreachable in practice.
    /* istanbul ignore next */
    if (typeof window === "undefined") {
      return;
    }
    const existing = window.localStorage.getItem("stockers-auth");
    if (existing) {
      router.replace("/dashboard");
    }
  }, [router]);

  const validate = () => {
    if (mode === "signup" && name.trim().length < 2) {
      return "Please enter your full name.";
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      return "Please enter a valid email address.";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }
    if (mode === "signup" && password !== confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);

    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/signin";
    const payload = mode === "signup"
      ? { name: name.trim(), email: email.trim(), password, plan }
      : { email: email.trim(), password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Unable to complete request.");
        setLoading(false);
        return;
      }

      localStorage.setItem("stockers-auth", JSON.stringify({ token: data.token, user: data.user }));
      setSuccess(true);
      setMessage(mode === "signup" ? "Account created! Redirecting to your dashboard..." : "Signed in! Redirecting to your dashboard...");
      router.push("/dashboard");
    } catch {
      setMessage("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] transition-colors dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-2xl"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </p>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {mode === "signup" ? "Join Stockers.AI" : "Sign in to Stockers.AI"}
        </h2>
      </div>

      {mode === "signup" && (
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-2 block">Full name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="Aarav Sharma"
            autoComplete="name"
            required
          />
        </label>
      )}

      <label className="block text-sm text-slate-600 dark:text-slate-300">
        <span className="mb-2 block">Email address</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>

      <label className="block text-sm text-slate-600 dark:text-slate-300">
        <span className="mb-2 block">Password</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-16 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="••••••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-3 text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {mode === "signup" && (
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-2 block">Confirm password</span>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
      )}

      {mode === "signup" && (
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-2 block">Subscription</span>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as "Starter" | "Pro")}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="Starter">Starter</option>
            <option value="Pro">Pro</option>
          </select>
        </label>
      )}

      {message && (
        <p
          className={
            success
              ? "rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          }
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <a href="/signin" className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
              Sign in
            </a>
          </>
        ) : (
          <>
            New to Stockers.AI?{" "}
            <a href="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
              Create an account
            </a>
          </>
        )}
      </p>
    </form>
  );
}
