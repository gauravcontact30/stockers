"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "./market-section";

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

/**
 * The card's own tint, taken from the sentiment.
 *
 * The sentiment used to be a chip on an otherwise identical row, which meant a page of headlines
 * read as one grey block. Washing the whole card makes the mood of the feed legible before a
 * single headline is read.
 */
const SENTIMENT_CARD: Record<Sentiment, string> = {
  Positive:
    "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400 dark:border-emerald-500/25 dark:bg-emerald-500/5 dark:hover:border-emerald-500/50",
  Negative:
    "border-rose-200 bg-rose-50/60 hover:border-rose-400 dark:border-rose-500/25 dark:bg-rose-500/5 dark:hover:border-rose-500/50",
  Neutral:
    "border-slate-200 bg-slate-50 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-600",
};

/** Two rows of three on a wide screen. */
const NEWS_PAGE_SIZE = 6;

/** How many of each sentiment are in the feed, for the summary strip above the cards. */
export function sentimentCounts(items: { sentiment: Sentiment }[]): Record<Sentiment, number> {
  const counts: Record<Sentiment, number> = { Positive: 0, Negative: 0, Neutral: 0 };
  for (const item of items) counts[item.sentiment] += 1;
  return counts;
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex h-full flex-col rounded-2xl border p-4 transition ${SENTIMENT_CARD[item.sentiment]}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SENTIMENT_STYLE[item.sentiment]}`}>
            {item.sentiment}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-500">{relativeTime(item.publishedAt)}</span>
        </div>

        <h4 className="mt-3 line-clamp-3 font-semibold text-slate-900 dark:text-white">{item.title}</h4>

        {/* Most Google News entries carry no prose beyond the headline, so the gloss is
            dropped rather than echoing the title back at the reader. */}
        {item.summary && <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{item.summary}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
          <span className="truncate font-medium text-slate-600 dark:text-slate-400">{item.source}</span>
          <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">Read at source ↗</span>
        </div>
      </a>
    </li>
  );
}

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

  const items = useMemo(() => feed?.items ?? [], [feed]);
  // Six to a page: two rows of three on a wide screen, and the whole feed stays reachable rather
  // than being trimmed to whatever fitted.
  const paged = usePaged(items, NEWS_PAGE_SIZE, symbol ?? "all");

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

      {/* How the feed as a whole is leaning, before any single headline is read. */}
      {!loading && items.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.entries(sentimentCounts(items)) as [Sentiment, number][]).map(([sentiment, count]) => (
            <span key={sentiment} className={`rounded-full px-3 py-1 text-xs font-semibold ${SENTIMENT_STYLE[sentiment]}`}>
              {count} {sentiment.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.slice.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </ul>
          <Pager paged={paged} unit="headlines" />
        </>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">No fresh headlines right now — check back shortly.</p>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Headlines and links belong to their publishers · sentiment labels are AI-generated and not investment advice.
      </p>
    </section>
  );
}
