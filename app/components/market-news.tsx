"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppleModal } from "./apple-modal";
import { CompanyLogo } from "./company-logo";
import { Pager, usePaged } from "./market-section";
import { useStockPerformance } from "./use-stock-performance";

type Sentiment = "Positive" | "Negative" | "Neutral";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: Sentiment;
  /** The listed company the headline is about, where the feed could identify one. */
  symbol: string | null;
  company: string | null;
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

/** Two rows of two per half on a wide screen — the halves sit side by side. */
const NEWS_PAGE_SIZE = 4;

/** How many of each sentiment are in the feed, for the summary strip above the cards. */
export function sentimentCounts(items: { sentiment: Sentiment }[]): Record<Sentiment, number> {
  const counts: Record<Sentiment, number> = { Positive: 0, Negative: 0, Neutral: 0 };
  for (const item of items) counts[item.sentiment] += 1;
  return counts;
}

/**
 * The feed split the way the board reads it: which companies had a good day in the press, and
 * which had a bad one.
 *
 * Two filters, both deliberate. A headline has to name a listed company, because a column of
 * stock news that opens with "Rupee holds range" is not stock news — and without a company there
 * is no mark, no price and no move to show. And it has to lean one way: a neutral story is not a
 * third column, it is a story that does not belong in either. Everything excluded is counted and
 * disclosed under the halves rather than quietly dropped.
 */
export function splitBySentiment(items: NewsItem[]): { positive: NewsItem[]; negative: NewsItem[] } {
  const aboutAStock = items.filter((item) => item.symbol);
  return {
    positive: aboutAStock.filter((item) => item.sentiment === "Positive"),
    negative: aboutAStock.filter((item) => item.sentiment === "Negative"),
  };
}

export function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMove(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(2)}%`;
}

/** What today's move earns a stock: a ribbon for a strong session, a red cap for a fall. */
export type StockMark = "ribbon" | "cap" | "flat" | "unknown";

/**
 * How the company is doing today, as one word.
 *
 * The threshold is deliberate rather than "any green at all": a stock up a tenth of a percent is
 * not a best performer, and dressing it as one would make the ribbon meaningless. Two percent is
 * a real day's move on the Indian boards.
 */
const STRONG_MOVE = 2;

export function stockMark(move: number | null | undefined): StockMark {
  if (typeof move !== "number" || !Number.isFinite(move)) return "unknown";
  if (move >= STRONG_MOVE) return "ribbon";
  if (move < 0) return "cap";
  return "flat";
}

const MARK_PILL: Record<StockMark, string> = {
  ribbon: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  cap: "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10",
  flat: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
  unknown: "border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60",
};

/**
 * The company a headline is about: its mark, its name, and what it is actually doing today.
 *
 * The logo is treated as the story's profile picture — it leads, and it is the company's own mark
 * from the ticker store rather than a generic glyph. Over it goes one of two badges, and which one
 * is a measurement rather than a decoration: a ribbon when the stock is up more than two percent
 * on the day, a red cap when it is down. The price and move beside it come from the same batched
 * quote hook every other board uses, so a page naming eight companies is one request.
 */
function NewsStock({ symbol, company }: { symbol: string; company: string | null }) {
  const { performance, loading } = useStockPerformance(symbol);
  const move = performance?.oneDay ?? null;
  const mark = stockMark(move);

  const tone =
    mark === "ribbon" || mark === "flat"
      ? "text-emerald-700 dark:text-emerald-400"
      : mark === "cap"
        ? "text-rose-700 dark:text-rose-400"
        : "text-slate-400 dark:text-slate-500";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 ${MARK_PILL[mark]}`}
      >
        <span className="relative shrink-0">
          <CompanyLogo symbol={symbol} size={28} />

          {/* A ribbon for a strong day. Drawn rather than emoji so it keeps its colour in both
              themes and cannot be swapped by a platform font. */}
          {mark === "ribbon" && (
            <span
              aria-label="Up more than 2% today"
              title="Up more than 2% today"
              className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] leading-none font-black text-white shadow-sm"
            >
              ★
            </span>
          )}

          {/*
            A red cap, worn over the top of the company's mark when the stock is down on the day.
            Drawn as a crown and a peak rather than a coloured bar, so it reads as a cap at 28px —
            and as an SVG rather than an emoji, which a platform font is free to redraw or drop.
          */}
          {mark === "cap" && (
            <svg
              role="img"
              aria-label="Down today"
              viewBox="0 0 26 13"
              className="pointer-events-none absolute -top-[7px] left-1/2 h-[13px] w-[26px] -translate-x-1/2 -rotate-12 drop-shadow-sm"
            >
              <title>Down today</title>
              {/* The peak, jutting out to the right. */}
              <path d="M14 8.2h8.6a1.6 1.6 0 0 1 0 3.2H14z" fill="#9f1239" />
              {/* The crown. */}
              <path d="M4 11a8 8 0 0 1 16 0z" fill="#e11d48" />
              {/* The button on top. */}
              <circle cx="12" cy="3.6" r="1.15" fill="#fda4af" />
            </svg>
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-[11px] leading-tight font-bold text-slate-900 dark:text-white">{symbol}</span>
          {company && company !== symbol && (
            <span className="block truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">{company}</span>
          )}
        </span>
      </span>

      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums dark:bg-slate-950/60">
        <span className="text-slate-900 dark:text-white">{loading ? "…" : formatPrice(performance?.price)}</span>
        {!loading && <span className={tone}>{formatMove(move)}</span>}
      </span>
    </div>
  );
}

