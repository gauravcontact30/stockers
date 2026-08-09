"use client";

import { useEffect, useState } from "react";
import type { BoardBrief, BoardRead, ReadFrame } from "../lib/board-read";

/**
 * The AI's read of the board underneath it.
 *
 * The verdict panel answers "what about these stocks"; several sections aren't stock lists, and
 * this answers the question they do raise — what is this board telling me? The brief is built from
 * the figures the section has already rendered, so the read can never describe a market the
 * reader isn't looking at.
 *
 * The endpoint streams newline-delimited frames rather than answering with one JSON object, so the
 * headline appears the moment the model has written it and each point lands underneath as it comes.
 * Before this, the panel held a pulsing placeholder for the entire completion and then painted
 * everything at once.
 */

/** One NDJSON line, if it is a frame we know what to do with. */
export function parseFrame(line: string): ReadFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Partial<ReadFrame>;
    if (parsed.type === "headline" || parsed.type === "point") {
      return typeof parsed.text === "string" && parsed.text ? { type: parsed.type, text: parsed.text } : null;
    }
    if (parsed.type === "done") {
      return { type: "done", source: parsed.source === "ai" ? "ai" : "heuristic" };
    }
    return null;
  } catch {
    // A line that isn't JSON is a truncated frame, not something to show the reader.
    return null;
  }
}

/** The read so far, after applying one more frame. */
export function applyFrame(read: BoardRead | null, frame: ReadFrame): BoardRead {
  const current: BoardRead = read ?? { headline: "", points: [], source: "heuristic" };

  if (frame.type === "headline") return { ...current, headline: frame.text };
  if (frame.type === "point") return { ...current, points: [...current.points, frame.text] };
  return { ...current, source: frame.source };
}

export function AiBoardRead({ feature, brief }: { feature: string; brief: BoardBrief | null }) {
  const [read, setRead] = useState<BoardRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True from the first frame until the stream closes, so the panel can show that more is coming
  // rather than looking like a finished read that happens to be short.
  const [writing, setWriting] = useState(false);

  // Re-asked only when the figures themselves change, not on every render of the parent.
  const key = brief ? JSON.stringify(brief) : "";

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    const controller = new AbortController();

    const apply = (line: string) => {
      const frame = parseFrame(line);
      if (frame && !cancelled) setRead((current) => applyFrame(current, frame));
    };

    (async () => {
      try {
        const response = await fetch("/api/ai/board-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feature, brief: JSON.parse(key) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Board read failed");

        if (!cancelled) {
          setRead(null);
          setError(null);
          setWriting(true);
        }

        // A body stream is the normal path. Some environments — a proxy that buffers, a test
        // double — hand back a whole body instead, and the same line parsing covers both.
        if (!response.body) {
          for (const line of (await response.text()).split("\n")) apply(line);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Everything up to the last newline is whole frames; what follows it is a frame still
          // being written, which stays in the buffer until the next chunk completes it.
          const boundary = buffer.lastIndexOf("\n");
          if (boundary !== -1) {
            for (const line of buffer.slice(0, boundary).split("\n")) apply(line);
            buffer = buffer.slice(boundary + 1);
          }
        }

        apply(buffer);
      } catch {
        if (!cancelled) setError("The AI desk couldn't read this board right now.");
      } finally {
        if (!cancelled) setWriting(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [feature, key]);

  if (!key) return null;

  const hasRead = read !== null && read.headline !== "";

  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-4 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-950/40">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400">
        AI read of this board
      </p>

      {error && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>}

      {!hasRead && !error && (
        <div className="mt-2 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-emerald-100 dark:bg-slate-800" />
          <div className="h-3 w-full animate-pulse rounded-full bg-emerald-50 dark:bg-slate-800/70" />
        </div>
      )}

      {hasRead && (
        <>
          <p className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white">{read.headline}</p>
          <ul className="mt-2 space-y-1.5">
            {read.points.map((point) => (
              <li key={point} className="flex gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                {point}
              </li>
            ))}
          </ul>

          {/* While the model is still writing, the panel says so rather than presenting a partial
              read as the finished one. */}
          {writing ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Still writing…
            </p>
          ) : (
            <p className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500">
              {read.source === "ai"
                ? "Written by AI agent over this board's measured figures"
                : "Composed from this board's figures (no AI key configured)"}{" "}
              · not investment advice.
            </p>
          )}
        </>
      )}
    </div>
  );
}
