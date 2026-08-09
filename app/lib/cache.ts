// One revalidating cache for every feed in the application.
//
// Before this file there were six of these, written separately in `nse-client`, `market-pulse`,
// `nse-ipos`, `market-news`, `market-intel` and `board-read`, and they all shared the same flaw:
// they *block on expiry*. A visitor who happened to arrive one millisecond after a TTL lapsed paid
// the full cost of refilling it. Measured against the production build, that cost is:
//
//     /api/market/pulse       7756ms cold      18ms warm
//     /api/market/ipos        4745ms cold      10ms warm
//     /api/news               3492ms cold       9ms warm
//     /api/market/bse         1386ms cold      38ms warm
//
// The warm numbers were never the problem. The cold ones are, and they recur on every deploy,
// every restart and every lapse of a window that is measured in minutes.
//
// So the contract here is stale-while-revalidate rather than expire-and-refetch: an expired entry
// is handed back immediately and refreshed behind the reader, which means the seconds above are
// paid once, by whoever fills the cache first, and never again while the process lives. Three
// further properties fall out of doing it in one place:
//
//   * concurrent misses are coalesced, so a page that opens eight sections off one feed makes one
//     upstream request rather than eight;
//   * entries can be persisted into Next's Data Cache, so a restart or a deploy reads the last
//     good value from disk instead of going back to the exchange;
//   * entries carry tags, so `revalidateTag` can drop them on demand — that is what makes the
//     "revalidate cache" control in the admin dashboard possible at all.
//
// Values are only ever *served* stale, never *presented* as fresh: every entry carries the instant
// it was fetched, and the feeds surface that to the reader.

import { unstable_cache } from "next/cache";

