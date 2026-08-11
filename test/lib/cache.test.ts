import { CACHE_TAGS, cacheHeaders, clearMemoryCache, clearMemoryCacheByPrefix, revalidating, revalidatingBy } from "../../app/lib/cache";

// The persistent layer is Next's Data Cache, which needs a request store this test has no business
// standing up. Every case here is about the in-memory contract — freshness, staleness, coalescing —
// so the wrapper is stubbed to call straight through, which is what it does on a miss anyway.
jest.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));

beforeEach(() => {
  clearMemoryCache();
  jest.useRealTimers();
});

/** Lets a pending promise settle without leaning on timers. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("revalidating", () => {
  it("loads once and answers from memory after that", async () => {
    const load = jest.fn().mockResolvedValue("value");
    const read = revalidating({ key: "t:once", ttlMs: 60_000, load });

    expect(await read()).toBe("value");
    expect(await read()).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  /**
   * The reason this module exists.
   *
   * The caches it replaced all blocked on expiry, so whichever visitor arrived first after a window
   * lapsed paid the full upstream cost — measured at up to 7.8 seconds against the production
   * build. Here the lapsed value comes back straight away and the refresh happens behind them.
   */
  it("serves the stale value immediately and refreshes behind the reader", async () => {
    let answer = "first";
    let release: (() => void) | null = null;

    const load = jest.fn(async () => {
      if (answer === "second") await new Promise<void>((resolve) => { release = resolve; });
      return answer;
    });

    // `maxStaleMs` is stated rather than left to its default of eight times the TTL. With a TTL
    // this short the default is 80ms, and under a full parallel test run the sleep below can
    // overrun that — which would send this down the blocking path and test something else.
    const read = revalidating({ key: "t:swr", ttlMs: 10, maxStaleMs: 60_000, load });
    expect(await read()).toBe("first");

    await new Promise((resolve) => setTimeout(resolve, 20));
    answer = "second";

    // The reader is not made to wait on the refresh: they get the old value now.
    expect(await read()).toBe("first");
    expect(load).toHaveBeenCalledTimes(2);

    await new Promise((resolve) => setTimeout(resolve, 0));
    release!();
    await tick();

    expect(await read()).toBe("second");
  });

  // Serving a value five minutes old while the feed is polled again is a good trade; serving one
  // from yesterday because the feed has been down all night is not.
  it("makes the reader wait once the value is older than it is willing to stand behind", async () => {
    let answer = "stale";
    const load = jest.fn(async () => answer);
    const read = revalidating({ key: "t:maxstale", ttlMs: 5, maxStaleMs: 10, load });

    expect(await read()).toBe("stale");
    await new Promise((resolve) => setTimeout(resolve, 25));

    answer = "fresh";
    expect(await read()).toBe("fresh");
  });

  it("coalesces callers who arrive together into one load", async () => {
    const load = jest.fn(async () => {
      await tick();
      return "value";
    });
    const read = revalidating({ key: "t:single", ttlMs: 60_000, load });

    expect(await Promise.all([read(), read(), read()])).toEqual(["value", "value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  // A background refresh that fails must not become an unhandled rejection, and must leave the
  // reader with the answer they already had.
  it("keeps serving the last good value when a refresh fails", async () => {
    let fail = false;
    const load = jest.fn(async () => {
      if (fail) throw new Error("upstream down");
      return "good";
    });

    // As above: a generous stale window, so scheduling jitter under a full run cannot push this
    // onto the blocking path where a failed load is meant to surface rather than be swallowed.
    const read = revalidating({ key: "t:failing", ttlMs: 10, maxStaleMs: 60_000, load });
    expect(await read()).toBe("good");

    fail = true;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await read()).toBe("good");
    await tick();
    expect(await read()).toBe("good");
  });

  it("shortens the window for a value that came back thin", async () => {
    let answer: string[] = [];
    const load = jest.fn(async () => answer);

    const read = revalidating({
      key: "t:ttlfor",
      ttlMs: 60_000,
      ttlFor: (value) => (value.length > 0 ? 60_000 : 10),
      maxStaleMs: 60_000,
      load,
    });

    expect(await read()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    answer = ["something"];
    await read();
    await tick();

    expect(await read()).toEqual(["something"]);
    // A full value is then held for the long window rather than re-fetched.
    const calls = load.mock.calls.length;
    await read();
    expect(load).toHaveBeenCalledTimes(calls);
  });

  it("bypasses the cache entirely when asked for a fresh value", async () => {
    let answer = "first";
    const load = jest.fn(async () => answer);
    const read = revalidating({ key: "t:fresh", ttlMs: 60_000, load });

    expect(await read()).toBe("first");
    answer = "second";
    expect(await read()).toBe("first");
    expect(await read.fresh()).toBe("second");
    expect(await read()).toBe("second");
  });

  it("reports what it is holding, and when it fetched it", async () => {
    const read = revalidating({ key: "t:peek", ttlMs: 60_000, load: async () => "value" });

    expect(read.peek()).toBeNull();
    await read();

    const held = read.peek();
    expect(held?.value).toBe("value");
    expect(held?.fetchedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("revalidatingBy", () => {
  it("gives each argument its own entry with its own clock", async () => {
    const load = jest.fn(async (symbol: string) => `news for ${symbol}`);
    const read = revalidatingBy({ key: "t:by", ttlMs: 60_000, keyOf: (symbol: string) => symbol, load });

    expect(await read("TCS")).toBe("news for TCS");
    expect(await read("INFY")).toBe("news for INFY");
    expect(await read("TCS")).toBe("news for TCS");
    expect(load).toHaveBeenCalledTimes(2);
  });

  // The key is reader-supplied, so without a bound something walking every ticker on the exchange
  // would grow the map without limit.
  it("evicts the oldest entry once the family is full", async () => {
    const load = jest.fn(async (symbol: string) => symbol);
    const read = revalidatingBy({
      key: "t:bounded",
      ttlMs: 60_000,
      capacity: 2,
      keyOf: (symbol: string) => symbol,
      load,
    });

    await read("A");
    await read("B");
    await read("C");

    // A was evicted to make room for C, so asking for it again is a fresh load.
    await read("A");
    expect(load).toHaveBeenCalledTimes(4);

    // C is still held.
    await read("C");
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("can be forced past the cache for one argument", async () => {
    let answer = "first";
    const read = revalidatingBy({
      key: "t:byfresh",
      ttlMs: 60_000,
      keyOf: (symbol: string) => symbol,
      load: async () => answer,
    });

    expect(await read("TCS")).toBe("first");
    answer = "second";
    expect(await read.fresh("TCS")).toBe("second");
  });
});

describe("clearMemoryCacheByPrefix", () => {
  it("drops only the feeds under the prefix it is given", async () => {
    const bse = jest.fn(async () => "bse");
    const nse = jest.fn(async () => "nse");
    const readBse = revalidating({ key: "bse:thing", ttlMs: 60_000, load: bse });
    const readNse = revalidating({ key: "nse:thing", ttlMs: 60_000, load: nse });

    await readBse();
    await readNse();

    clearMemoryCacheByPrefix("bse:");

    await readBse();
    await readNse();

    expect(bse).toHaveBeenCalledTimes(2);
    expect(nse).toHaveBeenCalledTimes(1);
  });
});

describe("cacheHeaders", () => {
  // `s-maxage` is what a CDN reads; `stale-while-revalidate` offers it the same bargain this
  // module makes internally — serve the slightly stale copy now, refetch behind the reader.
  it("lets a shared cache hold a public feed and refresh behind the reader", () => {
    expect(cacheHeaders(60)).toEqual({
      "Cache-Control": "public, s-maxage=60, max-age=30, stale-while-revalidate=300",
    });
  });

  // A feed gated on who is asking must never be held by a shared cache, or one reader would be
  // served another's entitlements.
  it("keeps a gated feed in the reader's own browser only", () => {
    expect(cacheHeaders(300, "private")).toEqual({
      "Cache-Control": "private, max-age=300, stale-while-revalidate=1500",
    });
  });

  it("never lets the browser hold a short feed longer than the feed itself", () => {
    expect(cacheHeaders(10)["Cache-Control"]).toContain("max-age=10");
  });
});

describe("CACHE_TAGS", () => {
  it("names the families the app revalidates by", () => {
    expect(Object.values(CACHE_TAGS).sort()).toEqual(["ai", "bse", "news", "nse", "quotes"]);
  });
});
