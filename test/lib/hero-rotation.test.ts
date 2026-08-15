// What the landing page slider shows today.
//
// Two properties carry the whole feature and neither is visible from a single render: that the set
// really does change every day, and that every AI feature comes round eventually rather than a
// handful monopolising the hero. Both are statements about a sequence of days, so that is what this
// suite checks — and it checks determinism first, because a rotation that disagreed with itself
// between the server and the browser would throw the server's markup away on hydration.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_FEATURES } from "../../app/lib/plan-tiers";
import {
  ALL_SHOWCASES,
  FEATURE_SHOWCASES,
  LIVE_SHOWCASES,
  SLIDE_COUNT,
  dayNumber,
  rotationFor,
  windowFrom,
} from "../../app/lib/hero-rotation";

/** `count` consecutive IST dates from a start, as YYYY-MM-DD. */
function days(from: string, count: number): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, offset) =>
    new Date(start + offset * 86_400_000).toISOString().slice(0, 10),
  );
}

describe("the showcase catalogue", () => {
  it("covers every AI feature the app has, exactly once", () => {
    // The whole point of the change: the slider used to advertise four of eighteen features.
    expect(ALL_SHOWCASES).toHaveLength(AI_FEATURES.length);
    expect(new Set(ALL_SHOWCASES.map((entry) => entry.key)).size).toBe(AI_FEATURES.length);
  });

  it("takes each feature's name and one-liner from the feature list, so they cannot drift", () => {
    for (const showcase of ALL_SHOWCASES) {
      const feature = AI_FEATURES.find((entry) => entry.key === showcase.key)!;
      expect(showcase.label).toBe(feature.label);
      expect(showcase.blurb).toBe(feature.blurb);
      expect(showcase.tier).toBe(feature.tier);
    }
  });

  it("gives every showcase somewhere to send a reader", () => {
    for (const showcase of ALL_SHOWCASES) {
      expect(showcase.href.startsWith("/")).toBe(true);
    }
  });

  it("pins exactly four bespoke live scenes, each to a different feature", () => {
    expect(LIVE_SHOWCASES).toHaveLength(4);
    expect(new Set(LIVE_SHOWCASES.map((entry) => entry.scene)).size).toBe(4);
  });

  it("gives every feature without a live scene the content its slide draws", () => {
    for (const showcase of FEATURE_SHOWCASES) {
      expect(showcase.scene).toBeUndefined();
      expect(showcase.columns).toHaveLength(3);
      expect(showcase.rows?.length).toBeGreaterThan(0);
      expect(showcase.points).toHaveLength(3);
    }
  });

  it("keeps each showcase's mock rows distinct, since the row's left cell keys it", () => {
    for (const showcase of FEATURE_SHOWCASES) {
      const lefts = (showcase.rows ?? []).map((row) => row.left);
      expect(new Set(lefts).size).toBe(lefts.length);
    }
  });
});

describe("the screenshot capture targets", () => {
  // `scripts/capture-feature-shots.mjs` restates the list of features to photograph, because it is
  // a plain script and cannot import TypeScript. This is the guard that stops the two drifting: a
  // feature added here but not there would silently never get a picture, and a path changed here
  // would send the camera to a 404. The source is read rather than imported — the script signs in
  // and launches a browser at the top level, so importing it would run it.
  const source = readFileSync(join(__dirname, "..", "..", "scripts", "capture-feature-shots.mjs"), "utf8");
  const targets = [...source.matchAll(/\{ key: "([^"]+)", path: "([^"]+)" \}/g)].map(([, key, path]) => ({ key, path }));

  it("photographs exactly the features that have no bespoke scene", () => {
    expect(targets.map((target) => target.key).sort()).toEqual(FEATURE_SHOWCASES.map((entry) => entry.key).sort());
  });

  it("points at the same page each showcase links to", () => {
    for (const target of targets) {
      const showcase = FEATURE_SHOWCASES.find((entry) => entry.key === target.key)!;
      expect(target.path).toBe(showcase.href);
    }
  });
});

