"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * What the server already resolved for a board before it was sent to the browser.
 *
 * `url` is the request that payload answers. It is checked rather than assumed, because a board
 * only opens on its default filters: the moment the reader changes a tab, a tier or a page, the URL
 * is a different one and the server's answer no longer describes what they are asking for.
 */
export type Prefetched<T> = { url: string; data: T } | null;

/**
 * One fetch-on-mount hook shared by every NSE-backed section, so they all handle loading, HTTP
 * failure and network failure identically instead of each inventing its own states.
 *
 * When the page was rendered on the server with the board's opening payload already in hand, that
 * payload is the hook's first value and no request is made for it at all. That removes a whole
 * round trip from what the reader waits through: the old sequence was HTML, then JavaScript, then
 * a fetch, then the numbers, with a skeleton on screen throughout. Changing a filter still goes to
 * the network — from then on the browser is asking a question the server was never asked.
 *
 * `refreshMs` opts a board into re-asking on an interval. Without it a board is a photograph taken
 * when the page loaded: a reader who left a market page open across the close, or simply open for
 * an hour, was reading figures that had stopped being true without anything on screen admitting it.
 * The interval only runs while the tab is actually being looked at, and a tab returning to the
 * foreground refreshes immediately rather than waiting out the rest of a tick it slept through.
 *
 * `refreshNow` is for the case where the server's payload is worth rendering but is known to be
 * incomplete — a board whose live prices the render pass could not fetch, say. The rows still paint
 * from the server with no skeleton and no round trip, and the board asks once more in the
 * background straight away rather than waiting out a whole interval to fill in what is missing.
 */
export function useMarketFeed<T>(
  url: string,
  prefetched?: Prefetched<T>,
  options?: { refreshMs?: number; refreshNow?: boolean },
): { data: T | null; loading: boolean; error: string | null } {
  const refreshMs = options?.refreshMs;
  const refreshNow = options?.refreshNow ?? false;
  const seeded = prefetched && prefetched.url === url ? prefetched.data : null;

  const [data, setData] = useState<T | null>(seeded);
  const [loading, setLoading] = useState(seeded === null);
  const [error, setError] = useState<string | null>(null);

  /**
   * @param background true for a refresh of a board that is already on screen.
   *
   * A background refresh never touches `loading`, and never clears the rows it is replacing: the
   * point of refreshing in place is that the reader's eye stays on the numbers, and swapping them
   * for a skeleton every minute would be worse than not refreshing at all. A failed background
   * refresh is also silent — the figures on screen are still the last ones the server confirmed,
   * which is a better thing to show than an error banner over stale-but-real data.
   */
  const load = useCallback(
    async (background = false) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Request failed");
        setData(await response.json());
        setError(null);
      } catch {
        if (!background) setError("Couldn't reach the market data feed right now. Please try again shortly.");
      } finally {
        if (!background) setLoading(false);
      }
    },
    [url],
  );

  // The URL the server's payload answers, held in a ref so it can be spent exactly once. Without
  // this, a board whose reader navigates back to its opening filters would skip the refetch and
  // show them figures from whenever the page was rendered.
  const unspent = useRef(prefetched?.url ?? null);

  useEffect(() => {
    const seeded = unspent.current === url;
    if (seeded) unspent.current = null;
    // A seeded board already has rows on screen and asks again only if it was told to. When it
    // does, it asks in the background, so the server's rows stay put while the fuller answer lands.
    if (seeded && !refreshNow) return;

    load(seeded);
  }, [load, refreshNow, url]);

  useEffect(() => {
    if (!refreshMs || refreshMs <= 0) return;

    // `document` is always defined by the time an effect runs, but a board rendered under a test
    // renderer without a DOM would still reach this line.
    /* istanbul ignore next */
    const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

    const timer = setInterval(() => {
      if (visible()) load(true);
    }, refreshMs);

    const onVisible = () => {
      if (visible()) load(true);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, refreshMs]);

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

export type Paged<T> = {
  page: number;
  pages: number;
  /** The rows for the current page. */
  slice: T[];
  setPage: (page: number) => void;
  /** 1-based position of the first and last row on this page, for "showing 21-40 of 286". */
  from: number;
  to: number;
  total: number;
};

/**
 * Paging for a list already held in memory.
 *
 * `resetKey` names what the list *is* — the selected sector, the active filter. When it changes
 * the reader is looking at a different list, so they land on its first page rather than on page
 * four of something that may only have two. It is derived rather than reset in an effect, so the
 * new list never renders once at the stale page first.
 */
export function usePaged<T>(rows: T[], pageSize: number, resetKey: string): Paged<T> {
  const [cursor, setCursor] = useState({ key: resetKey, page: 1 });
  const setPage = useCallback((page: number) => setCursor({ key: resetKey, page }), [resetKey]);

  return useMemo(() => {
    const pages = Math.max(Math.ceil(rows.length / pageSize), 1);
    // Clamped rather than stored: a list that shrinks under a reader who is on its last page
    // should show them the new last page, not an empty one.
    const page = Math.min(cursor.key === resetKey ? cursor.page : 1, pages);
    const from = (page - 1) * pageSize;
    const slice = rows.slice(from, from + pageSize);

    return { page, pages, slice, setPage, from: slice.length ? from + 1 : 0, to: from + slice.length, total: rows.length };
  }, [rows, pageSize, resetKey, cursor, setPage]);
}

/** Up to `span` consecutive page numbers around the current one, clamped to the real range. */
export function pageWindow(page: number, pages: number, span = 5): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(span / 2), pages - span + 1));
  const end = Math.min(pages, start + span - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

const PAGE_BUTTON = "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition disabled:opacity-40";

/**
 * The pager shown under any list long enough to need one.
 *
 * Lists on this page are the whole truth — every announcement, every declared dividend — so they
 * are paged rather than trimmed to a tidy dozen. The count line says how much there is so the
 * reader knows what they are paging through.
 */
export function Pager({ paged, unit }: { paged: Paged<unknown>; unit: string }) {
  const { page, pages, from, to, total, setPage } = paged;
  if (pages <= 1) return null;

  return (
    <nav aria-label={`${unit} pages`} className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
        Showing <span className="font-semibold text-slate-900 dark:text-white">{from}–{to}</span> of{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{total.toLocaleString("en-IN")}</span> {unit}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className={`${PAGE_BUTTON} border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300`}
        >
          ← Prev
        </button>

        {pageWindow(page, pages).map((number) => (
          <button
            key={number}
            type="button"
            onClick={() => setPage(number)}
            aria-current={number === page ? "page" : undefined}
            aria-label={`Page ${number}`}
            className={`${PAGE_BUTTON} ${
              number === page
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                : "border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {number}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          className={`${PAGE_BUTTON} border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300`}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
