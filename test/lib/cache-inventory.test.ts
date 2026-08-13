/** @jest-environment node */

import {
  cacheInventory,
  cacheKeys,
  clearMemoryCache,
  clearMemoryCacheByKeys,
  revalidating,
  revalidatingBy,
  stateFor,
  warmCacheKeys,
} from "../../app/lib/cache";
import { FAMILY_META, prettyKey, summarise, worstState } from "../../app/lib/cache-report";
import {
  assess,
  briefFor,
  composeAdvice,
  formatAge,
  formatBytes,
  parseAdvice,
} from "../../app/lib/cache-advisor";
import type { CacheEntryReport } from "../../app/lib/cache";

// Same reasoning as the sibling cache suite: the persistent layer wants a request store this test
// has no business standing up, and every case here is about the in-memory contract.
jest.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));

beforeEach(() => {
  clearMemoryCache();
});

// ---------------------------------------------------------------------------
// The inventory
// ---------------------------------------------------------------------------

describe("cacheInventory", () => {
  /**
   * The distinction the whole panel rests on.
   *
   * A feed that has been declared but never asked for is not the same as a feed with no loader, and
   * an inventory built from held values alone cannot tell them apart — which is exactly the state
   * the cache is in immediately after a purge.
   */
  it("lists a feed that has been declared but never loaded", () => {
    revalidating({ key: "t:declared", ttlMs: 60_000, tags: ["bse"], load: async () => "x" });

    const [entry] = cacheInventory();
    expect(entry).toMatchObject({ key: "t:declared", state: "empty", ageMs: null, fetchedAt: null, bytes: null });
    expect(cacheKeys()).toContain("t:declared");
  });

  it("reports what a loaded feed is holding, and how big it is", async () => {
    const read = revalidating({ key: "t:loaded", ttlMs: 60_000, tags: ["nse"], persist: true, load: async () => ({ a: 1 }) });
    await read();

    const [entry] = cacheInventory();
    expect(entry).toMatchObject({ key: "t:loaded", state: "fresh", persist: true, tags: ["nse"] });
    expect(entry.bytes).toBe(JSON.stringify({ a: 1 }).length);
    expect(entry.ageMs).toBeGreaterThanOrEqual(0);
  });

  /** Measuring means serialising, which is far too expensive to repeat on every poll. */
  it("measures a value once and re-measures only when it is replaced", async () => {
    // Typed wider than its first value: the point of the test is to replace it with a bigger
    // object, and an inferred `{ a: number }` makes that a compile error rather than a re-measure.
    let value: Record<string, number> = { a: 1 };
    const read = revalidating({ key: "t:sized", ttlMs: 60_000, load: async () => value });
    await read();

    const first = cacheInventory()[0].bytes;
    expect(cacheInventory()[0].bytes).toBe(first);

    value = { a: 1, b: 2, c: 3 };
    await read.fresh();
    expect(cacheInventory()[0].bytes).toBeGreaterThan(first!);
  });

  it("says nothing rather than lying about a value that will not serialise", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const read = revalidating({ key: "t:circular", ttlMs: 60_000, load: async () => circular });
    await read();

    expect(cacheInventory()[0].bytes).toBeNull();
  });

  it("puts the oldest value first and the empty feeds last", async () => {
    const older = revalidating({ key: "t:older", ttlMs: 60_000, load: async () => 1 });
    await older();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = revalidating({ key: "t:newer", ttlMs: 60_000, load: async () => 2 });
    await newer();
    revalidating({ key: "t:never", ttlMs: 60_000, load: async () => 3 });

    expect(cacheInventory().map((entry) => entry.key)).toEqual(["t:older", "t:newer", "t:never"]);
  });

  /** A dropped feed has to stay on the list, or the operator loses the row they just acted on. */
  it("keeps a purged feed listed as empty rather than removing it", async () => {
    const read = revalidating({ key: "t:purged", ttlMs: 60_000, load: async () => 1 });
    await read();

    expect(clearMemoryCacheByKeys(["t:purged", "t:unknown"])).toEqual(["t:purged"]);
    expect(cacheInventory()[0]).toMatchObject({ key: "t:purged", state: "empty" });
  });

  it("registers each argument of a keyed family separately", async () => {
    const read = revalidatingBy<string, string>({
      key: "t:by",
      ttlMs: 60_000,
      tags: ["news"],
      keyOf: (symbol) => symbol,
      load: async (symbol) => symbol.toLowerCase(),
    });
    await read("TCS");
    await read("INFY");

    expect(cacheInventory().map((entry) => entry.key).sort()).toEqual(["t:by:INFY", "t:by:TCS"]);
  });

  /** An evicted argument is gone for good, so an empty row for it would be unactionable clutter. */
  it("takes an evicted argument off the inventory entirely", async () => {
    const read = revalidatingBy<string, string>({
      key: "t:bounded",
      ttlMs: 60_000,
      capacity: 1,
      keyOf: (symbol) => symbol,
      load: async (symbol) => symbol,
    });
    await read("FIRST");
    await read("SECOND");

    expect(cacheInventory().map((entry) => entry.key)).toEqual(["t:bounded:SECOND"]);
  });

  it("reports a background refresh while it is running", async () => {
    let release: (() => void) | null = null;
    let first = true;

    const read = revalidating<string>({
      key: "t:refreshing",
      ttlMs: 5,
      maxStaleMs: 60_000,
      load: async () => {
        if (first) {
          first = false;
          return "one";
        }
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return "two";
      },
    });

    await read();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await read();

    expect(cacheInventory()[0].refreshing).toBe(true);
    release!();
  });
});