/** The tag families the app revalidates by. Grouped, not per-feed, so purging is a short list. */
export const CACHE_TAGS = {
  /** BSE scrip master, Bhavcopy tape, sector classification. */
  bse: "bse",
  /** NSE boards: most-traded, sectoral indices, ETFs, dividends, filings, IPOs. */
  nse: "nse",
  /** Anything written by a model: board reads, pulse narrative, intel answers. */
  ai: "ai",
  /** Headlines and story pages. */
  news: "news",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export type RevalidateOptions<T> = {
  /** Stable identity for this feed. Becomes part of the Data Cache key, so it must not collide. */
  key: string;
  /** How long a value is fresh. Past this it is still served, but a refresh starts behind it. */
  ttlMs: number;
  /**
   * A shorter window for a value that came back thin.
   *
   * An empty feed is usually a transient upstream failure rather than a market with no news in it,
   * and standing behind that for the full window leaves a panel blank for ten minutes. Returning a
   * smaller number for such a value retries it sooner without dropping the entry — which matters,
   * because dropping it would send every arriving reader back upstream while it stayed empty.
   */
  ttlFor?: (value: T) => number;
  /**
   * How long past `ttlMs` a stale value may still be served while the refresh runs.
   *
   * This is the honesty limit. Serving a value five minutes old while the exchange is polled again
   * is a good trade; serving one from yesterday because the feed has been down all night is not.
   * Past this the reader waits for a real answer. Defaults to eight times the TTL.
   */
  maxStaleMs?: number;
  /** Tag families this entry belongs to, for `revalidateTag`. */
  tags?: CacheTag[];
  /**
   * Whether to persist through Next's Data Cache as well as memory.
   *
   * Only for plainly JSON-serialisable values. Several loaders here hand back `Map`s and `Set`s,
   * which do not survive the round trip, so this is opt-in rather than the default.
   */
  persist?: boolean;
  load: () => Promise<T>;
};

/** A cached value together with when it was actually fetched. */
export type Dated<T> = { value: T; fetchedAt: number };

type Entry<T> = { value: T; fetchedAt: number; refreshing: boolean };

const entries = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Drops every in-memory entry. Used by the revalidate endpoint and by tests. */
export function clearMemoryCache(): void {
  entries.clear();
  inFlight.clear();
}

/** Drops the in-memory entries whose key begins with `prefix`. */
export function clearMemoryCacheByPrefix(prefix: string): void {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
  for (const key of [...inFlight.keys()]) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/**
 * `load`, wrapped in Next's Data Cache when asked for and left alone when not.
 *
 * `unstable_cache` reaches for the request store, which is not always there — a background refresh
 * runs outside any request, and so does anything called at module scope. Rather than let that turn
 * a cache miss into an error, a throw from the persistent layer falls through to loading directly.
 */
function persistentLoader<T>(options: RevalidateOptions<T>): () => Promise<T> {
  if (!options.persist) return options.load;

  const wrapped = unstable_cache(options.load, ["stockers", options.key], {
    revalidate: Math.max(1, Math.round(options.ttlMs / 1000)),
    tags: options.tags ? [...options.tags] : undefined,
  });

  return async () => {
    try {
      return await wrapped();
    } catch {
      return options.load();
    }
  };
}

/**
 * A loader that answers from memory, refreshes behind the reader, and only ever runs once at a
 * time no matter how many callers arrive together.
 *
 * The returned function also carries `.fresh()`, which bypasses the cache entirely — that is what
 * a manual revalidation calls.
 */
export function revalidating<T>(options: RevalidateOptions<T>): (() => Promise<T>) & {
  fresh: () => Promise<T>;
  peek: () => Dated<T> | null;
} {
  const { key, ttlMs } = options;
  const maxStaleMs = options.maxStaleMs ?? ttlMs * 8;
  const load = persistentLoader(options);

  /** Runs `load` once for however many callers are waiting on it. */
  const single = (): Promise<T> => {
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return running;

    const promise = load()
      .then((value) => {
        entries.set(key, { value, fetchedAt: Date.now(), refreshing: false });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };

  const read = async (): Promise<T> => {
    const entry = entries.get(key) as Entry<T> | undefined;

    // Nothing cached at all: this caller is the one who pays for the fill.
    if (!entry) return single();

    const age = Date.now() - entry.fetchedAt;
    const fresh = options.ttlFor ? options.ttlFor(entry.value) : ttlMs;
    if (age <= fresh) return entry.value;

    // Too old to stand behind. The reader waits rather than being shown yesterday's market.
    if (age > maxStaleMs) return single();

    // Stale but serviceable: hand it back now, refresh behind them. The rejection is swallowed
    // deliberately — a failed background refresh must not become an unhandled rejection, and the
    // reader already has a usable answer either way. The entry stays as it is so the next request
    // tries again rather than sitting on a refresh that never landed.
    if (!entry.refreshing) {
      entry.refreshing = true;
      void single()
        .catch(() => undefined)
        .finally(() => {
          const current = entries.get(key) as Entry<T> | undefined;
          if (current) current.refreshing = false;
        });
    }

    return entry.value;
  };

  read.fresh = async (): Promise<T> => {
    entries.delete(key);
    inFlight.delete(key);
    return single();
  };

  read.peek = (): Dated<T> | null => {
    const entry = entries.get(key) as Entry<T> | undefined;
    return entry ? { value: entry.value, fetchedAt: entry.fetchedAt } : null;
  };

  return read;
}

/**
 * The same contract for a family of values keyed by an argument — news by symbol, an intel answer
 * by question, a board read by the figures underneath it.
 *
 * Each argument gets its own entry with its own clock, so one hot key staying warm does not keep
 * a cold one alive, and vice versa. `capacity` bounds the family: these are keyed by reader input,
 * so without a bound a crawler walking every ticker would grow the map without limit. Eviction is
 * oldest-write-first, which for feeds keyed this way is close enough to least-useful.
 */
export function revalidatingBy<A, T>(options: {
  key: string;
  ttlMs: number;
  ttlFor?: (value: T) => number;
  maxStaleMs?: number;
  tags?: CacheTag[];
  persist?: boolean;
  capacity?: number;
  /** The cache key for one argument. Must capture everything `load` varies on. */
  keyOf: (argument: A) => string;
  load: (argument: A) => Promise<T>;
}): ((argument: A) => Promise<T>) & { fresh: (argument: A) => Promise<T> } {
  const capacity = options.capacity ?? 200;
  const loaders = new Map<string, ReturnType<typeof revalidating<T>>>();

  const loaderFor = (argument: A) => {
    const id = `${options.key}:${options.keyOf(argument)}`;
    const existing = loaders.get(id);
    if (existing) return existing;

    // Bounded before the insert, so the map never exceeds capacity even by one.
    if (loaders.size >= capacity) {
      const oldest = loaders.keys().next().value;
      if (oldest !== undefined) {
        loaders.delete(oldest);
        entries.delete(oldest);
      }
    }

    const loader = revalidating<T>({
      key: id,
      ttlMs: options.ttlMs,
      ttlFor: options.ttlFor,
      maxStaleMs: options.maxStaleMs,
      tags: options.tags,
      persist: options.persist,
      load: () => options.load(argument),
    });

    loaders.set(id, loader);
    return loader;
  };

  const read = (argument: A) => loaderFor(argument)();
  read.fresh = (argument: A) => loaderFor(argument).fresh();
  return read;
}

/**
 * Response headers for a feed cached for `seconds`.
 *
 * `s-maxage` is what a CDN or the Next cache in front of the app reads; `stale-while-revalidate`
 * is the same bargain this module makes internally, offered one layer out — an edge holding a
 * slightly stale copy serves it instantly and refetches behind the reader rather than making them
 * wait. `private` feeds (anything gated on who is asking) get browser-only caching instead, since
 * a shared cache must never hand one reader another's entitlements.
 */
export function cacheHeaders(seconds: number, scope: "public" | "private" = "public"): Record<string, string> {
  const stale = seconds * 5;
  return {
    "Cache-Control":
      scope === "public"
        ? `public, s-maxage=${seconds}, max-age=${Math.min(seconds, 30)}, stale-while-revalidate=${stale}`
        : `private, max-age=${seconds}, stale-while-revalidate=${stale}`,
  };
}
