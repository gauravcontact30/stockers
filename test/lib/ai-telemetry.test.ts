/** @jest-environment node */

import {
  MEMORY_CAPACITY,
  buildAiCallRecord,
  heldInMemory,
  listAiCalls,
  recordAiCall,
  resetAiTelemetry,
} from "../../app/lib/ai-telemetry";

beforeEach(() => {
  resetAiTelemetry();
});

describe("buildAiCallRecord", () => {
  const at = new Date("2026-08-15T04:30:00.000Z");

  it("stamps the record with the IST day the instant falls on", () => {
    // 04:30 UTC is 10:00 IST the same day.
    expect(buildAiCallRecord({ feature: "board-read", model: "m", outcome: "ok" }, at)).toMatchObject({
      at: "2026-08-15T04:30:00.000Z",
      day: "2026-08-15",
    });
  });

  it("rolls an instant late in the UTC evening onto the next IST day", () => {
    const record = buildAiCallRecord({ feature: "f", model: "m", outcome: "ok" }, new Date("2026-08-15T20:00:00.000Z"));
    expect(record.day).toBe("2026-08-16");
  });

  it("mints a distinct id per call", () => {
    const a = buildAiCallRecord({ feature: "f", model: null, outcome: "ok" }, at);
    const b = buildAiCallRecord({ feature: "f", model: null, outcome: "ok" }, at);
    expect(a.id).not.toBe(b.id);
  });

  it("keeps an absent figure as unknown rather than as zero", () => {
    const record = buildAiCallRecord({ feature: "f", model: null, outcome: "unconfigured" }, at);
    expect(record).toMatchObject({ status: null, ms: null, promptTokens: null, completionTokens: null, costUsd: null });
  });

  it("refuses a figure that is not a finite number", () => {
    const record = buildAiCallRecord(
      { feature: "f", model: null, outcome: "ok", promptTokens: "many", completionTokens: NaN, costUsd: Infinity },
      at,
    );
    expect(record).toMatchObject({ promptTokens: null, completionTokens: null, costUsd: null });
  });

  it("clips an error to a message and never carries a body", () => {
    const record = buildAiCallRecord({ feature: "f", model: null, outcome: "failed", error: new Error("x".repeat(400)) }, at);
    expect(record.error).toHaveLength(200);
  });

  it("takes an error that is not an Error", () => {
    expect(buildAiCallRecord({ feature: "f", model: null, outcome: "failed", error: "timed out" }, at).error).toBe("timed out");
  });

  it("has no error to record when none was given, or when it is blank", () => {
    expect(buildAiCallRecord({ feature: "f", model: null, outcome: "ok" }, at).error).toBeNull();
    expect(buildAiCallRecord({ feature: "f", model: null, outcome: "ok", error: "   " }, at).error).toBeNull();
  });

  it("records whether the call was streamed", () => {
    expect(buildAiCallRecord({ feature: "f", model: null, outcome: "ok" }, at).streamed).toBe(false);
    expect(buildAiCallRecord({ feature: "f", model: null, outcome: "ok", streamed: true }, at).streamed).toBe(true);
  });
});

describe("the in-process ring", () => {
  it("holds what it is given and hands it back by day", async () => {
    recordAiCall({ feature: "board-read", model: "m", outcome: "ok", ms: 120 });

    const { calls, backend, processLocal } = await listAiCalls("1970-01-01");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ feature: "board-read", outcome: "ok", ms: 120 });
    // With no Supabase configured the report has to say the figures are one process's own.
    expect({ backend, processLocal }).toEqual({ backend: "memory", processLocal: true });
  });

  it("filters out days before the one asked for", async () => {
    recordAiCall({ feature: "f", model: "m", outcome: "ok" });

    const future = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await expect(listAiCalls(future)).resolves.toMatchObject({ calls: [] });
  });

  it("stays bounded rather than growing without limit on a long-lived process", () => {
    for (let index = 0; index < MEMORY_CAPACITY + 50; index += 1) {
      recordAiCall({ feature: "f", model: "m", outcome: "ok" });
    }

    expect(heldInMemory()).toBe(MEMORY_CAPACITY);
  });

  it("evicts oldest-first, so what survives is the recent history the dashboard reads", async () => {
    for (let index = 0; index < MEMORY_CAPACITY + 1; index += 1) {
      recordAiCall({ feature: `call-${index}`, model: "m", outcome: "ok" });
    }

    const { calls } = await listAiCalls("1970-01-01");
    expect(calls[0].feature).toBe("call-1");
    expect(calls[calls.length - 1].feature).toBe(`call-${MEMORY_CAPACITY}`);
  });

  it("never throws out of the write path, whatever it is handed", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});

    // A feature name that cannot be stringified would throw inside the builder. Recording is on the
    // request path of a panel somebody is waiting for, so it must swallow that rather than fail it.
    const hostile = {
      toString() {
        throw new Error("nope");
      },
    };
    expect(() =>
      recordAiCall({ feature: hostile as unknown as string, model: null, outcome: "failed", error: hostile }),
    ).not.toThrow();

    errors.mockRestore();
  });

  it("starts empty again when reset", async () => {
    recordAiCall({ feature: "f", model: "m", outcome: "ok" });
    resetAiTelemetry();

    expect(heldInMemory()).toBe(0);
    await expect(listAiCalls("1970-01-01")).resolves.toMatchObject({ calls: [], held: 0 });
  });
});
