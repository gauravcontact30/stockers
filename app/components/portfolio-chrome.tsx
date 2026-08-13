"use client";

import type { ReactNode } from "react";

/**
 * The shared surface of the Portfolio workspace.
 *
 * Six tabs were each about to grow their own card border, their own field height and their own
 * eyebrow label, and they would have drifted apart within a week. These are the tokens the whole
 * section is drawn from, in one place, so a change to the card shadow is one edit rather than six.
 */

export const CARD =
  "rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.5)] transition-colors dark:border-slate-800 dark:bg-slate-900";

export const FIELD =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

export const LABEL = "text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

export const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400";

/** A section heading with its explanatory line, used at the top of every tab. */
export function PanelHeading({ title, blurb, aside }: { title: string; blurb: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{blurb}</p>
      </div>
      {aside}
    </div>
  );
}

/** One measured figure, with the label under it rather than over it — the number leads. */
export function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <p className={`text-xl font-bold tabular-nums ${tone || "text-slate-900 dark:text-white"}`}>{value}</p>
      <p className={`mt-1 ${LABEL}`}>{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

/** The state every tab shares when the book is empty: nothing to measure, and why. */
export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      {children}
    </p>
  );
}
