// One OpenRouter client for the whole application.
//
// Reads OPENROUTER_API_KEY. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

import { appOrigin } from "./app-origin";
import { recordAiCall } from "./ai-telemetry";
import type { AiOutcome } from "./ai-usage-report";

// ---------------------------------------------------------------------------
// Why this exists
// ---------------------------------------------------------------------------
//
// There were nine copies of the same forty lines — in `board-read`, `cache-advisor`,
// `daily-predictions`, `market-intel`, `market-news` (twice), `market-pulse`, `stock-analysis`,
// `stock-compare` and `stock-verdicts`. Every one of them built the same headers, sent the same
// shape of body, used the same 25-second timeout, threw on a non-2xx, caught it, wrote the error
// to `console.error` and returned null so the caller could compose a read from the figures instead.
//
// Nine copies of a fallback path is a tolerable amount of duplication. Nine copies of a fallback
// path that *records nothing* is not, because it made the single most important question about
// this product unanswerable: is the model actually writing these reads, or has every panel been
// quietly composing its own for the last three hours? The app degrades so gracefully that a total
// OpenRouter outage is invisible from every screen in it.
//
// So the duplication is gone and, more to the point, every call now leaves a record. See
// `./ai-usage-report` for what is done with them.
//
// ---------------------------------------------------------------------------
// Usage accounting
// ---------------------------------------------------------------------------
//
// The request asks OpenRouter to report what the call cost (`usage: { include: true }`, and
// `stream_options` for the streamed variant). Cost is read from that reply rather than estimated
// from a table of per-model prices: such a table is wrong the first time a model is repriced and
// nobody notices, and a spend figure that is quietly wrong is worse than no spend figure. When the
// reply carries no usage the record says so — as null, never as a zero that would read as a call
// that cost nothing.

/** The default when OPENROUTER_MODEL is unset. Unchanged from the nine call sites this replaces. */
export const FALLBACK_MODEL = "openai/gpt-4.1-mini";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * How long to wait for a completion.
 *
 * Every call site used 25 seconds, so that is what this is. It is long for a web request and right
 * for this one: the alternative to waiting is the composed read, and a reader would rather have
 * the written one a little late.
 */
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Read per call rather than captured at module load.
 *
 * The call sites this replaces each froze the model into a `const` when their module was first
 * imported, which meant the value depended on import order relative to environment loading and
 * could not be changed by a test without resetting modules.
 */
export function aiModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || FALLBACK_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export type ChatOptions = {
  /**
   * Which surface is asking.
   *
   * Used for two things: the `X-Title` OpenRouter shows in its own activity log, and the
   * attribution on the telemetry record. One string for both, so a feature added tomorrow cannot
   * appear under one name upstream and another on the dashboard.
   */
  feature: string;
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
};

/** What OpenRouter reports about what a call consumed. Every field may be absent. */
export type UsagePayload = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  cost?: unknown;
};

/**
 * The usage block out of one streamed SSE payload, or null when it carries none.
 *
 * A stream reports what it consumed in a final chunk after the content is finished, so a caller
 * that only extracts text deltas would leave every streamed call with no tokens and no cost on it.
 * The caller keeps the last one it sees and hands it to `settle`.
 */
export function usageFromStreamPayload(payload: string): UsagePayload | null {
  try {
    const parsed = JSON.parse(payload) as { usage?: UsagePayload };
    return parsed.usage && typeof parsed.usage === "object" ? parsed.usage : null;
  } catch {
    // A payload split across chunks is not an error worth surfacing; the next one carries it.
    return null;
  }
}

type CompletionPayload = {
  choices?: { message?: { content?: unknown } }[];
  usage?: UsagePayload;
};

function usageOf(usage: UsagePayload | undefined) {
  return {
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    costUsd: usage?.cost,
  };
}

function bodyFor(options: ChatOptions, stream: boolean) {
  return {
    model: options.model ?? aiModel(),
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    // Ask for the cost of the call back. See the header.
    usage: { include: true },
  };
}

function headersFor(options: ChatOptions): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": appOrigin(),
    "X-Title": `stockers-${options.feature}`,
  };
}

/**
 * The first JSON object embedded in a model's reply, or null.
 *
 * Five of the call sites this replaces ran the same regex against the completion because a model
 * asked for "JSON only" will still occasionally wrap it in prose or a fenced code block. Kept as
 * one function so the leniency is identical everywhere rather than re-decided per feature.
 */
