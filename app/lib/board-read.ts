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

const SYSTEM_PROMPT = [
  "You are stockers, an AI market analyst writing for Indian investors.",
  "You are given one board of already-measured figures and the question a reader has of it.",
  "Answer that question in a headline of at most twelve words, then two to four short points.",
  "Use only the figures you are given: never invent a number, a company, or a direction of travel.",
  "Say what the figures mean for a reader's decision, not what they are — they can already see them.",
  'Return JSON only: {"headline":"...","points":["...","..."]}',
].join(" ");

// One board's read is the same for everyone looking at it, and the underlying feeds are
// themselves cached for minutes, so re-asking the model per visitor would only spend money.
const READ_TTL_MS = 10 * 60_000;
const cache = new Map<string, { value: BoardRead; expiresAt: number }>();

function briefKey(brief: BoardBrief): string {
  return JSON.stringify(brief);
}

async function narrate(brief: BoardBrief): Promise<BoardRead | null> {
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
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`OpenRouter responded with ${response.status}`);

    const payload = await response.json();
    const match = (payload.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { headline?: unknown; points?: unknown };
    const headline = clip(parsed.headline);
    const points = (Array.isArray(parsed.points) ? parsed.points : [])
      .map((point) => clip(point, 240))
      .filter(Boolean)
      .slice(0, MAX_POINTS);

    if (!headline || points.length === 0) return null;

    return { headline, points, source: "ai" };
  } catch (error) {
    console.error(error);
    return null;
  }
}

/** The AI read of a board, falling back to the composed one whenever the model can't be used. */
export async function readBoard(brief: BoardBrief): Promise<BoardRead> {
  const key = briefKey(brief);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = (await narrate(brief)) ?? composeRead(brief);
  cache.set(key, { value, expiresAt: Date.now() + READ_TTL_MS });
  return value;
}
