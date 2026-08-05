"use client";

import { useCallback, useEffect, useState } from "react";

type Sentiment = "Positive" | "Negative" | "Neutral";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: Sentiment;
};

type NewsFeed = {
  scope: string;
  items: NewsItem[];
  fetchedAt: string;
  classifier: "ai" | "heuristic";
};

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  Positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Negative: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  Neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function relativeTime(iso: string, now = Date.now()): string {
  const published = new Date(iso).getTime();
  if (Number.isNaN(published)) return "";

  const minutes = Math.round((now - published) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

/**
 * @param compact drops the section's own eyebrow/title/blurb — used on the dedicated news page,
 * where the page hero already says all of it and repeating it reads as a duplicated header.
 */
export function MarketNews({ symbol, compact = false }: { symbol?: string; compact?: boolean }) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
      const response = await fetch(`/api/news${query}`);
      if (!response.ok) throw new Error("Failed to load news");
      setFeed(await response.json());
      setError(null);
    } catch {
      setError("Couldn't reach the news feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  const items = feed?.items ?? [];

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {compact && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {items.length > 0 ? `${items.length} headlines · newest first` : "Fetching the latest headlines…"}
          </p>
        )}
        {!compact && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">Market news</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Latest on {feed?.scope ?? "Indian markets"}
            </h3>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Live headlines pulled from Indian financial publishers, with an AI read on how each one lands for investors.
            </p>
          </div>
        )}
        <div className="flex flex-col items-start gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 sm:items-end dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span>{feed ? (feed.classifier === "ai" ? "AI sentiment read" : "Keyword sentiment (no AI key)") : "Loading…"}</span>
          {feed && <span className="text-xs font-normal opacity-80">Updated {relativeTime(feed.fetchedAt)}</span>}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {loading &&
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
          ))}

        {!loading &&
          items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/5"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold text-slate-900 dark:text-white">{item.title}</h4>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${SENTIMENT_STYLE[item.sentiment]}`}
                >
                  {item.sentiment}
                </span>
              </div>

              {/* Most Google News entries carry no prose beyond the headline, so the gloss is
                  dropped rather than echoing the title back at the reader. */}
              {item.summary && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{item.summary}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                <span className="font-medium text-slate-600 dark:text-slate-400">{item.source}</span>
                <span aria-hidden="true">·</span>
                <span>{relativeTime(item.publishedAt)}</span>
                <span className="ml-auto font-medium text-emerald-600 dark:text-emerald-400">Read at source ↗</span>
              </div>
            </a>
          ))}

        {!loading && items.length === 0 && !error && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No fresh headlines right now — check back shortly.</p>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Headlines and links belong to their publishers · sentiment labels are AI-generated and not investment advice.
      </p>
    </section>
  );
}
