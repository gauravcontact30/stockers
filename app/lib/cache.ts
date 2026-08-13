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
  /** Yahoo quote snapshots for curated stocks, ETFs and benchmark indices. */
  quotes: "quotes",
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

type Entry<T> = {
  value: T;
  fetchedAt: number;
  refreshing: boolean;
  /**
   * The measured size of `value`, and the `fetchedAt` it was measured at.
   *
   * Measuring means serialising, which for the scrip master is a megabyte of work — far too much
   * to do on every write for the sake of a panel almost nobody has open. So it is measured when
   * somebody asks and kept until the value is replaced.
   */
  sized?: { bytes: number | null; at: number };
};

const entries = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * What this process knows how to load, whether or not it currently holds a value.
 *
 * Separate from `entries` on purpose. `entries` answers "what is cached"; this answers "what is
 * cacheable", and the difference between the two is the interesting half — a key with a
 * registration and no entry has been purged or never asked for, which is exactly what an operator
 * wants to see after a purge and exactly what a map of live values cannot tell them.
 *
 * It also carries the only handle to a feed's loader that survives outside the module that
 * declared it, which is what lets the admin panel warm a feed rather than merely emptying it.
 */
type Registration = {
  key: string;
  tags: CacheTag[];
  ttlMs: number;
  maxStaleMs: number;
  persist: boolean;
  /** Reloads the feed, bypassing the cache. Rejects like any loader would. */
  refresh: () => Promise<unknown>;
};

const registry = new Map<string, Registration>();

/** How a cached value stands against its own freshness window. */
export type CacheState =
  /** Registered, but holding nothing — never loaded, or purged since. */
  | "empty"
  /** Within its TTL. */
  | "fresh"
  /** Past its TTL and being served while it refreshes behind the reader. */
  | "stale"
  /** Past `maxStaleMs`. Still held, but the next reader waits for a real answer. */
  | "expired";

/** One feed, as the cache currently holds it. */
export type CacheEntryReport = {
  key: string;
  tags: CacheTag[];
  ttlMs: number;
  maxStaleMs: number;
  persist: boolean;
  state: CacheState;
  /** null when nothing is held. */
  fetchedAt: string | null;
  /** null when nothing is held. */
  ageMs: number | null;
  /** Whether a background refresh is running right now. */
  refreshing: boolean;
  /** Serialised size, or null for a value that does not survive `JSON.stringify`. */
  bytes: number | null;
};

/** Drops every in-memory entry, and everything registered. Used by tests. */
export function clearMemoryCache(): void {
  entries.clear();
  inFlight.clear();
  registry.clear();
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
 * Drops named entries and reports which of them were actually holding something.
 *
 * The registration is deliberately left in place: a purged feed should stay on the inventory as an
 * empty row the operator can warm, not vanish from a list they were just looking at.
 */
export function clearMemoryCacheByKeys(keys: string[]): string[] {
  const dropped: string[] = [];
  for (const key of keys) {
    if (entries.delete(key)) dropped.push(key);
    inFlight.delete(key);
  }
  return dropped;
}

/** The size of a value in bytes, or null when it will not serialise. */
function sizeOf(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    // `undefined` and a value made only of it stringify to `undefined`, not to a string.
    return typeof json === "string" ? json.length : null;
  } catch {
    // Circular, or a BigInt. Neither is a fault worth failing an inventory over.
    return null;
  }
}

/** The state of an entry of the given age against its windows. */
export function stateFor(ageMs: number | null, ttlMs: number, maxStaleMs: number): CacheState {
  if (ageMs === null) return "empty";
  if (ageMs <= ttlMs) return "fresh";
  return ageMs > maxStaleMs ? "expired" : "stale";
}

/**
 * Every feed this process can serve, with what it is holding for each.
 *
 * Only this process. A serverless deployment runs several, each with its own memory, so the
 * numbers here describe the instance that answered the request rather than the fleet — which is
 * worth saying out loud to whoever reads it, and the endpoint does.
 *
 * Sorted oldest-value first, because the reason to open this page is to find what has gone stale.
 */
export function cacheInventory(now = Date.now()): CacheEntryReport[] {
  const reports = [...registry.values()].map((registration): CacheEntryReport => {
    const entry = entries.get(registration.key);
    const ageMs = entry ? Math.max(0, now - entry.fetchedAt) : null;

    let bytes: number | null = null;
    if (entry) {
      // Re-measured only when the value has been replaced since the last look.
      if (!entry.sized || entry.sized.at !== entry.fetchedAt) {
        entry.sized = { bytes: sizeOf(entry.value), at: entry.fetchedAt };
      }
      bytes = entry.sized.bytes;
    }

    return {
      key: registration.key,
      tags: registration.tags,
      ttlMs: registration.ttlMs,
      maxStaleMs: registration.maxStaleMs,
      persist: registration.persist,
      state: stateFor(ageMs, registration.ttlMs, registration.maxStaleMs),
      fetchedAt: entry ? new Date(entry.fetchedAt).toISOString() : null,
      ageMs,
      refreshing: entry?.refreshing ?? false,
      bytes,
    };
  });

  // Empty rows last: they are the ones with nothing to have gone stale.
  return reports.sort((a, b) => (b.ageMs ?? -1) - (a.ageMs ?? -1));
}

/** The keys this process knows how to load. */
export function cacheKeys(): string[] {
  return [...registry.keys()];
}

/**
 * Reloads named feeds, in parallel, and says how each went.
 *
 * This is the other half of a purge. Dropping an entry moves the cost of refilling it onto
 * whichever reader arrives next; doing it here means the operator who caused the purge pays for it
 * instead, and the first visitor after a purge sees a warm cache rather than a seven-second wait.
 *
 * A feed that fails to reload is reported, not thrown: warming eight feeds and having one upstream
 * refuse is a partial success, and answering 500 for it would hide the seven that worked.
 */
export async function warmCacheKeys(keys: string[]): Promise<{ key: string; ok: boolean; error?: string }[]> {
  const known = keys.filter((key) => registry.has(key));

  return Promise.all(
    known.map(async (key) => {
      try {
        await registry.get(key)!.refresh();
        return { key, ok: true };
      } catch (error) {
        return { key, ok: false, error: error instanceof Error ? error.message : "Reload failed." };
      }
    }),
  );
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

  /**
   * Puts this feed on the inventory.
   *
   * Called again from `single` rather than only here, so that a `clearMemoryCache()` — which drops
   * registrations as well as values — cannot permanently hide a feed whose module was imported
   * before it. The map write is idempotent and costs nothing next to the load it accompanies.
   */
  const register = () => {
    registry.set(key, {
      key,
      tags: options.tags ? [...options.tags] : [],
      ttlMs,
      maxStaleMs,
      persist: Boolean(options.persist),
      refresh: () => read.fresh(),
    });
  };

  /** Runs `load` once for however many callers are waiting on it. */
  const single = (): Promise<T> => {
    register();

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

  register();
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
        // Unlike a purge, an eviction means this key is gone for good — the argument that produced
        // it is no longer held anywhere — so it comes off the inventory rather than staying on it
        // as an empty row nobody can act on.
        registry.delete(oldest);
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