describe("dayNumber", () => {
  it("counts whole days from the epoch", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
  });

  it("advances by exactly one per calendar day", () => {
    expect(dayNumber("2026-08-16") - dayNumber("2026-08-15")).toBe(1);
  });

  it("falls back to zero for a date it cannot read, rather than producing NaN", () => {
    // NaN would index the pool with `undefined` and empty the hero. A malformed date must cost the
    // rotation, never the slider.
    expect(dayNumber("not-a-date")).toBe(0);
    expect(dayNumber("")).toBe(0);
  });

  it("never goes negative, whatever it is handed", () => {
    expect(dayNumber("1900-01-01")).toBe(0);
  });
});

describe("windowFrom", () => {
  const pool = ["a", "b", "c", "d", "e"];

  it("takes a run of entries starting where the day puts it", () => {
    expect(windowFrom(pool, 0, 2)).toEqual(["a", "b"]);
    expect(windowFrom(pool, 1, 2)).toEqual(["c", "d"]);
  });

  it("wraps around the end of the pool rather than running short", () => {
    expect(windowFrom(pool, 2, 2)).toEqual(["e", "a"]);
  });

  it("never asks for more than the pool holds", () => {
    expect(windowFrom(pool, 0, 99)).toHaveLength(pool.length);
  });

  it("has nothing to give from an empty pool", () => {
    expect(windowFrom([], 3, 2)).toEqual([]);
  });
});

describe("rotationFor", () => {
  it("is a pure function of the date", () => {
    // The server renders this and the browser hydrates it. If the two could disagree, React would
    // discard the server's markup — so the same day must give the same answer, always.
    expect(rotationFor("2026-08-15")).toEqual(rotationFor("2026-08-15"));
  });

  it("fills the slider", () => {
    expect(rotationFor("2026-08-15")).toHaveLength(SLIDE_COUNT);
  });

  it("opens on a live-figure scene every day", () => {
    for (const day of days("2026-08-15", 30)) {
      expect(rotationFor(day)[0].scene).toBeDefined();
    }
  });

  it("puts only feature showcases behind it", () => {
    for (const day of days("2026-08-15", 30)) {
      expect(rotationFor(day).slice(1).every((entry) => entry.scene === undefined)).toBe(true);
    }
  });

  it("never repeats a feature within one day", () => {
    for (const day of days("2026-08-15", 60)) {
      const keys = rotationFor(day).map((entry) => entry.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("shares no slide with the day before it", () => {
    const dates = days("2026-08-15", 30);

    for (let index = 1; index < dates.length; index += 1) {
      const yesterday = new Set(rotationFor(dates[index - 1]).map((entry) => entry.key));
      const today = rotationFor(dates[index]).map((entry) => entry.key);
      expect(today.some((key) => yesterday.has(key))).toBe(false);
    }
  });

  it("brings every live scene round within four days", () => {
    const seen = days("2026-08-15", 4).map((day) => rotationFor(day)[0].scene);
    expect(new Set(seen).size).toBe(LIVE_SHOWCASES.length);
  });

  it("brings every feature round within a fortnight, so none is left off the hero forever", () => {
    const seen = new Set<string>();
    for (const day of days("2026-08-15", 14)) {
      for (const entry of rotationFor(day).slice(1)) seen.add(entry.key);
    }

    expect(seen.size).toBe(FEATURE_SHOWCASES.length);
  });

  it("still fills the slider when the date cannot be read", () => {
    expect(rotationFor("not-a-date")).toHaveLength(SLIDE_COUNT);
  });

  it("takes a smaller slider if it is asked for one", () => {
    const two = rotationFor("2026-08-15", 2);
    expect(two).toHaveLength(2);
    expect(two[0].scene).toBeDefined();
  });

  it("gives a live scene and nothing else when asked for one slide", () => {
    const one = rotationFor("2026-08-15", 1);
    expect(one).toHaveLength(1);
    expect(one[0].scene).toBeDefined();
  });
});
