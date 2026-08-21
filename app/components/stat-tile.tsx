"use client";

/**
 * One period against the one before it, as a direction and a phrase.
 *
 * Lives here rather than on the analytics page it was written for, because the tile below is what
 * renders it and putting it the other way round makes the two files import each other. "New" for a
 * figure that was zero last time: a percentage against nothing is either infinity or a divide by
 * zero, and neither is a thing to print on a dashboard.
 *
 * `period` names what the comparison is against, because the caller is the only thing that knows.
 * Yesterday is the default and covers every daily tile; a rolling thirty-day figure compared to the
 * thirty days before it said "vs yesterday" for as long as the phrase was baked in here, which is
 * the kind of wrong nobody reads twice.
 */
export function deltaOf(now: number, before: number, period = "yesterday"): { direction: "up" | "down" | "flat"; text: string } {
  if (before === 0) return now === 0 ? { direction: "flat", text: "no change" } : { direction: "up", text: "new" };
  if (now === before) return { direction: "flat", text: "no change" };

  const change = Math.round(((now - before) / before) * 100);
  return { direction: now > before ? "up" : "down", text: `${now > before ? "+" : "−"}${Math.abs(change)}% vs ${period}` };
}

/**
 * One figure on an admin panel: the number, what it counts, and how it is moving.
 *
 * Lifted out of the super admin dashboard so the live-users panel can use the same tile rather
 * than growing a second one that drifts a pixel and a font-weight away from it. Nothing here knows
 * what it is counting — the caller brings the number, the label and the colour.
 */
export function StatTile({
  label,
  value,
  tone,
  hint,
  delta,
}: {
  label: string;
  value: number | string;
  tone: string;
  hint?: string;
  /** This period against the last. Rendered as a direction, not another bare number. */
  delta?: { now: number; before: number; period?: string };
}) {
  const change = delta ? deltaOf(delta.now, delta.before, delta.period) : null;
  const changeTone =
    change?.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : change?.direction === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-400 dark:text-slate-500";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      {change && <p className={`mt-1 text-[11px] font-semibold ${changeTone}`}>{change.text}</p>}
      {hint && !change && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}