function NewsCard({ item, onOpen }: { item: NewsItem; onOpen: (item: NewsItem) => void }) {
  return (
    <li className="min-w-0">
      {/*
        A button, not a link. The card used to navigate straight out to the publisher, which meant
        the only way to find out what a headline was about was to leave. It now opens the story
        here — with the publisher's link still one click away inside.
      */}
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`flex h-full w-full flex-col rounded-2xl border p-4 text-left transition ${SENTIMENT_CARD[item.sentiment]}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SENTIMENT_STYLE[item.sentiment]}`}>
            {item.sentiment}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-500">{relativeTime(item.publishedAt)}</span>
        </div>

        {/* The company first — its mark reads as the story's profile picture, and the reader knows
            whose news this is before parsing the headline. */}
        {item.symbol && <NewsStock symbol={item.symbol} company={item.company} />}

        <h4 className="mt-3 line-clamp-3 font-semibold break-words text-slate-900 dark:text-white">{item.title}</h4>

        {/* Most Google News entries carry no prose beyond the headline, so the gloss is
            dropped rather than echoing the title back at the reader. */}
        {item.summary && (
          <p className="mt-2 line-clamp-2 text-sm break-words text-slate-600 dark:text-slate-400">{item.summary}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
          <span className="truncate font-medium text-slate-600 dark:text-slate-400">{item.source}</span>
          <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">Read the story →</span>
        </div>
      </button>
    </li>
  );
}

type StoryPayload = {
  brief: string[];
  related: NewsItem[];
  writer: "ai" | "extractive";
};

/**
 * One headline, opened.
 *
 * Everything factual in here is sourced and linked: the story's own publisher at the top, and
 * every related report with the name of the publisher that filed it. The AI paragraph is labelled
 * as such and is written from those headlines alone — it is the one piece of prose on the page
 * this app is responsible for, so it says so.
 */
export function NewsStoryModal({ item, onClose }: { item: NewsItem | null; onClose: () => void }) {
  const [story, setStory] = useState<StoryPayload | null>(null);
  const [failed, setFailed] = useState(false);

  const key = item ? item.url : null;

  /*
   * No state is reset here on purpose.
   *
   * Clearing the previous story in the effect body is a cascading render, and it is also the wrong
   * shape: "start over for a different story" is a remount, not an update. The section keys this
   * component by the story's URL, so opening a second headline gives it fresh state for free.
   */
  useEffect(() => {
    if (!item) return;

    let live = true;
    const params = new URLSearchParams({ title: item.title, url: item.url });
    if (item.symbol) params.set("symbol", item.symbol);

    fetch(`/api/news/story?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((payload: Partial<StoryPayload>) => {
        if (!live) return;
        // A 200 is not a promise of a well-formed body. Normalising here means a truncated or
        // unexpected payload shows the "couldn't put this together" note instead of taking the
        // whole modal down with it.
        setStory({
          brief: Array.isArray(payload?.brief) ? payload.brief : [],
          related: Array.isArray(payload?.related) ? payload.related : [],
          writer: payload?.writer === "ai" ? "ai" : "extractive",
        });
      })
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
    // Keyed by the story being opened; the item object itself is recreated on every feed refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!item) return null;

  return (
    <AppleModal
      open={item !== null}
      onClose={onClose}
      label={item.title}
      header={
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SENTIMENT_STYLE[item.sentiment]}`}>
              {item.sentiment}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {item.source} · {relativeTime(item.publishedAt)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold break-words text-slate-900 dark:text-white">{item.title}</h3>
        </div>
      }
      footer={
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
        >
          Read the full report at {item.source} ↗
        </a>
      }
    >
      {item.symbol && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            The company in this story
          </p>
          <NewsStock symbol={item.symbol} company={item.company} />
        </div>
      )}

      {item.summary && <p className="text-sm break-words text-slate-700 dark:text-slate-300">{item.summary}</p>}

      <div className="mt-4">
        <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          What this is about
        </p>

        {!story && !failed && (
          <div className="mt-2 space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        )}

        {failed && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Couldn&apos;t put the background together just now. The publisher&apos;s own report is linked below.
          </p>
        )}

        {story && (
          <>
            {story.brief.map((line) => (
              <p key={line} className="mt-2 text-sm break-words text-slate-700 dark:text-slate-300">
                {line}
              </p>
            ))}
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {story.writer === "ai"
                ? "Written by AI from the headlines listed below — no figures or claims beyond them."
                : "No AI key configured, so this is a plain summary of what was found."}
            </p>
          </>
        )}
      </div>

      {story && story.related.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Also being reported
          </p>
          <ul className="mt-2 space-y-2">
            {story.related.map((related) => (
              <li key={related.url}>
                <a
                  href={related.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block rounded-2xl border p-3 transition ${SENTIMENT_CARD[related.sentiment]}`}
                >
                  <p className="text-sm font-semibold break-words text-slate-900 dark:text-white">{related.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {related.source} · {relativeTime(related.publishedAt)} · {related.sentiment}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppleModal>
  );
}

/** One half of the board: every headline leaning one way, paged on its own. */
function NewsHalf({
  title,
  blurb,
  items,
  pageKey,
  accent,
  onOpen,
}: {
  title: string;
  blurb: string;
  items: NewsItem[];
  pageKey: string;
  accent: string;
  onOpen: (item: NewsItem) => void;
}) {
  const paged = usePaged(items, NEWS_PAGE_SIZE, pageKey);

  return (
    <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={`text-sm font-bold tracking-wide uppercase ${accent}`}>{title}</h4>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {items.length} {items.length === 1 ? "headline" : "headlines"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{blurb}</p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nothing on this side of the ledger right now.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.slice.map((item) => (
              <NewsCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ul>
          <Pager paged={paged} unit="headlines" />
        </>
      )}
    </div>
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
  // Which headline is open, or null. Held here rather than per card so only one modal exists.
  const [story, setStory] = useState<NewsItem | null>(null);

  const load = useCallback(async () => {
    try {
      const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
      const response = await fetch(`/api/news${query}`);

      // 402 is the paywall answering, not the feed being down. The route says which plan is
      // missing, and reporting it as an outage instead sends a reader — or whoever they email —
      // looking for a broken publisher that is working fine.
      if (response.status === 402) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Subscribe to read the market news feed.");
        return;
      }

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
  const { positive, negative } = useMemo(() => splitBySentiment(items), [items]);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors sm:p-6 dark:border-slate-800 dark:bg-slate-900">
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
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
          ))}
        </div>
      )}

      {/*
        Two halves rather than one stream, stacked rather than side by side. A single
        reverse-chronological list makes the reader do the sorting — "is this good or bad for what
        I hold?" — on every headline. Splitting it puts that answer in the heading. Full width
        apiece gives each half three cards to a row instead of one, and each pages independently so
        a busy day on one side does not push the other off the board.
      */}
      {!loading && items.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          <NewsHalf
            title="Positive news"
            blurb="Headlines that read well for the company named."
            items={positive}
            pageKey={`${symbol ?? "all"}-positive`}
            accent="text-emerald-700 dark:text-emerald-400"
            onOpen={setStory}
          />
          <NewsHalf
            title="Negative news"
            blurb="Headlines that read badly for the company named."
            items={negative}
            pageKey={`${symbol ?? "all"}-negative`}
            accent="text-rose-700 dark:text-rose-400"
            onOpen={setStory}
          />

          {/* What the two halves leave out, and why. The columns are stock news; the rest of the
              feed is real and is not being hidden, it just has no company to attach to. */}
          {items.length - positive.length - negative.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length - positive.length - negative.length} further{" "}
              {items.length - positive.length - negative.length === 1 ? "headline is" : "headlines are"} not shown above:
              index levels, policy and rupee moves that name no single company, and stories that read neither way.
            </p>
          )}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">No fresh headlines right now — check back shortly.</p>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Headlines and links belong to their publishers · sentiment labels are AI-generated and not investment advice.
      </p>

      {/* Keyed by the story so each one opens with its own clean state. */}
      <NewsStoryModal key={story?.url ?? "none"} item={story} onClose={() => setStory(null)} />
    </section>
  );
}
