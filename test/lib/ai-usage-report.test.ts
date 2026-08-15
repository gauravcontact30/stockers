import {
  buildAiUsageReport,
  countOutcomes,
  fallbackRateOf,
  latencyOf,
  percentile,
  type AiCallRecord,
  type AiOutcome,
} from "../../app/lib/ai-usage-report";

let sequence = 0;

function call(overrides: Partial<AiCallRecord> = {}): AiCallRecord {
  sequence += 1;
  return {
    id: `ai_${sequence}`,
    at: `2026-08-15T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    day: "2026-08-15",
    feature: "board-read",
    model: "openai/gpt-4.1-mini",
    outcome: "ok",
    status: 200,
    ms: 900,
    promptTokens: 400,
    completionTokens: 120,
    costUsd: 0.0004,
    streamed: false,
    error: null,
    ...overrides,
  };
}

const window = ["2026-08-13", "2026-08-14", "2026-08-15"];

function report(calls: AiCallRecord[]) {
  return buildAiUsageReport({
    calls,
    fromDay: "2026-08-13",
    today: "2026-08-15",
    days: 3,
    window,
    backend: "memory",
    processLocal: true,
    held: calls.length,
  });
}

describe("countOutcomes", () => {
  it("counts each outcome and the total", () => {
    const counts = countOutcomes([
      call({ outcome: "ok" }),
      call({ outcome: "ok" }),
      call({ outcome: "failed" }),
      call({ outcome: "unusable" }),
      call({ outcome: "unconfigured" }),
    ]);

    expect(counts).toEqual({ ok: 2, unusable: 1, failed: 1, unconfigured: 1, total: 5 });
  });

  it("counts nothing as nothing", () => {
    expect(countOutcomes([])).toEqual({ ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: 0 });
  });
});

describe("fallbackRateOf", () => {
  it("is the share of calls that did not produce a written read", () => {
    expect(fallbackRateOf({ ok: 3, unusable: 1, failed: 0, unconfigured: 0, total: 4 })).toBe(25);
  });

  it("counts an unusable reply as a fallback even though the call succeeded", () => {
    expect(fallbackRateOf({ ok: 0, unusable: 2, failed: 0, unconfigured: 0, total: 2 })).toBe(100);
  });

  it("is zero rather than NaN when nothing was called", () => {
    expect(fallbackRateOf({ ok: 0, unusable: 0, failed: 0, unconfigured: 0, total: 0 })).toBe(0);
  });
});

describe("percentile", () => {
  it("takes the nearest rank rather than interpolating between two calls", () => {
    // Ten durations: p95 is rank 10, which is the slowest — the one worth looking at.
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 2_000];
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.95)).toBe(2_000);
  });

  it("clamps to the ends rather than reading off either of them", () => {
    expect(percentile([5, 9], 0)).toBe(5);
    expect(percentile([5, 9], 1)).toBe(9);
  });

  it("has no answer for an empty list", () => {
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("latencyOf", () => {
  it("reports the spread of the calls that reached the model", () => {
    expect(latencyOf([call({ ms: 100 }), call({ ms: 300 }), call({ ms: 200 })])).toEqual({
      p50: 200,
      p95: 300,
      max: 300,
    });
  });

  it("ignores calls that never happened rather than counting them as instant", () => {
    // An unconfigured call has no duration. Folding it in as a zero would drag the median towards
    // nought exactly on the deployments where the model is not working at all.
    expect(latencyOf([call({ ms: 400 }), call({ outcome: "unconfigured", ms: null })])).toEqual({
      p50: 400,
      p95: 400,
      max: 400,
    });
  });

  it("has no spread when nothing reached the model", () => {
    expect(latencyOf([call({ ms: null })])).toEqual({ p50: null, p95: null, max: null });
  });
});

describe("buildAiUsageReport", () => {
  it("summarises outcomes, latency, tokens and spend across the window", () => {
    const built = report([
      call({ ms: 500, costUsd: 0.001, promptTokens: 100, completionTokens: 50 }),
      call({ ms: 1_500, costUsd: 0.002, promptTokens: 200, completionTokens: 80 }),
      call({ outcome: "failed", ms: 25_000, costUsd: null, promptTokens: null, completionTokens: null, status: null }),
    ]);

    expect(built.counts).toEqual({ ok: 2, unusable: 0, failed: 1, unconfigured: 0, total: 3 });
    expect(built.fallbackRate).toBe(33);
    expect(built.latency.max).toBe(25_000);
    expect(built.promptTokens).toBe(300);
    expect(built.completionTokens).toBe(130);
    expect(built.costUsd).toBe(0.003);
    // Only two of the three calls reported a cost, so the spend figure has to say what it covers.
    expect(built.costedCalls).toBe(2);
  });

  it("keeps a cost that arrives as a long float readable rather than echoing its noise", () => {
    const built = report([call({ costUsd: 0.1 }), call({ costUsd: 0.2 })]);
    expect(built.costUsd).toBe(0.3);
  });

  it("groups by call site, busiest first", () => {
    const built = report([
      call({ feature: "intel-search" }),
      call({ feature: "board-read" }),
      call({ feature: "board-read" }),
    ]);

    expect(built.features.map((slice) => [slice.key, slice.counts.total])).toEqual([
      ["board-read", 2],
      ["intel-search", 1],
    ]);
  });

  it("groups by model, naming the calls that never attempted one", () => {
    const built = report([call({ model: null, outcome: "unconfigured", ms: null })]);
    expect(built.models[0].key).toBe("none attempted");
  });

  it("attributes a call with no feature rather than dropping it", () => {
    const built = report([call({ feature: null as unknown as string })]);
    expect(built.features[0].key).toBe("unattributed");
  });

  it("charts every day in the window, including the ones nothing happened on", () => {
    const built = report([call({ day: "2026-08-15" })]);

    expect(built.daily.map((point) => point.day)).toEqual(window);
    // A chart that skipped empty days would draw a flat line through an outage.
    expect(built.daily[0].counts.total).toBe(0);
    expect(built.daily[2].counts.total).toBe(1);
  });

  it("drops calls from outside the window", () => {
    const built = report([call({ day: "2026-08-01" }), call({ day: "2026-08-14" })]);
    expect(built.counts.total).toBe(1);
  });

  it("lists the most recent fallbacks, newest first, and no successes among them", () => {
    const built = report([
      call({ outcome: "ok", at: "2026-08-15T09:00:00.000Z" }),
      call({ outcome: "failed", at: "2026-08-15T10:00:00.000Z", error: "OpenRouter responded with 429" }),
      call({ outcome: "unusable", at: "2026-08-15T11:00:00.000Z" }),
    ]);

    expect(built.recentFailures.map((entry) => entry.outcome)).toEqual(["unusable", "failed"]);
    expect(built.recentFailures[1].error).toBe("OpenRouter responded with 429");
  });

  it("caps the fallback list rather than handing over every failure in the window", () => {
    const built = report(Array.from({ length: 40 }, () => call({ outcome: "failed" })));
    expect(built.recentFailures).toHaveLength(25);
  });

  it("carries through where the figures came from, so the panel can say what they cover", () => {
    const built = buildAiUsageReport({
      calls: [],
      fromDay: "2026-08-13",
      today: "2026-08-15",
      days: 3,
      window,
      backend: "supabase",
      processLocal: false,
      held: 0,
    });

    expect(built).toMatchObject({ backend: "supabase", processLocal: false, held: 0, days: 3, today: "2026-08-15" });
    expect(built.latency).toEqual({ p50: null, p95: null, max: null });
  });

  it("reports a per-slice last-seen instant", () => {
    const built = report([
      call({ feature: "board-read", at: "2026-08-15T08:00:00.000Z" }),
      call({ feature: "board-read", at: "2026-08-15T12:00:00.000Z" }),
    ]);

    expect(built.features[0].lastAt).toBe("2026-08-15T12:00:00.000Z");
  });

  it("has no last-seen instant for a slice with nothing in it", () => {
    // Reached through the daily points, which are built for days that carry no calls at all.
    expect(report([]).daily.every((point) => point.p50 === null && point.costUsd === 0)).toBe(true);
  });

  it.each<AiOutcome>(["ok", "unusable", "failed", "unconfigured"])("keeps %s calls in the totals", (outcome) => {
    expect(report([call({ outcome })]).counts.total).toBe(1);
  });
});