describe("stateFor", () => {
  it("names each side of the two windows", () => {
    expect(stateFor(null, 10, 80)).toBe("empty");
    expect(stateFor(5, 10, 80)).toBe("fresh");
    expect(stateFor(10, 10, 80)).toBe("fresh");
    expect(stateFor(11, 10, 80)).toBe("stale");
    expect(stateFor(81, 10, 80)).toBe("expired");
  });
});

// ---------------------------------------------------------------------------
// Warming
// ---------------------------------------------------------------------------

describe("warmCacheKeys", () => {
  it("refills a purged feed so the next reader does not pay for it", async () => {
    const load = jest.fn().mockResolvedValue("value");
    const read = revalidating({ key: "t:warm", ttlMs: 60_000, load });
    await read();
    clearMemoryCacheByKeys(["t:warm"]);

    expect(await warmCacheKeys(["t:warm"])).toEqual([{ key: "t:warm", ok: true }]);
    expect(cacheInventory()[0].state).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  /** Warming eight feeds and having one upstream refuse is a partial success, not a failure. */
  it("reports a feed that would not reload instead of throwing", async () => {
    revalidating({
      key: "t:refuses",
      ttlMs: 60_000,
      load: async () => {
        throw new Error("BSE refused");
      },
    });

    expect(await warmCacheKeys(["t:refuses"])).toEqual([{ key: "t:refuses", ok: false, error: "BSE refused" }]);
  });

  it("has something to say about a rejection that was not an Error", async () => {
    revalidating({
      key: "t:odd",
      ttlMs: 60_000,
      load: async () => {
        throw "nope";
      },
    });

    expect(await warmCacheKeys(["t:odd"])).toEqual([{ key: "t:odd", ok: false, error: "Reload failed." }]);
  });

  it("ignores a key this process has no loader for", async () => {
    expect(await warmCacheKeys(["t:nobody"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function entry(overrides: Partial<CacheEntryReport> = {}): CacheEntryReport {
  return {
    key: "bse:tape",
    tags: ["bse"],
    ttlMs: 60_000,
    maxStaleMs: 480_000,
    persist: false,
    state: "fresh",
    fetchedAt: "2026-08-13T09:00:00.000Z",
    ageMs: 1000,
    refreshing: false,
    bytes: 100,
    ...overrides,
  };
}

describe("prettyKey", () => {
  it("uses the written name where there is one", () => {
    expect(prettyKey("bse:universe")).toBe("BSE scrip master");
  });

  it("makes something readable of a key nobody has named", () => {
    expect(prettyKey("nse:some-new-board")).toBe("Some new board");
  });

  /** The argument half is the part that says *which* of a family this is, so it stays verbatim. */
  it("keeps the argument of a keyed family visible", () => {
    expect(prettyKey("news:feed:TCS")).toBe("Feed · TCS");
  });

  it("copes with a key carrying no family at all", () => {
    expect(prettyKey("loose")).toBe("Loose");
  });
});

describe("worstState", () => {
  it("ranks an expired value above a stale one and a stale one above an empty", () => {
    expect(worstState(["fresh", "empty", "stale"])).toBe("stale");
    expect(worstState(["stale", "expired"])).toBe("expired");
    expect(worstState(["fresh", "fresh"])).toBe("fresh");
    expect(worstState([])).toBe("fresh");
  });
});

describe("summarise", () => {
  it("rolls feeds up into the families the checkboxes purge by", () => {
    const report = summarise([
      entry({ key: "bse:tape", state: "expired", ageMs: 900_000, bytes: 100 }),
      entry({ key: "bse:universe", state: "fresh", ageMs: 10_000, bytes: 400, refreshing: true }),
      entry({ key: "nse:most-traded", tags: ["nse"], state: "empty", ageMs: null, bytes: null }),
    ]);

    const bse = report.families.find((family) => family.tag === "bse")!;
    expect(bse).toMatchObject({ feeds: 2, held: 2, bytes: 500, oldestAgeMs: 900_000, worst: "expired", refreshing: true });
    expect(bse.counts).toEqual({ fresh: 1, stale: 0, expired: 1, empty: 0 });

    expect(report.totals).toMatchObject({ feeds: 3, held: 2, bytes: 500 });
    expect(report.families.find((family) => family.tag === "nse")!.oldestAgeMs).toBeNull();
  });

  /** "Fresh" would be a clean bill of health for a family that has nothing in it at all. */
  it("calls a family with no registered feed empty rather than fresh", () => {
    const report = summarise([]);
    expect(report.families.every((family) => family.worst === "empty")).toBe(true);
    expect(report.families).toHaveLength(Object.keys(FAMILY_META).length);
  });

  it("attaches a readable label to every row", () => {
    expect(summarise([entry({ key: "bse:universe" })]).entries[0].label).toBe("BSE scrip master");
  });

  it("reports how long the instance has been up", () => {
    expect(summarise([], Date.now() + 5_000).uptimeMs).toBeGreaterThanOrEqual(5_000);
  });
});

// ---------------------------------------------------------------------------
// The advice
// ---------------------------------------------------------------------------

function reportOf(entries: CacheEntryReport[], uptimeMs = 60 * 60_000) {
  return { ...summarise(entries), uptimeMs };
}

describe("assess", () => {
  /**
   * The rule that keeps this from being "purge anything not fresh".
   *
   * A stale entry is being served *and* refreshed behind the reader — the cache working as
   * designed. Purging it converts a background refresh into a foreground one for the next visitor,
   * which is the exact cost this page exists to avoid.
   */
  it("leaves a stale family alone and says why", () => {
    const assessment = assess(reportOf([entry({ state: "stale", ageMs: 120_000 })]));

    expect(assessment.purge).toEqual([]);
    expect(assessment.clean).toBe(true);
    expect(assessment.spare.find((item) => item.tag === "bse")!.reason).toMatch(/refreshes behind the reader/);
  });

  it("purges a family holding something past the point of being served", () => {
    const assessment = assess(reportOf([entry({ state: "expired", ageMs: 900_000 })]));

    expect(assessment.purge).toEqual(["bse"]);
    expect(assessment.clean).toBe(false);
    expect(assessment.observations[0]).toMatch(/past the point/);
  });

  /** Only the slow feeds, and only inside a family actually being dropped. */
  it("offers to warm the expensive feeds it is about to empty", () => {
    const assessment = assess(
      reportOf([
        entry({ key: "bse:universe", state: "expired" }),
        entry({ key: "bse:tape", state: "expired" }),
        // Expensive, but its family is fine, so warming it would throw away a good value.
        entry({ key: "nse:most-traded", tags: ["nse"], state: "fresh" }),
      ]),
    );

    expect(assessment.warm.sort()).toEqual(["bse:tape", "bse:universe"]);
  });

  it("does not read an empty cache on a young instance as a problem", () => {
    const assessment = assess(reportOf([entry({ state: "empty", ageMs: null, bytes: null })], 30_000));

    expect(assessment.purge).toEqual([]);
    expect(assessment.spare.find((item) => item.tag === "bse")!.reason).toMatch(/only 30s old/);
    expect(assessment.observations.every((line) => !line.includes("nobody has opened"))).toBe(true);
  });

  it("does remark on an empty family once the instance has been up a while", () => {
    const assessment = assess(reportOf([entry({ state: "empty", ageMs: null, bytes: null })]));

    expect(assessment.observations.some((line) => line.includes("nobody has opened"))).toBe(true);
    expect(assessment.spare.find((item) => item.tag === "bse")!.reason).toMatch(/warm it instead/);
  });

  it("says which family is the expensive one to drop", () => {
    const assessment = assess(reportOf([entry({ bytes: 5 * 1024 * 1024 })]));
    expect(assessment.observations.some((line) => line.includes("5.0 MB"))).toBe(true);
  });

  it("has nothing to say about weight when nothing is held", () => {
    const assessment = assess(reportOf([]));
    expect(assessment.observations).toEqual([]);
    expect(assessment.spare.every((item) => item.reason.includes("registered"))).toBe(true);
  });

  it("reports a family whose every held value is inside its window", () => {
    const assessment = assess(reportOf([entry({ state: "fresh" })]));
    expect(assessment.spare.find((item) => item.tag === "bse")!.reason).toMatch(/within their window/);
  });

  /** A family part-loaded and part-empty is not "empty" — there is nothing wrong with it. */
  it("treats a partly loaded family as healthy", () => {
    const assessment = assess(reportOf([entry({ key: "bse:tape" }), entry({ key: "bse:universe", state: "empty", ageMs: null })]));
    expect(assessment.purge).toEqual([]);
    expect(assessment.spare.find((item) => item.tag === "bse")!.reason).toMatch(/All 1 held values/);
  });
});

describe("composeAdvice", () => {
  it("says there is nothing to do when there is nothing to do", () => {
    const report = reportOf([entry({ state: "fresh" })]);
    expect(composeAdvice(report, assess(report)).headline).toMatch(/No purge needed/);
  });

  it("says there is nothing cached at all when there is not", () => {
    const report = reportOf([]);
    const advice = composeAdvice(report, assess(report));
    expect(advice.headline).toMatch(/Nothing cached in this instance yet/);
    expect(advice.points).toEqual(["0 feeds registered, 0 B held."]);
  });

  it("names the families it wants dropped, in the singular when there is one", () => {
    const report = reportOf([entry({ state: "expired" })]);
    const advice = composeAdvice(report, assess(report));

    expect(advice.headline).toBe("1 feed past the point of being served — purge BSE data.");
    expect(advice.source).toBe("heuristic");
  });

  it("counts in the plural when there is more than one", () => {
    const report = reportOf([entry({ key: "bse:tape", state: "expired" }), entry({ key: "bse:universe", state: "expired" })]);
    expect(composeAdvice(report, assess(report)).headline).toMatch(/^2 feeds past/);
  });
});

describe("briefFor", () => {
  it("gives the model the figures and the decision, not the decision to make", () => {
    const report = reportOf([entry({ state: "expired", ageMs: 900_000 })]);
    const brief = briefFor(report, assess(report));

    expect(brief).toMatch(/Decision already taken: purge bse\./);
    expect(brief).toMatch(/BSE Bhavcopy tape \(bse:tape\): 15m old, expired/);
  });

  it("says plainly when there is nothing held and nothing to purge", () => {
    const report = reportOf([]);
    const brief = briefFor(report, assess(report));

    expect(brief).toMatch(/\(nothing held\)/);
    expect(brief).toMatch(/purge nothing/);
  });
});

describe("parseAdvice", () => {
  it("takes the headline and the points out of a well-formed reply", () => {
    expect(parseAdvice("HEADLINE: Drop BSE.\n- The tape is old.\n- Nothing else is.")).toEqual({
      headline: "Drop BSE.",
      points: ["The tape is old.", "Nothing else is."],
    });
  });

  it("keeps points from a reply that forgot the headline", () => {
    expect(parseAdvice("- Only a point.")).toEqual({ headline: "", points: ["Only a point."] });
  });

  it("caps the points rather than letting the model fill the panel", () => {
    const reply = ["HEADLINE: x", ...Array.from({ length: 9 }, (_, index) => `- point ${index}`)].join("\n");
    expect(parseAdvice(reply)!.points).toHaveLength(4);
  });

  it("ignores blank lines and prose the model was told not to write", () => {
    expect(parseAdvice("\nSure, here you go:\nHEADLINE: Fine.\n")).toEqual({ headline: "Fine.", points: [] });
  });

  it("has nothing to hand back when the reply carried neither", () => {
    expect(parseAdvice("I cannot help with that.")).toBeNull();
  });
});

describe("advisor formatting", () => {
  it("reads bytes at whichever scale carries the point", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("reads durations the same way", () => {
    expect(formatAge(30_000)).toBe("30s");
    expect(formatAge(600_000)).toBe("10m");
    expect(formatAge(2 * 3_600_000 + 60_000)).toBe("2h 1m");
    expect(formatAge(26 * 3_600_000)).toBe("1d 2h");
  });
});
