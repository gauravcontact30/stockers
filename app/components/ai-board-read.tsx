"use client";

import { useEffect, useState } from "react";
import type { BoardBrief, BoardRead } from "../lib/board-read";

/**
 * The AI's read of the board underneath it.
 *
 * The verdict panel answers "what about these stocks"; several sections aren't stock lists, and
 * this answers the question they do raise — what is this board telling me? The brief is built from
 * the figures the section has already rendered, so the read can never describe a market the
 * reader isn't looking at.
 */
export function AiBoardRead({ feature, brief }: { feature: string; brief: BoardBrief | null }) {
  const [read, setRead] = useState<BoardRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-asked only when the figures themselves change, not on every render of the parent.
  const key = brief ? JSON.stringify(brief) : "";

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/ai/board-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feature, brief: JSON.parse(key) }),
        });
        if (!response.ok) throw new Error("Board read failed");

        const data = await response.json();
        if (cancelled) return;
        setRead(data.read ?? null);
        setError(null);
      } catch {
        if (!cancelled) setError("The AI desk couldn't read this board right now.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [feature, key]);

  if (!key) return null;

  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-4 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-950/40">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400">
        AI read of this board
      </p>

      {error && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>}

      {!read && !error && (
        <div className="mt-2 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-emerald-100 dark:bg-slate-800" />
          <div className="h-3 w-full animate-pulse rounded-full bg-emerald-50 dark:bg-slate-800/70" />
        </div>
      )}

      {read && (
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
          <p className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500">
            {read.source === "ai"
              ? "Written by AI agent over this board's measured figures"
              : "Composed from this board's figures (no AI key configured)"}{" "}
            · not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
