// Recording what the model did — the storage half of `./ai-usage-report`.
//
// Reads nothing secret, but touches the Supabase service-role client. The `server-only` import
// makes a client component that pulls this in a build error rather than a bundle that fails at
// runtime; the admin panel imports its types from `./ai-usage-report`, which is pure.
import "server-only";

import { randomBytes } from "node:crypto";
import { istDay } from "./analytics";
import type { AiCallRecord, AiOutcome } from "./ai-usage-report";
import { isMissingTable, supabaseConfigured, supabaseRequest } from "./supabase";

// ---------------------------------------------------------------------------
// Two stores, and why the memory one is not a fallback
// ---------------------------------------------------------------------------
//
// `./analytics` picks one backend or the other. This module writes to *both*, and the reason is
// that the two answer different questions.
//
// The ring buffer below is this process's own recent history. It needs no schema, no configuration
// and no round trip, so it works on a fresh clone, on a deployment whose migration has not been
// applied, and — importantly — it is the only store that is guaranteed to be there at the moment
// something goes wrong. A telemetry system whose own write depends on the database being healthy
// is a telemetry system that goes quiet exactly when it is needed.
//
// Supabase, when the table exists, is the durable half: it survives a restart and, on a serverless
// host, it is the only thing that can see the calls the *other* instances made. The report says
// which of the two it read from, because "37 calls today" from one instance's memory and the same
// figure from Postgres mean quite different things.

/**
 * How many calls this process keeps in memory.
 *
 * Generous, because the records are small — a few hundred bytes each, so this is well under a
 * megabyte — and because the window it has to cover is a whole day of an admin's attention rather
 * than a request. Bounded all the same: an unbounded array on a long-lived server process is a
 * leak whatever the element size.
 */
export const MEMORY_CAPACITY = 2_000;

/** The most rows a single read will pull, however wide a window is asked for. */
const MAX_ROWS = 5_000;

/** Newest last, so the oldest is always at index 0 and eviction is a `shift`. */
let ring: AiCallRecord[] = [];

/**
 * Whether the Supabase table has already told us it does not exist.
 *
 * The migration for `ai_calls` is new, so a deployment that has not applied it is an expected
 * state rather than a fault. Without this latch every model call would make a round trip to
 * discover that again, and every one would log — turning a missing table into a steady stream of
 * noise on the very deployments least likely to be watching for it.
 */
let tableMissing = false;

/** Exposed for tests, which must not inherit records from the suite before them. */
export function resetAiTelemetry(): void {
  ring = [];
  tableMissing = false;
}

/** How many records this process is currently holding. */
export function heldInMemory(): number {
  return ring.length;
}

function clipError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = value instanceof Error ? value.message : String(value);
  const trimmed = text.trim();
  // Clipped, and never a request or response body: a failed completion's body can contain the
  // prompt, and the prompt can contain whatever a reader typed into the intel search box.
  return trimmed ? trimmed.slice(0, 200) : null;
}

/** A number from an upstream payload, or null — never a zero standing in for "not reported". */
function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type RecordAiCallInput = {
  feature: string;
  model: string | null;
  outcome: AiOutcome;
  status?: number | null;
  ms?: number | null;
  promptTokens?: unknown;
  completionTokens?: unknown;
  costUsd?: unknown;
  streamed?: boolean;
  error?: unknown;
};

/** Builds the record without storing it, so the shaping rules can be tested on their own. */
export function buildAiCallRecord(input: RecordAiCallInput, now = new Date()): AiCallRecord {
  return {
    id: `ai_${now.getTime().toString(36)}_${randomBytes(4).toString("hex")}`,
    at: now.toISOString(),
    day: istDay(now),
    feature: input.feature,
    model: input.model,
    outcome: input.outcome,
    status: finiteOrNull(input.status),
    ms: finiteOrNull(input.ms),
    promptTokens: finiteOrNull(input.promptTokens),
    completionTokens: finiteOrNull(input.completionTokens),
    costUsd: finiteOrNull(input.costUsd),
    streamed: input.streamed === true,
    error: clipError(input.error),
  };
}

