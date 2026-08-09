// The written read that sits on top of a board of numbers.
//
// `stock-verdicts.ts` answers "what about this stock"; several dashboard sections aren't lists of
// stocks at all — sectoral indices, a dividend calendar, an IPO pipeline, a shelf of ETFs — and
// the question a reader has there is "so what does this board say?". That is what this answers.
//
// The same honesty contract applies as everywhere else in the app: the figures are measured, the
// model only writes prose over figures it is handed, and it is told in as many words not to invent
// any. With no key configured the read is composed from those same figures directly, and says so.

export type BoardFact = { label: string; value: string };

export type BoardBrief = {
  /** What the board is — "every NSE sectoral index, ranked by today's move". */
  subject: string;
  /** The question the reader actually has of it. */
  question: string;
  /** The board's headline figures, already formatted for display. */
  facts: BoardFact[];
  /** Its standout rows, as sentences: the leading sector, the biggest issue, the fattest dividend. */
  highlights: string[];
};

export type BoardRead = {
  headline: string;
  points: string[];
  source: "ai" | "heuristic";
};

// A brief arrives from the browser, so it is clamped before it reaches a model: this is the
// section's own rendered figures coming back to be narrated, not an open prompt channel.
const MAX_FACTS = 12;
const MAX_HIGHLIGHTS = 8;
const MAX_TEXT = 200;
const MAX_POINTS = 4;

function clip(value: unknown, limit = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** A brief we are willing to send on, or null when the payload isn't one. */
export function parseBrief(value: unknown): BoardBrief | null {
  const raw = value as Partial<BoardBrief> | null | undefined;
  const subject = clip(raw?.subject);
  const question = clip(raw?.question);
  if (!subject || !question) return null;

  const facts = (Array.isArray(raw?.facts) ? raw.facts : [])
    .slice(0, MAX_FACTS)
    .map((fact) => ({ label: clip((fact as BoardFact)?.label, 60), value: clip((fact as BoardFact)?.value, 60) }))
    .filter((fact) => fact.label && fact.value);

  const highlights = (Array.isArray(raw?.highlights) ? raw.highlights : [])
    .slice(0, MAX_HIGHLIGHTS)
    .map((highlight) => clip(highlight))
    .filter(Boolean);

  if (facts.length === 0 && highlights.length === 0) return null;

  return { subject, question, facts, highlights };
}

/**
 * The read when there is no AI key: the board's own figures, arranged into the same shape the
 * model would have returned. Every word of it is traceable to a number on screen.
 */
export function composeRead(brief: BoardBrief): BoardRead {
  const headline = brief.facts.length
    ? `${brief.facts[0].label}: ${brief.facts[0].value}`
    : brief.highlights[0];

  const points = [...brief.highlights, ...brief.facts.slice(1).map((fact) => `${fact.label}: ${fact.value}`)].slice(
    0,
    MAX_POINTS,
  );

  return { headline, points, source: "heuristic" };
}

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

// The reply is asked for as lines rather than as a JSON object so it can be shown as it arrives.
// Half a JSON object is not renderable — it parses only once the closing brace lands, which means
// the reader watches a spinner for the whole completion and then gets everything at once. A line
// is complete the moment its newline arrives, so the headline can be on screen while the model is
// still writing the points underneath it.
const SYSTEM_PROMPT = [
  "You are stockers, an AI market analyst writing for Indian investors.",
  "You are given one board of already-measured figures and the question a reader has of it.",
  "Answer that question in a headline of at most twelve words, then two to four short points.",
  "Use only the figures you are given: never invent a number, a company, or a direction of travel.",
  "Say what the figures mean for a reader's decision, not what they are — they can already see them.",
  "Write the headline on the first line, prefixed exactly with 'HEADLINE: '.",
  "Write each point on its own line after it, prefixed exactly with '- '.",
  "Write nothing else: no preamble, no JSON, no closing remark.",
].join(" ");

// One board's read is the same for everyone looking at it, and the underlying feeds are
// themselves cached for minutes, so re-asking the model per visitor would only spend money.
const READ_TTL_MS = 10 * 60_000;

export function briefKey(brief: BoardBrief): string {
  return JSON.stringify(brief);
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * One piece of a read, as it becomes available.
 *
 * The panel used to sit on a pulsing placeholder for the entire model call — twenty-odd seconds in
 * the worst case — and then paint everything at once. These frames let it paint the headline the
 * moment the model has finished writing it, and each point as it lands.
 */
export type ReadFrame =
  | { type: "headline"; text: string }
  | { type: "point"; text: string }
  | { type: "done"; source: BoardRead["source"] };

/** The frames a finished read decomposes into — used for cache hits and for the composed read. */
export function framesOf(read: BoardRead): ReadFrame[] {
  return [
    { type: "headline", text: read.headline },
    ...read.points.map((text): ReadFrame => ({ type: "point", text })),
    { type: "done", source: read.source },
  ];
}

/** A line of model output, turned into a frame — or null when it carries nothing usable. */
export function frameFromLine(line: string): ReadFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const headline = trimmed.match(/^HEADLINE:\s*(.+)$/i);
  if (headline) {
    const text = clip(headline[1]);
    return text ? { type: "headline", text } : null;
  }

  const point = trimmed.match(/^[-*•]\s*(.+)$/);
  if (point) {
    const text = clip(point[1], 240);
    return text ? { type: "point", text } : null;
  }

  return null;
}

/**
 * The `data:` payloads out of a Server-Sent Events chunk, in order.
 *
 * OpenRouter streams SSE: `data: {json}` separated by blank lines, closed by `data: [DONE]`. A
 * chunk boundary can land anywhere, including mid-line, so the caller keeps the remainder and
 * feeds it back in with the next chunk — that remainder is what the second half of the tuple is.
 */
export function readSseChunk(buffer: string): { payloads: string[]; rest: string } {
  const lines = buffer.split("\n");
  // The last element is whatever came after the final newline: an incomplete line, or "".
  const rest = lines.pop() ?? "";

  const payloads: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload && payload !== "[DONE]") payloads.push(payload);
  }

  return { payloads, rest };
}