export function extractJsonObject(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Asks the model and hands back whatever `parse` makes of the reply.
 *
 * `parse` is taken as an argument rather than the raw text being returned, so that this function
 * knows whether the reply was *usable* — a model that answers promptly with prose where an object
 * was asked for is a failure with exactly the same consequence for the reader as a 500, and an
 * operator watching only HTTP status would never see it. Returning null from `parse` records the
 * call as `unusable`.
 *
 * Never throws. Every path returns null and lets the caller compose its own read, which is the
 * behaviour all nine call sites already had.
 */
export async function chatJson<T>(options: ChatOptions & { parse: (text: string) => T | null }): Promise<T | null> {
  const model = options.model ?? aiModel();

  if (!aiConfigured()) {
    recordAiCall({ feature: options.feature, model: null, outcome: "unconfigured" });
    return null;
  }

  const started = Date.now();
  let status: number | null = null;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: headersFor(options),
      body: JSON.stringify(bodyFor(options, false)),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    status = response.status;
    if (!response.ok) throw new Error(`OpenRouter responded with ${response.status}`);

    const payload = (await response.json()) as CompletionPayload;
    const text = typeof payload.choices?.[0]?.message?.content === "string" ? payload.choices[0].message.content : "";
    const parsed = text ? options.parse(text) : null;

    recordAiCall({
      feature: options.feature,
      model,
      // The reply arrived and was billed either way, so an unusable one is still recorded with its
      // duration and its cost. It is the difference between the two counts that is the finding.
      outcome: parsed === null ? "unusable" : "ok",
      status,
      ms: Date.now() - started,
      ...usageOf(payload.usage),
    });

    return parsed;
  } catch (error) {
    recordAiCall({
      feature: options.feature,
      model,
      outcome: "failed",
      status,
      ms: Date.now() - started,
      error,
    });
    // Kept, because it is the only place the underlying cause is visible at all. The dashboard
    // shows that a call failed and its clipped message; the stack lives here.
    console.error(`openrouter(${options.feature}):`, error);
    return null;
  }
}

/**
 * A streamed completion, together with the handle that closes its telemetry record.
 *
 * A stream cannot be recorded when it is opened: at that moment nothing is known but the status,
 * and the interesting outcomes — a stream that ends having produced nothing usable, one that is cut
 * off mid-answer — happen later, in the caller's read loop. So the record is written by `settle`,
 * which the caller invokes once it knows what it ended up with.
 */
export type StreamHandle = {
  response: Response;
  /**
   * Closes the record for this call. Safe to invoke more than once; only the first is written, so a
   * caller with several exit paths does not have to track whether it has already settled.
   */
  settle: (outcome: AiOutcome, usage?: UsagePayload) => void;
};

/**
 * Opens a streamed completion, or returns null.
 *
 * Null covers both "no key" and "the request failed", each of which is recorded here — the caller
 * gets a single falsy answer to branch on, as it did before, and the distinction survives in the
 * telemetry where it is actually useful.
 */
export async function chatStream(options: ChatOptions): Promise<StreamHandle | null> {
  const model = options.model ?? aiModel();

  if (!aiConfigured()) {
    recordAiCall({ feature: options.feature, model: null, outcome: "unconfigured", streamed: true });
    return null;
  }

  const started = Date.now();
  let status: number | null = null;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: headersFor(options),
      body: JSON.stringify(bodyFor(options, true)),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    status = response.status;
    if (!response.ok || !response.body) throw new Error(`OpenRouter responded with ${response.status}`);

    let settled = false;

    return {
      response,
      settle: (outcome, usage) => {
        if (settled) return;
        settled = true;
        recordAiCall({
          feature: options.feature,
          model,
          outcome,
          status,
          // Time to the end of the stream, not to the first token: this is the figure that decides
          // whether the panel finished writing itself before the reader gave up on it.
          ms: Date.now() - started,
          streamed: true,
          ...usageOf(usage),
        });
      },
    };
  } catch (error) {
    recordAiCall({
      feature: options.feature,
      model,
      outcome: "failed",
      status,
      ms: Date.now() - started,
      streamed: true,
      error,
    });
    console.error(`openrouter(${options.feature}):`, error);
    return null;
  }
}