/** One row of `public.ai_calls`, in the column names Postgres actually has. */
type CallRow = {
  id: string;
  at: string;
  day: string;
  feature: string;
  model: string | null;
  outcome: string;
  status: number | null;
  ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  streamed: boolean | null;
  error: string | null;
};

function toRow(call: AiCallRecord): CallRow {
  return {
    id: call.id,
    at: call.at,
    day: call.day,
    feature: call.feature,
    model: call.model,
    outcome: call.outcome,
    status: call.status,
    ms: call.ms,
    prompt_tokens: call.promptTokens,
    completion_tokens: call.completionTokens,
    cost_usd: call.costUsd,
    streamed: call.streamed,
    error: call.error,
  };
}

function fromRow(row: CallRow): AiCallRecord {
  return {
    id: row.id,
    at: row.at,
    day: row.day,
    feature: row.feature,
    model: row.model,
    outcome: row.outcome as AiOutcome,
    status: finiteOrNull(row.status),
    ms: finiteOrNull(row.ms),
    promptTokens: finiteOrNull(row.prompt_tokens),
    completionTokens: finiteOrNull(row.completion_tokens),
    costUsd: finiteOrNull(row.cost_usd),
    streamed: row.streamed === true,
    error: row.error ?? null,
  };
}

/**
 * Records one model call, or quietly does nothing.
 *
 * Never throws and never reports failure, for the same reason `recordEvent` does not: the callers
 * are on the request path of a panel somebody is waiting for, and none of them should have to
 * decide what to do about a telemetry row that did not land. The in-memory write happens first and
 * unconditionally, so a database that is refusing writes costs the durability of the record and
 * not the record itself.
 *
 * Returns after the memory write. The Supabase insert is deliberately not awaited by the caller —
 * see `recordAiCall` below — because adding a round trip to Postgres onto the end of every model
 * call would make the observability cost the latency it is there to measure.
 */
export function recordAiCall(input: RecordAiCallInput): void {
  let call: AiCallRecord;

  try {
    call = buildAiCallRecord(input);
  } catch (error) {
    console.error("ai-telemetry: could not build record", error);
    return;
  }

  ring.push(call);
  if (ring.length > MEMORY_CAPACITY) ring.splice(0, ring.length - MEMORY_CAPACITY);

  if (!supabaseConfigured() || tableMissing) return;

  void supabaseRequest({ method: "POST", path: "ai_calls", body: toRow(call) }).catch((error: unknown) => {
    // A deployment that has not applied the migration latches off rather than retrying per call.
    if (isMissingTable(error)) {
      tableMissing = true;
      return;
    }
    console.error("ai-telemetry: could not persist call", error);
  });
}

/** Which store the report was read from, so the panel can say what its figures cover. */
export type TelemetrySource = { backend: "supabase" | "memory"; processLocal: boolean; held: number };

/**
 * Every recorded call on or after `fromDay` (an IST date), together with where they came from.
 *
 * Unlike `recordAiCall` this can fail — but it does not throw, because the only thing it could do
 * on a failure is return the memory ring, which is a real answer rather than a consolation. A
 * report built from one process's records is clearly labelled as such and is far more use to an
 * operator than a 500.
 */
export async function listAiCalls(fromDay: string): Promise<{ calls: AiCallRecord[] } & TelemetrySource> {
  const local = ring.filter((call) => call.day >= fromDay);

  if (supabaseConfigured() && !tableMissing) {
    try {
      const rows = await supabaseRequest<CallRow>({
        method: "GET",
        path: `ai_calls?day=gte.${encodeURIComponent(fromDay)}&select=*&order=at.desc&limit=${MAX_ROWS}`,
      });
      return { calls: rows.map(fromRow), backend: "supabase", processLocal: false, held: rows.length };
    } catch (error) {
      if (isMissingTable(error)) tableMissing = true;
      else console.error("ai-telemetry: could not read calls", error);
    }
  }

  return { calls: local, backend: "memory", processLocal: true, held: ring.length };
}
