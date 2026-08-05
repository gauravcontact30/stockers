"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * One fetch-on-mount hook shared by every NSE-backed section, so they all handle loading, HTTP
 * failure and network failure identically instead of each inventing its own states.
 */
export function useMarketFeed<T>(url: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Request failed");
      setData(await response.json());
      setError(null);
    } catch {
      setError("Couldn't reach the market data feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  return { data, loading, error };
}

/** The common card chrome — matching border, radius, shadow and dark mode across all sections. */
export function MarketSection({
  eyebrow,
  eyebrowClass = "text-emerald-600 dark:text-emerald-400",
  title,
  blurb,
  aside,
  children,
  id,
}: {
  eyebrow: string;
  eyebrowClass?: string;
  title: string;
  blurb: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.3em] ${eyebrowClass}`}>{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{blurb}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
      {message}
    </p>
  );
}

export function SectionSkeleton({ rows = 4, height = "h-16" }: { rows?: number; height?: string }) {
  return (
    <div className="mt-6 space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={`${height} animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40`}
        />
      ))}
    </div>
  );
}

/** A pill row of filters — the same control used for cap tiers, sectors and ETF groups. */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={option.key === value}
          onClick={() => onChange(option.key)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            option.key === value
              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-slate-500"
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1 tabular-nums opacity-70">({option.count})</span>}
        </button>
      ))}
    </div>
  );
}

/** Small caption used under every section to name the source and the "not advice" disclaimer. */
export function SectionFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{children}</p>;
}
