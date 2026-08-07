"use client";

import { useCallback, useEffect, useState } from "react";

export type IpoStatus = "open" | "upcoming" | "closed";

type IpoSubscriptionCategory = { label: string; times: number | null; offered: number | null; bid: number | null };
type IpoSubscription = { overall: number | null; categories: IpoSubscriptionCategory[] };

type PipelineIpo = {
  id: string;
  symbol: string;
  company: string;
  board: "Mainboard" | "SME";
  status: IpoStatus;
  logo: string;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  priceBand: string | null;
  priceBandMin: number | null;
  priceBandMax: number | null;
  lotSize: number | null;
  issueSizeCr: number | null;
  subscription: IpoSubscription | null;
};

type AnticipatedIpo = { company: string; sector: string; note: string; logo: string };

type IposState = {
  ipos: PipelineIpo[];
  anticipated: AnticipatedIpo[];
  counts: Record<IpoStatus, number>;
  today: string;
  live: boolean;
  source: string;
};

const STATUS_META: Record<IpoStatus, { label: string; badge: string; note: string }> = {
  open: {
    label: "OPEN",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    note: "Accepting bids today",
  },
  upcoming: {
    label: "UPCOMING",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
    note: "Bidding not open yet",
  },
  closed: {
    label: "CLOSED",
    badge: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    note: "Subscription window shut",
  },
};

const FILTERS: { key: IpoStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming" },
  { key: "closed", label: "Closed" },
];

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatBand(min: number | null, max: number | null): string {
  if (min === null || max === null) return "—";
  if (min === max) return `₹${min}`;
  return `₹${min} – ₹${max}`;
}

/** Issue size in ₹ crore, rounded — sub-crore precision is noise at this scale. */
export function formatIssueSize(value: number | null): string {
  if (value === null) return "—";
  return `₹${Math.round(value).toLocaleString("en-IN")} Cr`;
}

export function formatTimes(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}x`;
}

/** Bar width for a subscription meter: 1x fills a third, so oversubscription still has headroom. */
export function subscriptionWidth(times: number | null): number {
  if (times === null || times <= 0) return 0;
  return Math.min(100, (times / 3) * 100);
}

function SubscriptionMeter({ subscription }: { subscription: IpoSubscription }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Subscribed
        </p>
        <p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatTimes(subscription.overall)}
        </p>
      </div>

      <ul className="mt-2 space-y-1.5">
        {subscription.categories.map((category) => (
          <li key={category.label}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate text-slate-600 dark:text-slate-400">{category.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                {formatTimes(category.times)}
              </span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15">
              <div
                className="h-1 rounded-full bg-emerald-500"
                style={{ width: `${subscriptionWidth(category.times)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] text-emerald-700/70 dark:text-emerald-400/70">Live bid data from NSE</p>
    </div>
  );
}

function IpoLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon host, not part of the Next/Image domain allowlist
    <img
      src={src}
      alt={`${name} logo`}
      width={40}
      height={40}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1.5 dark:border-slate-700"
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

export function IpoListings() {
  const [state, setState] = useState<IposState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<IpoStatus | "all">("all");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/market/ipos");
      if (!response.ok) throw new Error("Failed to load IPOs");
      const data = await response.json();
      setState(data);
      setError(null);
    } catch {
      setError("Couldn't reach the IPO data feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  const ipos = state?.ipos ?? [];
  const anticipated = state?.anticipated ?? [];
  const counts = state?.counts ?? { open: 0, upcoming: 0, closed: 0 };
  const visible = filter === "all" ? ipos : ipos.filter((ipo) => ipo.status === filter);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">IPO watch</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Open, upcoming and closed IPOs</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Every mainboard and SME issue on NSE&apos;s calendar, with its status worked out against today&apos;s date and live
            category-wise subscription figures for anything open.
          </p>
        </div>
        <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400">
          As of {state?.today ?? "…"} IST
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = option.key === "all" ? ipos.length : counts[option.key];
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === option.key
                  ? "border-indigo-400 bg-indigo-600 text-white dark:border-indigo-500"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300"
              }`}
            >
              {option.label} <span className="tabular-nums opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40" />
          ))}

        {!loading &&
          visible.map((ipo) => {
            const status = STATUS_META[ipo.status];

            return (
              <article
                key={ipo.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-200 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/30"
              >
                <div className="flex items-start gap-3">
                  <IpoLogo src={ipo.logo} name={ipo.company} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight text-slate-900 dark:text-white">{ipo.company}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {ipo.symbol} · {ipo.board}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${status.badge}`}>
                    {status.label}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{status.note}</span>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800">
                  <Detail label="Price band" value={formatBand(ipo.priceBandMin, ipo.priceBandMax)} />
                  <Detail label="Lot size" value={ipo.lotSize === null ? "—" : String(ipo.lotSize)} />
                  <Detail label="Issue size" value={formatIssueSize(ipo.issueSizeCr)} />
                  <Detail label="Opens" value={formatDate(ipo.openDate)} />
                  <Detail label="Closes" value={formatDate(ipo.closeDate)} />
                  <Detail label="Lists" value={formatDate(ipo.listingDate)} />
                </dl>

                {ipo.subscription && <SubscriptionMeter subscription={ipo.subscription} />}
              </article>
            );
          })}

        {!loading && visible.length === 0 && !error && (
          <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">
            No {filter === "all" ? "" : `${filter} `}IPOs on NSE&apos;s calendar right now.
          </p>
        )}
      </div>

      {!loading && anticipated.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">On the radar · no filing window yet</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {anticipated.map((ipo) => {
              return (
                <article
                  key={ipo.company}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/30"
                >
                  <div className="flex items-center gap-2.5">
                    <IpoLogo src={ipo.logo} name={ipo.company} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{ipo.company}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{ipo.sector}</p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{ipo.note}</p>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        {state?.source ?? "Loading the NSE IPO calendar…"} · Not investment advice.
      </p>
    </section>
  );
}