/** The text delta out of one OpenRouter SSE payload, or "" when it carries none. */
export function deltaOf(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: unknown } }[] };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    // A payload split across chunks is not an error worth surfacing; the next one carries it.
    return "";
  }
}

async function openRouterStream(brief: BoardBrief): Promise<Response | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const facts = brief.facts.map((fact) => `${fact.label}: ${fact.value}`).join("\n");
  const highlights = brief.highlights.map((highlight) => `- ${highlight}`).join("\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers-board-read",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Board: ${brief.subject}\nQuestion: ${brief.question}\n\nFigures:\n${facts}\n\nStandouts:\n${highlights}`,
          },
        ],
        temperature: 0.5,
        stream: true,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok || !response.body) throw new Error(`OpenRouter responded with ${response.status}`);
    return response;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * The read of a board, frame by frame.
 *
 * A cached read yields its frames immediately, so the common case is still one round trip with no
 * model call at all. Otherwise the model is streamed and each completed line is handed on as it
 * lands. Whatever the model produced is cached at the end, and anything short of a usable read —
 * no key, a refused request, a reply in an unexpected shape — falls back to the composed read
 * rather than leaving the panel empty.
 */
export async function* streamBoardRead(brief: BoardBrief): AsyncGenerator<ReadFrame> {
  const hit = readCache.peek(brief);
  if (hit) {
    yield* framesOf(hit);
    return;
  }

  const response = await openRouterStream(brief);
  if (!response?.body) {
    const composed = composeRead(brief);
    readCache.put(brief, composed);
    yield* framesOf(composed);
    return;
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let headline = "";
  const points: string[] = [];

  /**
   * Turns the complete lines sitting in `buffer` into frames.
   *
   * Mid-stream the final element is a line the model has not finished writing, so it goes back into
   * the buffer to be completed by the next chunk. On the flush at the end of the stream there is
   * nothing more coming, so it is treated as complete like the rest.
   */
  const drain = function* (flush: boolean): Generator<ReadFrame> {
    const lines = buffer.split("\n");
    buffer = flush ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const frame = frameFromLine(line);
      if (!frame) continue;
      if (frame.type === "headline" && !headline) {
        headline = frame.text;
        yield frame;
      } else if (frame.type === "point" && points.length < MAX_POINTS) {
        points.push(frame.text);
        yield frame;
      }
    }
  };

  let sse = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      sse += decoder.decode(value, { stream: true });
      const { payloads, rest } = readSseChunk(sse);
      sse = rest;

      for (const payload of payloads) buffer += deltaOf(payload);
      yield* drain(false);
    }
    // The model's last line usually arrives without a trailing newline, so it is still in the
    // buffer when the stream closes.
    if (buffer.trim()) yield* drain(true);
  } catch (error) {
    console.error(error);
  }

  // A reply that produced nothing usable is not worth caching as the board's read; the figures
  // themselves always say something, so they are what the reader gets instead.
  if (!headline || points.length === 0) {
    const composed = composeRead(brief);
    readCache.put(brief, composed);
    yield* framesOf(composed);
    return;
  }

  const read: BoardRead = { headline, points, source: "ai" };
  readCache.put(brief, read);
  yield { type: "done", source: "ai" };
}

/**
 * Finished reads, keyed by the figures underneath them.
 *
 * This is a plain bounded store rather than one of `./cache`'s loaders because the value is
 * produced by a stream rather than by a function that can be re-run for it: the streaming path
 * writes the read once it has finished assembling it.
 */
const readCache = (() => {
  const CAPACITY = 200;
  const entries = new Map<string, { value: BoardRead; expiresAt: number }>();

  return {
    peek(brief: BoardBrief): BoardRead | null {
      const hit = entries.get(briefKey(brief));
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        entries.delete(briefKey(brief));
        return null;
      }
      return hit.value;
    },
    put(brief: BoardBrief, value: BoardRead): void {
      if (entries.size >= CAPACITY) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(briefKey(brief), { value, expiresAt: Date.now() + READ_TTL_MS });
    },
    clear(): void {
      entries.clear();
    },
  };
})();

/** Drops every cached read. Called when the AI cache tag is revalidated. */
export function clearBoardReads(): void {
  readCache.clear();
}

/** The whole read at once, for callers that cannot consume a stream. */
export async function readBoard(brief: BoardBrief): Promise<BoardRead> {
  let headline = "";
  const points: string[] = [];
  let source: BoardRead["source"] = "heuristic";

  for await (const frame of streamBoardRead(brief)) {
    if (frame.type === "headline") headline = frame.text;
    else if (frame.type === "point") points.push(frame.text);
    else source = frame.source;
  }

  return headline ? { headline, points, source } : composeRead(brief);
}
